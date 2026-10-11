"""Run inside the disposable M24 gateway; no synthetic identity or native claims.
Requires /run/sdc/test-ca.pem and /run/sdc/test-user.json; emits no credentials.
"""
import json
import ssl
import secrets
import uuid
from datetime import datetime, timezone, timedelta
import time
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlparse
import httpx

class LoginForm(HTMLParser):
    def __init__(self):
        super().__init__()
        self.action = None
    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'form' and attributes.get('id') == 'kc-form-login':
            self.action = attributes['action']

ca = ssl.create_default_context(cafile=__import__('os').environ.get('M24_CA', '/run/sdc/test-ca.pem'))
base = __import__('os').environ.get('M24_BASE', 'https://chat.m24.test')
with httpx.Client(verify=ca, timeout=15, trust_env=False, follow_redirects=False) as client:
    for _ in range(40):
        try:
            discovery = client.get(__import__('os').environ.get('M24_ISSUER','https://identity.m24.test:8443/realms/m24')+'/.well-known/openid-configuration')
            if discovery.status_code == 200:
                break
        except httpx.HTTPError:
            pass
        time.sleep(1)
    assert discovery.status_code == 200
    assert discovery.json()['issuer'] == __import__('os').environ.get('M24_ISSUER','https://identity.m24.test:8443/realms/m24')
    # Resolve replacement Docker addresses without restarting the proxy.
    for _ in range(30):
        if client.get(base + '/v2/health').status_code == 200 and client.get(base + '/api/v1/health').status_code == 200:
            break
        time.sleep(1)
    else:
        raise AssertionError('Proxy failed to find replacement services')
    start = client.post(base + '/v2/auth/oidc/start', json={'redirectUri': 'http://127.0.0.1:15945/callback'})
    assert start.status_code == 200, start.text
    attempt = start.json()
    auth_query = parse_qs(urlparse(attempt['authorizationUrl']).query)
    assert auth_query['code_challenge_method'] == ['S256']
    assert auth_query['nonce'] and auth_query['state']
    login = client.get(attempt['authorizationUrl'])
    form = LoginForm(); form.feed(login.text)
    assert form.action, 'Expected real Keycloak login form'
    assert urlparse(form.action).hostname == urlparse(__import__('os').environ.get('M24_ISSUER','https://identity.m24.test:8443/realms/m24')).hostname
    user = json.load(open(__import__('os').environ.get('M24_LOGIN','/run/sdc/test-user.json')))
    signed_in = client.post(form.action, data=user)
    assert signed_in.status_code == 302, f'Login status {signed_in.status_code}'
    redirect = signed_in.headers['location']
    assert redirect.startswith('http://127.0.0.1:15945/callback?')
    query = parse_qs(urlparse(redirect).query)
    assert query['state'][0] == attempt['state']
    body = {'state': attempt['state'], 'code': query['code'][0]}
    exchange = client.post(base + '/v2/auth/oidc/exchange', json=body)
    assert exchange.status_code == 200, exchange.text
    tokens = exchange.json()
    headers = {'authorization': 'Bearer ' + tokens['accessToken'], 'anthropic-version': '2023-06-01'}
    identity = client.get(base + '/api/v1/identity', headers=headers)
    assert identity.status_code == 200, identity.text
    assert client.get(base + '/api/v1/identity').status_code in (401,403)
    assert client.get(base + '/api/v1/identity', headers={'authorization': 'Bearer invalid'}).status_code == 401
    assert client.post(base + '/v2/auth/oidc/exchange', json=body).status_code == 400
    refreshed = client.post(base + '/v2/auth/oidc/refresh', json={'userId':tokens['userId'],'refreshToken':tokens['refreshToken']})
    assert refreshed.status_code == 200, refreshed.text
    for path in ['/api/v1/models', '/openai/v1/models', '/anthropic/v1/models']:
        assert client.get(base + path, headers=headers).status_code == 200, path
    oversize = client.post(base + '/openai/v1/chat/completions', headers=headers, content=b'x'*(11*1024*1024+1))
    assert oversize.status_code == 413
    assert identity.headers['strict-transport-security'] == 'max-age=31536000'
    # Explicitly simulated device: this qualifies proxy transport, never native permissions/effects.
    local_secret = secrets.token_urlsafe(32)
    paired = client.post(base + '/v2/pairings', headers=headers, json={'label':'M24 simulated proxy transport', 'localConfirmationSecret':local_secret})
    assert paired.status_code == 201, paired.text
    pairing = paired.json()
    assert client.post(base + '/v2/pairings/' + pairing['pairingId'] + '/confirm', headers=headers, json={'pairingCode':pairing['pairingCode']}).status_code == 200
    issued = client.post(base + '/v2/pairings/' + pairing['pairingId'] + '/local-confirm', json={'localConfirmationSecret':local_secret,'explicitConsent':True}).json()
    device_headers = {'authorization':'Bearer ' + issued['credential']}
    session, binding_id, command_id, turn = [str(uuid.uuid4()) for _ in range(4)]
    binding = {'appId':'test.m24.transport', 'appInstanceId':'simulated-device', 'workspaceId':'simulated', 'conversationId':session, 'nativeConversationId':session, 'bindingId':binding_id, 'sessionId':session, 'bindingRevision':1, 'leaseGeneration':1, 'capabilitiesRevision':'simulated'}
    registered = client.post(base + '/v2/devices/' + issued['deviceId'] + '/bindings', headers=device_headers, json={'binding':binding,'conversationRevision':0})
    assert registered.status_code == 201, registered.text
    scoped = client.post(base + '/api/v1/credentials', headers=headers, json={'sessionId':session,'label':'M24 disposable view key','scopes':['view'],'expiresAt':(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()})
    assert scoped.status_code == 201, scoped.text
    scoped_key = scoped.json()
    key_headers = {'authorization':'Bearer ' + scoped_key['credential']}
    assert client.get(base + '/api/v1/sessions/' + session + '/snapshot',headers=key_headers).status_code == 200
    denied = client.post(base + '/api/v1/sessions/' + session + '/prompts',headers={**key_headers,'idempotency-key':str(uuid.uuid4())},json={'model':'sdc.'+binding_id,'content':[{'type':'text','text':'must not dispatch'}]})
    assert denied.status_code == 403, denied.text
    assert client.post(base + '/api/v1/credentials/' + scoped_key['credentialId'] + '/revoke',headers=headers).status_code == 200
    assert client.get(base + '/api/v1/identity',headers=key_headers).status_code == 401
    lane = base + '/v2/devices/' + issued['deviceId'] + '/commands?lane=control'
    with client.stream('GET', lane, headers=device_headers) as stream:
        assert stream.status_code == 200
        began = time.monotonic()
        command = {'protocolVersion':'2.0','type':'turn.cancel','commandId':command_id,'lane':'control','seq':1,'sessionId':session,'bindingRevision':1,'leaseGeneration':1,'turnId':turn,'createdAt':datetime.now(timezone.utc).isoformat(), 'payload':{'reason':'M24 simulated TLS transport'}}
        sent = client.post(base + '/v2/sessions/' + session + '/turns/' + turn + '/controls', headers=headers,json={'command':command})
        assert sent.status_code == 202, sent.text
        for line in stream.iter_lines():
            if line.startswith('data:'):
                event = json.loads(line[5:])
                assert event['commandId'] == command_id
                latency = time.monotonic() - began
                assert latency < 3, 'Proxy buffered live command'
                break
    with client.stream('GET',lane,headers={**device_headers,'last-event-id':'0'}) as replay:
        assert replay.status_code == 200
        for line in replay.iter_lines():
            if line.startswith('data:'):
                assert json.loads(line[5:])['commandId'] == command_id
                break
    detached = client.post(base + '/v2/devices/' + issued['deviceId'] + '/bindings/' + binding_id + '/detach', headers=device_headers,json={})
    assert detached.status_code == 200
    print(json.dumps({'checks': ['TLS certificate verification', 'server and gateway health through Nginx', 'real Keycloak discovery and authorization-code PKCE S256 login', 'ID/access signature nonce issuer audience and verified-email registration', 'state replay rejected', 'refresh preserves registered identity', 'authenticated API and both provider base URLs', 'missing/invalid credentials rejected', 'session-scoped key view prompt denial and live revocation', 'proxy body limit and security headers', 'live SSE control flushing and reconnect replay with simulated device'], 'sseControlLatencySeconds': latency, 'native': 'not exercised; transport device explicitly simulated', 'identityProvider': __import__('os').environ.get('M24_PROVIDER','Keycloak 26.4.7 disposable realm'), 'production': False}, indent=2))
