import json
import os
import subprocess
import sys
import unittest
from unittest.mock import patch
from auth_preflight import verify, post, AuthPreflightFailure


class AuthenticationTests(unittest.TestCase):
    def test_provider_code_is_allowlisted_without_reflected_payload(self):
        for message, expected in [('INVALID_LOGIN_CREDENTIALS', 'INVALID_LOGIN_CREDENTIALS'),
                                  ('private reflected request', 'provider_refused')]:
            with patch('auth_preflight.http.client.HTTPSConnection') as factory:
                connection = factory.return_value
                response = connection.getresponse.return_value
                response.status = 400
                response.read.return_value = json.dumps({'error': {'message': message}}).encode()
                with self.assertRaises(AuthPreflightFailure) as result:
                    post('synthetic-key', 'signInWithPassword', {}, 1)
                self.assertEqual(str(result.exception), expected)
                connection.request.assert_called_once()
                connection.close.assert_called_once()

    def test_redirect_is_not_followed_and_raw_html_is_not_retained(self):
        with patch('auth_preflight.http.client.HTTPSConnection') as factory:
            connection = factory.return_value
            response = connection.getresponse.return_value
            response.status = 302
            response.read.return_value = b'<html>private reflected request</html>'
            with self.assertRaisesRegex(AuthPreflightFailure, '^transport_or_response_failed$'):
                post('synthetic-key', 'signInWithPassword', {}, 1)
            connection.request.assert_called_once()
            connection.close.assert_called_once()

    def test_transfer_preserves_special_characters_and_session_is_discarded(self):
        environment = {'IPAD_REVIEWER_EMAIL': 'synthetic+review@example.invalid',
                       'IPAD_REVIEWER_PASSWORD': '  synthetic !"$`\\ +\u96ea\n ',
                       'IPAD_REVIEWER_UID': 'synthetic-uid'}
        original = dict(environment)
        responses = []
        def exchange(key, method, payload, timeout):
            self.assertGreater(timeout, 0)
            if method == 'signInWithPassword':
                self.assertEqual(payload['email'], environment['IPAD_REVIEWER_EMAIL'])
                self.assertEqual(payload['password'], environment['IPAD_REVIEWER_PASSWORD'])
                result = {'localId': 'synthetic-uid', 'idToken': 'synthetic-token'}
            else:
                self.assertEqual(payload, {'idToken': 'synthetic-token'})
                result = {'users': [{'localId': 'synthetic-uid',
                    'email': environment['IPAD_REVIEWER_EMAIL'], 'emailVerified': True}]}
            responses.append(result)
            return result
        self.assertEqual(verify(environment, {'API_KEY': 'synthetic-key'}, exchange),
                         'verified_default_tenant')
        self.assertEqual(environment, original)
        self.assertTrue(all(item == {} for item in responses))
        child = subprocess.run([sys.executable, '-c',
            'import os,json;print(json.dumps({k:os.environ[k] for k in '
            '["IPAD_REVIEWER_EMAIL","IPAD_REVIEWER_PASSWORD"]}))'],
            env={**os.environ, **environment}, capture_output=True, check=True)
        received = json.loads(child.stdout)
        self.assertEqual(received['IPAD_REVIEWER_PASSWORD'], original['IPAD_REVIEWER_PASSWORD'])
        self.assertEqual(received['IPAD_REVIEWER_EMAIL'], original['IPAD_REVIEWER_EMAIL'])

    def test_identity_mismatch_stops_without_lookup(self):
        response = {'localId': 'wrong', 'idToken': 'synthetic-token'}
        calls = []
        def exchange(*args):
            calls.append(args[1])
            return response
        with self.assertRaisesRegex(AuthPreflightFailure, '^identity_mismatch$'):
            verify({'IPAD_REVIEWER_EMAIL': 'synthetic@example.invalid',
                    'IPAD_REVIEWER_PASSWORD': 'synthetic', 'IPAD_REVIEWER_UID': 'expected'},
                   {'API_KEY': 'synthetic'}, exchange)
        self.assertEqual(calls, ['signInWithPassword'])
        self.assertEqual(response, {})

    def test_provider_failure_has_no_retry(self):
        calls = []
        def exchange(*args):
            calls.append(args[1])
            raise AuthPreflightFailure('INVALID_LOGIN_CREDENTIALS')
        with self.assertRaisesRegex(AuthPreflightFailure, '^INVALID_LOGIN_CREDENTIALS$'):
            verify({'IPAD_REVIEWER_EMAIL': 'synthetic@example.invalid',
                    'IPAD_REVIEWER_PASSWORD': 'synthetic', 'IPAD_REVIEWER_UID': 'expected'},
                   {'API_KEY': 'synthetic'}, exchange)
        self.assertEqual(calls, ['signInWithPassword'])


if __name__ == '__main__':
    unittest.main()
