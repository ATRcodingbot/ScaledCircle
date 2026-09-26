"""Promote one approved mapping overlay; protected metadata is kept private.

Use --capture-iam for read-only preflight capture. A named invocation deploys only
that existing function, with source-only flags and no automatic retry.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess

from deploy_campaign_planner_overlay import GCLOUD, changed_configuration_fields, read, verify_source

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".firebase/mapping-qa"
DEPLOY_STATE = STATE / "deploy"
APPROVED_CANDIDATE = "871030ac0c6ed60909a05e7704abe2b90414d45e"
TARGETS = ("getSmartZonePlan", "applySmartZonePlan", "businessOperationsV1")
SOURCE_PATHS = ("functions", "functions-discovery", "functions-business-operations",
                "tools/prepare_mapping_qa_promotion.cjs")


def verify_candidate():
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True)
    if head.returncode or head.stdout.decode().strip() != APPROVED_CANDIDATE:
        raise RuntimeError("Checkout is not the explicitly approved candidate; deployment stopped.")
    dirty = subprocess.run(["git", "diff", "--quiet", APPROVED_CANDIDATE, "--", *SOURCE_PATHS], cwd=ROOT, capture_output=True)
    untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard", "--", *SOURCE_PATHS], cwd=ROOT, capture_output=True)
    if dirty.returncode or untracked.returncode or untracked.stdout.strip():
        raise RuntimeError("Approved application source changed; deployment stopped.")


def load_entry(name):
    manifest = read(STATE / "promotion-manifest.private.json")
    if sorted(e["name"] for e in manifest["entries"]) != sorted(TARGETS):
        raise RuntimeError("Mapping target inventory differs from the approved three targets.")
    entry = next(e for e in manifest["entries"] if e["name"] == name)
    if entry["project"] != "scaled-circle" or entry["region"] != "us-east1":
        raise RuntimeError("Unexpected target project or region.")
    original = read(Path(entry["beforeMetadataFile"]))
    if (original["name"] != "projects/scaled-circle/locations/us-east1/functions/" + name
            or original["buildConfig"]["source"]["storageSource"] != entry["liveSource"]
            or original["serviceConfig"] != entry["preservedServiceConfig"]
            or original["buildConfig"]["runtime"] != entry["preservedRuntime"]):
        raise RuntimeError("Prepared package and live configuration baseline disagree.")
    verify_source(Path(entry["output"]), entry["files"])
    return entry, original


def private_json(command, output, failure):
    result = subprocess.run(command, capture_output=True)
    if result.returncode:
        output.with_suffix(".log").write_bytes(result.stdout + b"\n" + result.stderr)
        raise RuntimeError(failure + " See the private diagnostic; do not retry automatically.")
    output.write_bytes(result.stdout)
    try:
        return read(output)
    except (ValueError, UnicodeError):
        raise RuntimeError("A private metadata response was invalid; deployment stopped.") from None


def describe(name, label):
    return private_json([str(GCLOUD), "functions", "describe", name, "--gen2",
                         "--project=scaled-circle", "--region=us-east1", "--format=json"],
                        DEPLOY_STATE / (name + "-" + label + ".private.json"),
                        "Function metadata could not be read.")


def read_iam(name, description, label):
    service = description["serviceConfig"].get("service", "")
    match = re.fullmatch(r"projects/scaled-circle/locations/us-east1/services/([a-z0-9-]+)", service)
    if not match:
        raise RuntimeError("Cloud Run service identity is unavailable or outside the approved scope.")
    function_policy = private_json([str(GCLOUD), "functions", "get-iam-policy", name, "--gen2",
                                   "--project=scaled-circle", "--region=us-east1", "--format=json"],
                                  DEPLOY_STATE / (name + "-function-iam-" + label + ".private.json"),
                                  "Function IAM policy could not be read.")
    service_policy = private_json([str(GCLOUD), "run", "services", "get-iam-policy", match.group(1),
                                  "--platform=managed", "--project=scaled-circle", "--region=us-east1", "--format=json"],
                                 DEPLOY_STATE / (name + "-service-iam-" + label + ".private.json"),
                                 "Service IAM policy could not be read.")
    return {"service": service, "functionPolicy": function_policy, "servicePolicy": service_policy}


def normalized_iam(value):
    # IAM member/binding order and optimistic-concurrency etags are not grants.
    # Preserve every other returned field, including conditions and policy version.
    def normalize(item):
        if isinstance(item, dict):
            return {k: normalize(v) for k, v in item.items() if k != "etag"}
        if isinstance(item, list):
            return sorted((normalize(v) for v in item), key=lambda v: json.dumps(v, sort_keys=True))
        return item
    return normalize(value)


def assert_live_unchanged(entry, original, current):
    if current.get("state") != "ACTIVE":
        raise RuntimeError("Current function is not ACTIVE; deployment stopped.")
    if current["buildConfig"]["source"]["storageSource"] != entry["liveSource"]:
        raise RuntimeError("Live source changed after preparation; deployment stopped.")
    if changed_configuration_fields(original, current):
        raise RuntimeError("Live configuration changed after preparation; deployment stopped.")


def capture_iam():
    verify_candidate()
    DEPLOY_STATE.mkdir(parents=True, exist_ok=True)
    for name in TARGETS:
        entry, original = load_entry(name)
        current = describe(name, "capture-before")
        assert_live_unchanged(entry, original, current)
        policies = read_iam(name, current, "capture-before")
        baseline = DEPLOY_STATE / (name + "-iam-baseline.private.json")
        if baseline.exists():
            if normalized_iam(read(baseline)) != normalized_iam(policies):
                raise RuntimeError("IAM changed after baseline capture; existing baseline retained.")
        else:
            baseline.write_text(json.dumps(policies, indent=2), encoding="utf-8")
        print(json.dumps({"function": name, "sourceVerified": True,
                          "configurationVerified": True, "iamBaselineCaptured": True}), flush=True)


def promote(name):
    verify_candidate()
    DEPLOY_STATE.mkdir(parents=True, exist_ok=True)
    entry, original = load_entry(name)
    baseline_path = DEPLOY_STATE / (name + "-iam-baseline.private.json")
    if not baseline_path.exists():
        raise RuntimeError("Read-only IAM capture is required before deployment.")
    expected_iam = read(baseline_path)
    current = describe(name, "immediate-before")
    assert_live_unchanged(entry, original, current)
    current_iam = read_iam(name, current, "immediate-before")
    if normalized_iam(current_iam) != normalized_iam(expected_iam):
        raise RuntimeError("Live IAM changed after baseline capture; deployment stopped.")
    print(json.dumps({"function": name, "stage": "deploying", "candidate": APPROVED_CANDIDATE,
                      "sourceVerified": True, "configurationVerified": True, "iamVerified": True}), flush=True)
    result = subprocess.run([str(GCLOUD), "functions", "deploy", name, "--gen2",
                             "--project=scaled-circle", "--region=us-east1",
                             "--source=" + entry["output"], "--quiet", "--format=json"], capture_output=True)
    (DEPLOY_STATE / (name + "-deployment.private.log")).write_bytes(result.stdout + b"\n" + result.stderr)
    if result.returncode:
        raise RuntimeError("Deployment did not confirm success; inspect the private diagnostic before retrying.")
    after = describe(name, "after")
    after_iam = read_iam(name, after, "after")
    differences = changed_configuration_fields(original, after)
    iam_unchanged = normalized_iam(expected_iam) == normalized_iam(after_iam)
    summary = {"function": name, "state": after["state"], "revision": after["serviceConfig"].get("revision"),
               "candidate": APPROVED_CANDIDATE, "changedConfigFieldNames": differences, "iamUnchanged": iam_unchanged}
    (DEPLOY_STATE / (name + "-deployment.safe.json")).write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary), flush=True)
    if after["state"] != "ACTIVE" or differences or not iam_unchanged:
        raise RuntimeError("Post-deployment readback needs review; do not continue promotion.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("name", nargs="?", choices=TARGETS)
    parser.add_argument("--capture-iam", action="store_true")
    args = parser.parse_args()
    if args.capture_iam and args.name:
        parser.error("IAM capture is read-only and cannot be combined with a deployment target.")
    if args.capture_iam:
        capture_iam()
    elif args.name:
        promote(args.name)
    else:
        parser.error("Choose --capture-iam or one exact deployment target.")


if __name__ == "__main__":
    main()
