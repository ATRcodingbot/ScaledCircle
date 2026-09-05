"""Inspect a production AAB without extracting credentials or modifying it.

Generic loopback strings in Flutter/Dart and Google SDKs are reported, never
called zero. Their presence needs source review; application staging origins
and emulator endpoints fail the gate in every ZIP entry, including symbols.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def varint(data, offset):
    value = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, offset
        shift += 7


def fields(data):
    offset = 0
    while offset < len(data):
        key, offset = varint(data, offset)
        wire = key & 7
        if wire == 0:
            value, offset = varint(data, offset)
        elif wire == 2:
            length, offset = varint(data, offset)
            value = data[offset:offset + length]
            offset += length
        elif wire in (1, 5):
            length = 8 if wire == 1 else 4
            value = data[offset:offset + length]
            offset += length
        else:
            raise ValueError(f"Unsupported protobuf wire type: {wire}")
        yield key >> 3, value


def manifest_elements(node):
    # AAPT2 XmlNode.element=1; XmlElement.name=3, attribute=4, child=5.
    for number, element in fields(node):
        if number != 1:
            continue
        entries = list(fields(element))
        name = next(value.decode() for number, value in entries if number == 3)
        attributes = {}
        for number, value in entries:
            if number == 4:
                attr = dict(fields(value))
                attributes[attr[2].decode()] = attr.get(3, b"").decode()
        yield name, attributes
        for number, child in entries:
            if number == 5:
                yield from manifest_elements(child)


def inspect(path):
    forbidden = ["scaledcircle-staging", "demo-scaledcircle", "10.0.2.2",
                 "http://127.0.0.1:5000", "http://127.0.0.1:5001"]
    markers = forbidden + ["localhost", "127.0.0.1",
                          "us-east1-scaled-circle.cloudfunctions.net",
                          "socialOAuthXCallbackV1", "scaled-circle"]
    hits = {marker: [] for marker in markers}
    with zipfile.ZipFile(path) as bundle:
        for entry in bundle.infolist():
            data = bundle.read(entry)
            for marker in markers:
                count = sum(data.count(marker.encode(encoding)) for encoding in
                            ("utf-8", "utf-16-le", "utf-16-be"))
                if count:
                    hits[marker].append({"entry": entry.filename, "count": count})
        elements = list(manifest_elements(bundle.read("base/manifest/AndroidManifest.xml")))
        manifest = next(attrs for name, attrs in elements if name == "manifest")
        sdk = next(attrs for name, attrs in elements if name == "uses-sdk")
        abis = [name for name in bundle.namelist()
                if name.startswith("base/lib/") and name.endswith("/libapp.so")]
        for abi in abis:
            data = bundle.read(abi)
            for marker in ("us-east1-scaled-circle.cloudfunctions.net",
                           "socialOAuthXCallbackV1", "scaled-circle"):
                if marker.encode() not in data:
                    raise ValueError(f"Missing production marker {marker} in {abi}")
    errors = [f"Forbidden production marker: {marker}" for marker in forbidden if hits[marker]]
    for key, expected in {"package": "com.scaledcircle.app", "versionCode": "2",
                          "versionName": "1.0.0"}.items():
        if manifest.get(key) != expected:
            errors.append(f"Unexpected {key}: {manifest.get(key)}")
    if sdk.get("targetSdkVersion") != "36":
        errors.append("Target SDK must be 36")
    if len(abis) != 3:
        errors.append(f"Expected three application ABIs, found {len(abis)}")
    return {"artifact": str(path.resolve()), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "manifest": manifest, "sdk": sdk, "abis": abis, "hits": hits,
            "errors": errors, "origin_and_manifest_gate": "FAIL" if errors else "PASS",
            "loopback_review": "Required: generic runtime/SDK strings are reported separately",
            "signature_verification": "Run jarsigner separately"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result = inspect(args.bundle)
    output = json.dumps(result, indent=2)
    if args.report:
        args.report.write_text(output + "\n", encoding="utf-8")
    print(output)
    raise SystemExit(bool(result["errors"]))
