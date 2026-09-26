"""Promote one reviewed live-source overlay; never logs protected config values.

Authority target packages and their generation/config inventory are prepared by
prepare_campaign_execution_promotion.cjs. This tool does not prepare or retry
deployments and does not change environment, secrets, IAM, triggers or settings.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
GCLOUD = Path(r"C:\Users\Greg\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd")
STATE = ROOT / ".firebase/campaign-planner-deploy"


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def describe(name, output):
    result = subprocess.run([str(GCLOUD), "functions", "describe", name, "--gen2",
                             "--project=scaled-circle", "--region=us-east1", "--format=json"],
                            capture_output=True)
    if result.returncode:
        (STATE / (name + "-describe.private.log")).write_bytes(result.stderr)
        raise RuntimeError("Function metadata could not be verified; see private diagnostic.")
    output.write_bytes(result.stdout)
    return read(output)


def config(value):
    # These service identities are generated deployment metadata.
    return {k: v for k, v in value.items() if k not in {"revision", "uri", "service"}}


def preserved_configuration(value):
    # Build and uploaded-source identities change when promoting new source.
    build = {k: v for k, v in value["buildConfig"].items()
             if k not in {"build", "source", "sourceProvenance"}}
    return {"serviceConfig": config(value["serviceConfig"]), "buildConfig": build,
            **{k: value.get(k) for k in ("eventTrigger", "environment", "kmsKeyName", "labels")}}


def changed_configuration_fields(expected, actual):
    before, after = preserved_configuration(expected), preserved_configuration(actual)
    changes = []
    for section in before:
        if before[section] == after[section]:
            continue
        if isinstance(before[section], dict) and isinstance(after[section], dict):
            changes.extend(section + "." + key for key in set(before[section]) | set(after[section])
                           if before[section].get(key) != after[section].get(key))
        else:
            changes.append(section)
    return sorted(changes)


def source_hashes(source):
    files = list(source.rglob("*"))
    if any(item.is_symlink() for item in files):
        raise RuntimeError("Prepared source contains a symlink; deployment stopped.")
    return {item.relative_to(source).as_posix(): hashlib.sha256(item.read_bytes()).hexdigest()
            for item in sorted(files) if item.is_file()}


def verify_source(source, expected):
    actual = source_hashes(source)
    if not expected or set(actual) != set(expected):
        raise RuntimeError("Prepared source file inventory changed after verification.")
    if actual != expected:
        raise RuntimeError("Prepared source contents changed after verification.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("name")
    args = parser.parse_args()
    name = args.name
    STATE.mkdir(parents=True, exist_ok=True)
    if name == "businessOperationsV1":
        original = read(STATE / "operations-before.private.json")
        source = STATE / "operations"
        verify_source(source, read(STATE / "operations-source-manifest.private.json")["files"])
        expected_source = original["buildConfig"]["source"]["storageSource"]
    else:
        manifest = read(ROOT / ".firebase/campaign-authority/promotion-manifest.private.json")
        entry = next(e for e in manifest["entries"] if e["name"] == name)
        source = Path(entry["output"])
        verify_source(source, entry["files"])
        inventory = read(ROOT / ".firebase/campaign-authority/live-functions.private.json")
        original = next(item for item in inventory
                        if item["name"] == "projects/scaled-circle/locations/us-east1/functions/" + name)
        expected_source = entry["liveSource"]
        if (original["buildConfig"]["source"]["storageSource"] != expected_source
                or original["serviceConfig"] != entry["preservedServiceConfig"]
                or original["buildConfig"]["runtime"] != entry["preservedRuntime"]):
            raise RuntimeError("Prepared source inventory and configuration baseline disagree.")
    current = describe(name, STATE / (name + "-immediate-before.private.json"))
    if current["buildConfig"]["source"]["storageSource"] != expected_source:
        raise RuntimeError("Live source changed after preparation; deployment stopped.")
    if changed_configuration_fields(original, current):
        raise RuntimeError("Live settings changed after preparation; deployment stopped.")
    print(json.dumps({"function": name, "stage": "deploying", "settingsVerified": True}), flush=True)
    result = subprocess.run([str(GCLOUD), "functions", "deploy", name, "--gen2",
                             "--project=scaled-circle", "--region=us-east1",
                             "--source=" + str(source), "--quiet", "--format=json"],
                            capture_output=True)
    (STATE / (name + "-deployment.private.log")).write_bytes(result.stdout + b"\n" + result.stderr)
    if result.returncode:
        raise RuntimeError("Deployment did not confirm success; inspect private diagnostic before retrying.")
    after = describe(name, STATE / (name + "-after.private.json"))
    differences = changed_configuration_fields(original, after)
    summary = {"function": name, "state": after["state"],
               "revision": after["serviceConfig"].get("revision"),
               "changedConfigFieldNames": differences}
    (STATE / (name + "-deployment.safe.json")).write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary), flush=True)
    if after["state"] != "ACTIVE" or differences:
        raise RuntimeError("Post-deployment readback needs review; do not continue promotion.")


if __name__ == "__main__":
    main()
