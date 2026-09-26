"""Capture or prepare a narrow correction; deploy only an explicitly named target.

Preparation and deployment require the exact reviewed SHA at clean local HEAD
and at the current branch's origin head. No environment, IAM or runtime flags are sent. The one approved configuration
change is getSmartZonePlan timeout=180s. Protected responses stay private.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import urllib.parse
import urllib.request
import zipfile

from deploy_campaign_planner_overlay import (GCLOUD, changed_configuration_fields, read,
                                             source_hashes, verify_source)
from deploy_mapping_qa_overlay import normalized_iam

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".firebase/scale-area-promotion"
TARGETS = ("getSmartZonePlan", "applySmartZonePlan", "getBusinessWorkspaceContext")
APPROVED_CANDIDATE = "609055095a104b602323f12a6b3353172ad297b9"
TOOLING = ("tools/prepare_scale_area_promotion.cjs", "tools/prepare_scale_area_promotion.test.cjs",
           "tools/deploy_scale_area_overlay.py", "tools/deploy_scale_area_overlay_test.py")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_new(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)


def command_json(command, output, message):
    result = subprocess.run(command, capture_output=True)
    if result.returncode:
        output.with_suffix(".log").write_bytes(result.stdout + b"\n" + result.stderr)
        raise RuntimeError(message + " See the private diagnostic; no automatic retry.")
    output.write_bytes(result.stdout)
    try:
        return read(output)
    except (ValueError, UnicodeError):
        raise RuntimeError("Invalid private metadata response; stopped.") from None


def describe(name, directory, label):
    return command_json([str(GCLOUD), "functions", "describe", name, "--gen2",
                         "--project=scaled-circle", "--region=us-east1", "--format=json"],
                        directory / (label + ".private.json"), "Function metadata could not be read.")


def iam(name, description, directory, label):
    service = description["serviceConfig"].get("service", "")
    match = re.fullmatch(r"projects/scaled-circle/locations/us-east1/services/([a-z0-9-]+)", service)
    if not match:
        raise RuntimeError("Service identity is outside the approved scope.")
    function_policy = command_json([str(GCLOUD), "functions", "get-iam-policy", name, "--gen2",
        "--project=scaled-circle", "--region=us-east1", "--format=json"],
        directory / (label + "-function.private.json"), "Function IAM could not be read.")
    service_policy = command_json([str(GCLOUD), "run", "services", "get-iam-policy", match.group(1),
        "--platform=managed", "--project=scaled-circle", "--region=us-east1", "--format=json"],
        directory / (label + "-service.private.json"), "Service IAM could not be read.")
    return {"service": service, "functionPolicy": function_policy, "servicePolicy": service_policy}


def candidate(source_sha):
    if source_sha != APPROVED_CANDIDATE:
        raise RuntimeError("Only the explicitly reviewed 609055 candidate is authorized.")
    def git(*args):
        result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True)
        if result.returncode:
            raise RuntimeError("Candidate Git verification failed; stopped.")
        return result.stdout.decode().strip()
    head = git("rev-parse", "HEAD")
    if git("status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("Checkout must be clean, including helper/docs edits and untracked files.")
    git("merge-base", "--is-ancestor", source_sha, head)
    changed = git("diff", "--name-only", source_sha, "--").splitlines()
    untracked = git("ls-files", "--others", "--exclude-standard").splitlines()
    allowed = lambda name: name in TOOLING or name.startswith("docs/") and name.endswith(".md")
    if any(not allowed(name) for name in changed + untracked):
        raise RuntimeError("Approved application source changed or has untracked additions; stopped.")
    branch = git("symbolic-ref", "--quiet", "--short", "HEAD")
    remote = git("ls-remote", "--exit-code", "--heads", "origin", "refs/heads/" + branch).splitlines()
    if remote != [head + "\trefs/heads/" + branch]:
        raise RuntimeError("Current tool/application HEAD is not the pushed origin branch head.")
    return branch


def validate_metadata(name, description):
    if description.get("name") != "projects/scaled-circle/locations/us-east1/functions/" + name:
        raise RuntimeError("Function identity is outside the approved scope.")
    if description.get("state") != "ACTIVE":
        raise RuntimeError("Function is not ACTIVE; stopped.")
    source = description.get("buildConfig", {}).get("source", {}).get("storageSource", {})
    if not all(source.get(key) for key in ("bucket", "object", "generation")):
        raise RuntimeError("A generation-pinned source archive is required.")
    return source


def extract_archive(archive, destination):
    destination.mkdir(exist_ok=False)
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            relative = Path(item.filename)
            if (relative.is_absolute() or item.filename.startswith("/") or ".." in relative.parts or ":" in item.filename
                    or "\\" in item.filename or (item.external_attr >> 16) & 0o170000 == 0o120000):
                raise RuntimeError("Archive contains an unsafe path or symlink.")
        bundle.extractall(destination)
    if not (destination / "index.js").is_file() or not (destination / "package-lock.json").is_file():
        raise RuntimeError("Expected deployed source/dependency lock is missing.")


def capture():
    # This is read-only cloud access; it deliberately does not require a final
    # candidate, since source review may still be in progress.
    STATE.mkdir(parents=True, exist_ok=True)
    if (STATE / "baseline-manifest.private.json").exists():
        raise RuntimeError("A correction baseline already exists; never overwrite it.")
    credential = subprocess.run([str(GCLOUD), "auth", "print-access-token"], capture_output=True)
    if credential.returncode:
        raise RuntimeError("Existing read-only source-download credential unavailable.")
    token = credential.stdout.decode().strip()
    entries = []
    for name in TARGETS:
        directory = STATE / "baselines" / name
        directory.mkdir(parents=True, exist_ok=False)
        original = describe(name, directory, "metadata")
        source = validate_metadata(name, original)
        policy = iam(name, original, directory, "capture-iam")
        write_new(directory / "iam-baseline.private.json", policy)
        url = ("https://storage.googleapis.com/download/storage/v1/b/" + urllib.parse.quote(source["bucket"], safe="")
               + "/o/" + urllib.parse.quote(source["object"], safe="") + "?alt=media&generation="
               + urllib.parse.quote(str(source["generation"]), safe=""))
        request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                archive = response.read()
        except Exception as error:
            raise RuntimeError("Pinned source download failed: " + type(error).__name__) from None
        archive_path = directory / "source.zip"
        archive_path.write_bytes(archive)
        extract_archive(archive_path, directory / "base")
        entry = {"name": name, "metadataFile": str(directory / "metadata.private.json"),
                 "metadataSha256": sha(directory / "metadata.private.json"),
                 "iamFile": str(directory / "iam-baseline.private.json"),
                 "iamSha256": sha(directory / "iam-baseline.private.json"),
                 "archive": str(archive_path), "archiveSha256": sha(archive_path),
                 "base": str(directory / "base"), "files": source_hashes(directory / "base"),
                 "liveSource": source}
        entries.append(entry)
        print(json.dumps({"function": name, "state": original["state"],
                          "revision": original["serviceConfig"].get("revision"),
                          "generationPinned": True, "configAndIamCaptured": True,
                          "sourceFiles": len(entry["files"])}), flush=True)
    write_new(STATE / "baseline-manifest.private.json", {"targets": TARGETS, "entries": entries})


def baselines():
    manifest = read(STATE / "baseline-manifest.private.json")
    if sorted(entry["name"] for entry in manifest["entries"]) != sorted(TARGETS):
        raise RuntimeError("Baseline target inventory differs from the approved three callables.")
    for entry in manifest["entries"]:
        for file_key, hash_key in (("metadataFile", "metadataSha256"), ("iamFile", "iamSha256"), ("archive", "archiveSha256")):
            if sha(Path(entry[file_key])) != entry[hash_key]:
                raise RuntimeError("Preserved baseline bytes changed; stopped.")
        verify_source(Path(entry["base"]), entry["files"])
        original = read(Path(entry["metadataFile"]))
        if validate_metadata(entry["name"], original) != entry["liveSource"]:
            raise RuntimeError("Baseline source generation disagrees with metadata.")
    return manifest["entries"]


def prepare(source_sha):
    branch = candidate(source_sha)
    manifest_path = STATE / "promotion-manifest.private.json"
    if manifest_path.exists():
        raise RuntimeError("A prepared Scale manifest already exists; never overwrite it.")
    entries = []
    for baseline in baselines():
        name = baseline["name"]
        output = STATE / "packages" / name
        result = subprocess.run(["node", str(ROOT / "tools/prepare_scale_area_promotion.cjs"), name,
            str(Path(baseline["base"])), str(output)], cwd=ROOT, capture_output=True)
        if result.returncode:
            (STATE / (name + "-prepare.private.log")).write_bytes(result.stdout + b"\n" + result.stderr)
            raise RuntimeError("Narrow Scale overlay failed; inspect private diagnostic.")
        result_data = json.loads(result.stdout)
        files = source_hashes(output)
        if result_data["files"] != files:
            raise RuntimeError("Overlay reported a different exact file inventory.")
        changed = sorted(key for key in set(files) | set(baseline["files"]) if files.get(key) != baseline["files"].get(key))
        if changed != result_data["changedFiles"]:
            raise RuntimeError("Overlay changed-file declaration differs from actual bytes.")
        entries.append({"name": name, "output": str(output), "files": files, "changedFiles": changed,
                        "sourceTreeSha256": hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
                        "overlayAudit": result_data["audit"], "baseline": baseline})
    write_new(manifest_path, {"sourceSha": source_sha, "branch": branch, "entries": entries,
        "toolingHashes": {name: sha(ROOT / name) for name in TOOLING}})
    print(json.dumps({"sourceSha": source_sha, "targets": [{"name": e["name"], "changedFiles": e["changedFiles"],
        "sourceTreeSha256": e["sourceTreeSha256"]} for e in entries]}), flush=True)


def load_entry(name, source_sha):
    baseline_entries = {entry["name"]: entry for entry in baselines()}
    manifest = read(STATE / "promotion-manifest.private.json")
    if manifest["sourceSha"] != source_sha or sorted(e["name"] for e in manifest["entries"]) != sorted(TARGETS):
        raise RuntimeError("Prepared candidate or target inventory differs from the reviewed request.")
    if manifest.get("toolingHashes") != {name: sha(ROOT / name) for name in TOOLING}:
        raise RuntimeError("Verified promotion tooling changed after preparation.")
    entry = next(entry for entry in manifest["entries"] if entry["name"] == name)
    if entry["baseline"] != baseline_entries[name]:
        raise RuntimeError("Prepared package and preserved baseline disagree.")
    verify_source(Path(entry["output"]), entry["files"])
    expected_tree = hashlib.sha256(json.dumps(entry["files"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if entry["sourceTreeSha256"] != expected_tree:
        raise RuntimeError("Prepared source tree digest differs from its exact inventory.")
    return entry, read(Path(entry["baseline"]["metadataFile"]))


def preflight(name, source_sha, directory):
    candidate(source_sha)
    entry, original = load_entry(name, source_sha)
    current = describe(name, directory, "immediate-before")
    if validate_metadata(name, current) != entry["baseline"]["liveSource"]:
        raise RuntimeError("Live source changed after capture; stopped.")
    if changed_configuration_fields(original, current):
        raise RuntimeError("Live configuration changed after capture; stopped.")
    expected_iam = read(Path(entry["baseline"]["iamFile"]))
    if normalized_iam(iam(name, current, directory, "immediate-iam")) != normalized_iam(expected_iam):
        raise RuntimeError("Live IAM changed after capture; stopped.")
    return entry, original, expected_iam


def promote(name, source_sha, verify_only=False):
    directory = STATE / ("verify" if verify_only else "deploy") / name
    directory.mkdir(parents=True, exist_ok=False)
    entry, original, expected_iam = preflight(name, source_sha, directory)
    if verify_only:
        print(json.dumps({"function": name, "candidate": source_sha, "readOnlyPreflight": "passed"}), flush=True)
        return
    print(json.dumps({"function": name, "candidate": source_sha, "stage": "deploying",
                      "sourceConfigAndIamVerified": True}), flush=True)
    result = subprocess.run([str(GCLOUD), "functions", "deploy", name, "--gen2",
        "--project=scaled-circle", "--region=us-east1", "--source=" + entry["output"],
        *(["--timeout=180s"] if name == "getSmartZonePlan" else []), "--quiet", "--format=json"], capture_output=True)
    (directory / "deployment.private.log").write_bytes(result.stdout + b"\n" + result.stderr)
    if result.returncode:
        raise RuntimeError("Deployment did not confirm success; inspect private diagnostic before continuing.")
    after = describe(name, directory, "after")
    after_iam = iam(name, after, directory, "after-iam")
    expected = json.loads(json.dumps(original))
    if name == "getSmartZonePlan":
        expected["serviceConfig"]["timeoutSeconds"] = 180
    differences = changed_configuration_fields(expected, after)
    iam_unchanged = normalized_iam(after_iam) == normalized_iam(expected_iam)
    summary = {"function": name, "candidate": source_sha, "state": after.get("state"),
               "revision": after["serviceConfig"].get("revision"),
               "changedConfigFieldNames": differences, "iamUnchanged": iam_unchanged,
               "approvedTimeoutSeconds": 180 if name == "getSmartZonePlan" else None,
               "sourceTreeSha256": entry["sourceTreeSha256"]}
    write_new(directory / "deployment.safe.json", summary)
    print(json.dumps(summary), flush=True)
    if (after.get("state") != "ACTIVE" or differences or not iam_unchanged or
            after.get("buildConfig", {}).get("source", {}).get("storageSource") == original["buildConfig"]["source"]["storageSource"]):
        raise RuntimeError("Post-deployment verification needs review; do not continue.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("capture", "prepare", "verify", "deploy"))
    parser.add_argument("name", nargs="?", choices=TARGETS)
    parser.add_argument("--source-sha")
    args = parser.parse_args()
    if args.action in ("verify", "deploy") and not args.name:
        parser.error("Choose one exact existing function.")
    if args.action in ("capture", "prepare") and args.name:
        parser.error("This action cannot be combined with a function name.")
    if args.action == "capture":
        if args.source_sha:
            parser.error("Read-only capture precedes final source approval.")
        capture()
    elif args.action == "prepare":
        prepare(args.source_sha)
    else:
        promote(args.name, args.source_sha, verify_only=args.action == "verify")


if __name__ == "__main__":
    main()
