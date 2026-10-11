"""Repair the selected local client's exact callback without rotating credentials."""
import json
import ssl
import urllib.parse
import urllib.request

CONTROL_CALLBACK = 'https://localhost:15943/'


def with_callback(values):
    return list(dict.fromkeys([*values, CONTROL_CALLBACK]))


def refresh_redirects(root):
    # This developer command uses only the existing operator credential and public CA.
    settings = dict(line.split('=', 1) for line in (root/'keycloak.env').read_text().splitlines() if '=' in line)
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(root/'tls/ca.pem'))))
    base = 'https://localhost:15943/identity'

    def request(path, data=None, token=None, method=None):
        headers = {}
        if token:
            headers['Authorization'] = 'Bearer '+token
        if isinstance(data, dict):
            data = json.dumps(data).encode()
            headers['Content-Type'] = 'application/json'
        elif data is not None:
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        with opener.open(urllib.request.Request(base+path, data=data, headers=headers, method=method), timeout=15) as response:
            body = response.read()
            return json.loads(body) if body else None

    token = request('/realms/master/protocol/openid-connect/token', urllib.parse.urlencode({
        'grant_type': 'password', 'client_id': 'admin-cli',
        'username': settings['KC_BOOTSTRAP_ADMIN_USERNAME'],
        'password': settings['KC_BOOTSTRAP_ADMIN_PASSWORD']}).encode())['access_token']
    clients = request('/admin/realms/sdc/clients?clientId=sdc-native', token=token)
    if len(clients) != 1 or clients[0]['clientId'] != 'sdc-native':
        raise ValueError('Expected exactly the provisioned local native client')
    client = clients[0]
    client['redirectUris'] = with_callback(client.get('redirectUris', []))
    request('/admin/realms/sdc/clients/'+client['id'], client, token, 'PUT')
    verified = request('/admin/realms/sdc/clients/'+client['id'], token=token)
    if set(verified['redirectUris']) != set(client['redirectUris']):
        raise ValueError('Local callback update did not persist')
    env_path = root/'server.env'
    lines = env_path.read_text().splitlines()
    matches = [i for i, line in enumerate(lines) if line.startswith('SDC_OIDC_REDIRECT_URIS=')]
    if len(matches) != 1:
        raise ValueError('Expected one server callback allowlist')
    index = matches[0]
    lines[index] = 'SDC_OIDC_REDIRECT_URIS='+';'.join(with_callback(lines[index].split('=', 1)[1].split(';')))
    env_path.write_text('\n'.join(lines)+'\n')
    realm_path = root/'realm/sdc-realm.json'
    realm = json.loads(realm_path.read_text())
    for item in realm['clients']:
        if item['clientId'] == 'sdc-native':
            item['redirectUris'] = with_callback(item.get('redirectUris', []))
    realm_path.write_text(json.dumps(realm))
