"""Bounded review-package checks; update the manifest only after a new review."""
import hashlib
import json
from pathlib import Path
import re
import unittest
from prepare_brand_spelling_hosting import spelling

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'tools/brand_spelling_review_manifest.json').read_text())


class BrandReview(unittest.TestCase):
    def test_only_display_spelling_changes(self):
        for name, evidence in MANIFEST['presentationFiles'].items():
            with self.subTest(file=name):
                data = (ROOT / name).read_bytes()
                normalized = data.replace(b'Scaled Circle', b'ScaledCircle').replace(b'SCALED CIRCLE', b'SCALEDCIRCLE').replace(b'\r\n', b'\n')
                self.assertEqual(hashlib.sha256(normalized).hexdigest(), evidence['normalizedSha256'])

    def test_urls_and_email_destinations_unchanged(self):
        for name, evidence in MANIFEST['presentationFiles'].items():
            data = (ROOT / name).read_bytes()
            urls = re.findall(rb'(?:https?://|mailto:)[^\s<>"\x27`]+', data)
            self.assertEqual(hashlib.sha256(b'\n'.join(urls)).hexdigest(), evidence['destinationsSha256'], name)

    def test_artwork_and_native_platform_files_unchanged(self):
        for name, expected in MANIFEST['unchangedAssetsAndNativeFiles'].items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), expected, name)

    def test_approved_history_consent_and_locks_unchanged(self):
        for name, expected in MANIFEST['preservedHistoryIdentityAndLocks'].items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), expected, name)

    def test_public_overlay_preserves_destinations_and_identifier_attributes(self):
        sample = b'<a id="ScaledCircle" href="mailto:support@scaledcircle.com?subject=ScaledCircle%20help">ScaledCircle</a><img src="/ScaledCircle.png" alt="ScaledCircle">'
        self.assertEqual(spelling(sample), b'<a id="ScaledCircle" href="mailto:support@scaledcircle.com?subject=ScaledCircle%20help">Scaled Circle</a><img src="/ScaledCircle.png" alt="Scaled Circle">')

    def test_public_overlay_is_idempotent_and_preserves_pricing(self):
        value = b'<title>ScaledCircle Pricing</title><p>Starter $99; Growth $299; Scale $499</p>'
        result = spelling(value)
        self.assertEqual(result, spelling(result))
        self.assertIn(b'Starter $99; Growth $299; Scale $499', result)

    def test_technical_names_and_privacy_keys_remain(self):
        self.assertIn(b'class ScaledCircleApp', (ROOT/'apps/mobile/lib/main.dart').read_bytes())
        analytics = (ROOT/'apps/mobile/web/analytics.js').read_bytes()
        for value in [b'G-9VY50190LG', b'scaledcircle.analytics.choice.v1']:
            self.assertIn(value, analytics)
        self.assertIn(b'ScaledCircle startup:', (ROOT/'apps/mobile/lib/main.dart').read_bytes())


if __name__ == '__main__':
    unittest.main()
