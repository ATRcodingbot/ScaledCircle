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
    # Revision/URL are generated deployment metadata, all actual settings remain.
    return {k: v for k, v in value.items() if k not in {"revision", "uri", "service"}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("name")
    args = parser.parse_args()
    name = args.name
    STATE.mkdir(parents=True, exist_ok=True)
    if name == "businessOperationsV1":
        original = read(STATE / "operations-before.private.json")
        source = STATE / "operations"
        expected_config = original["serviceConfig"]
        expected_source = original["buildConfig"]["source"]["storageSource"]
    else:
        manifest = read(ROOT / ".firebase/campaign-authority/promotion-manifest.private.json")
        entry = next(e for e in manifest["entries"] if e["name"] == name)
        source = Path(entry["output"])
        for relative, digest in entry["files"].items():
            actual = hashlib.sha256((source / relative).read_bytes()).hexdigest()
            if actual != digest:
                raise RuntimeError("Prepared source changed after verification: " + relative)
        expected_config = entry["preservedServiceConfig"]
        expected_source = entry["liveSource"]
    current = describe(name, STATE / (name + "-immediate-before.private.json"))
    if current["buildConfig"]["source"]["storageSource"] != expected_source:
        raise RuntimeError("Live source changed after preparation; deployment stopped.")
    if config(current["serviceConfig"]) != config(expected_config):
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
    differences = sorted(k for k in set(config(expected_config)) | set(config(after["serviceConfig"]))
                         if config(expected_config).get(k) != config(after["serviceConfig"]).get(k))
    summary = {"function": name, "state": after["state"],
               "revision": after["serviceConfig"].get("revision"),
               "changedConfigFieldNames": differences}
    (STATE / (name + "-deployment.safe.json")).write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary), flush=True)
    if after["state"] != "ACTIVE" or differences:
        raise RuntimeError("Post-deployment readback needs review; do not continue promotion.")


if __name__ == "__main__":
    main()
