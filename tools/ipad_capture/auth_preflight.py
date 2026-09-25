"""One normal password authentication; no persistence, redirects, retries or logging."""
import http.client
import json
import time
from urllib.parse import quote

ERRORS = frozenset({'INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND',
                   'INVALID_EMAIL', 'USER_DISABLED', 'TOO_MANY_ATTEMPTS_TRY_LATER',
                   'OPERATION_NOT_ALLOWED', 'API_KEY_INVALID', 'API_KEY_SERVICE_BLOCKED',
                   'API_KEY_IOS_APP_BLOCKED', 'INVALID_APP_CREDENTIAL'})


class AuthPreflightFailure(Exception):
    """Only a fixed category is safe to retain; never retain the HTTP exception."""


def post(key, method, payload, timeout):
    connection = http.client.HTTPSConnection('identitytoolkit.googleapis.com', timeout=timeout)
    try:
        connection.request('POST', '/v1/accounts:' + method + '?key=' + quote(key, safe=''),
                           body=json.dumps(payload).encode('utf-8'),
                           headers={'Content-Type': 'application/json',
                                    'X-Ios-Bundle-Identifier': 'com.scaledcircle.app'})
        response = connection.getresponse()
        raw = response.read(131073)
        if len(raw) > 131072:
            raise AuthPreflightFailure('response_invalid')
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise AuthPreflightFailure('response_invalid')
        if response.status != 200:
            error = data.get('error')
            code = error.get('message') if isinstance(error, dict) else None
            raise AuthPreflightFailure(code if code in ERRORS else 'provider_refused')
        return data
    except AuthPreflightFailure:
        raise
    except Exception:
        raise AuthPreflightFailure('transport_or_response_failed') from None
    finally:
        connection.close()


def verify(environment, config, exchange=post, timeout=25):
    deadline = time.monotonic() + timeout
    key = config.get('API_KEY')
    if not isinstance(key, str) or not key:
        raise AuthPreflightFailure('configuration_invalid')
    result = account = None
    try:
        result = exchange(key, 'signInWithPassword', {
            'email': environment['IPAD_REVIEWER_EMAIL'],
            'password': environment['IPAD_REVIEWER_PASSWORD'],
            'returnSecureToken': True,
        }, max(.1, deadline - time.monotonic()))
        if result.get('localId') != environment['IPAD_REVIEWER_UID']:
            raise AuthPreflightFailure('identity_mismatch')
        token = result.get('idToken')
        if not isinstance(token, str) or not token:
            raise AuthPreflightFailure('response_invalid')
        account = exchange(key, 'lookup', {'idToken': token},
                           max(.1, deadline - time.monotonic()))
        users = account.get('users', [])
        if (len(users) != 1 or users[0].get('localId') != environment['IPAD_REVIEWER_UID']
                or users[0].get('email') != environment['IPAD_REVIEWER_EMAIL']
                or users[0].get('emailVerified') is not True
                or users[0].get('disabled') is True or users[0].get('tenantId')):
            raise AuthPreflightFailure('identity_or_verification_mismatch')
        return 'verified_default_tenant'
    finally:
        # REST has no persisted client session to sign out. Discard tokens locally;
        # never revoke the account's other sessions or pass this token to the app.
        if isinstance(result, dict):
            result.clear()
        if isinstance(account, dict):
            account.clear()
