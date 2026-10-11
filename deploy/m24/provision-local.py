#!/usr/bin/env python3
"""Developer provisioning for the authorized local Docker deployment; never prints secrets."""
import argparse,json,os,pathlib,secrets,shlex,subprocess,sys
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--refresh-vscode-launcher',action='store_true');p.add_argument('--refresh-oidc-redirects',action='store_true');a=p.parse_args()
root=pathlib.Path(a.state).expanduser().resolve()
if any(c in str(root) for c in '\n\r\x00'):
    raise SystemExit('Invalid state path')

def provision_vscode_launcher():
    bundle=root/'ServerDrivenChat VS Code.app'
    contents=bundle/'Contents'
    executable=contents/'MacOS/launch'
    resources=contents/'Resources'
    if sys.platform == 'darwin':
        profile_root=pathlib.Path.home()/'Library/Application Support/ServerDrivenChat/M24'
    else:
        profile_root=root
    user_data=profile_root/'vscode-user'
    extensions=profile_root/'vscode-extensions'
    host_code=pathlib.Path.home()/'Applications/ServerDrivenChat VS Code 1.140.app/Contents/MacOS/Code'
    contents.joinpath('MacOS').mkdir(parents=True,exist_ok=True)
    resources.mkdir(parents=True,exist_ok=True)
    plist='<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>local.serverdrivenchat.vscode</string><key>CFBundleName</key><string>ServerDrivenChat VS Code</string><key>CFBundleExecutable</key><string>launch</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>'
    contents.joinpath('Info.plist').write_text(plist)
    if sys.platform != 'darwin':
        executable.write_text('#!/bin/sh\nexec "/Applications/Visual Studio Code.app/Contents/MacOS/Code" --user-data-dir '+shlex.quote(str(user_data))+' --extensions-dir '+shlex.quote(str(extensions))+' --new-window "$@"\n')
        executable.chmod(0o755)
        return
    def c_string(value):
        return json.dumps(value,ensure_ascii=False)
    source='''#include <stdio.h>\n#include <unistd.h>\n\nint main(void) {\n    const char *code = '''+c_string(str(host_code))+''';\n    if (access(code, X_OK) != 0) {\n        code = "/Applications/Visual Studio Code.app/Contents/MacOS/Code";\n    }\n    if (access(code, X_OK) != 0) {\n        code = "/Applications/Visual Studio Code.app/Contents/MacOS/Electron";\n    }\n    if (access(code, X_OK) != 0) {\n        fputs("Visual Studio Code executable was not found\\n", stderr);\n        return 127;\n    }\n    char *const arguments[] = {\n        (char *)code,\n        "--user-data-dir", '''+c_string(str(user_data))+''',\n        "--extensions-dir", '''+c_string(str(extensions))+''',\n        "--new-window",\n        NULL\n    };\n    execv(code, arguments);\n    perror("Could not start Visual Studio Code");\n    return 127;\n}\n'''
    source=source.replace('#include <stdio.h>\n#include <unistd.h>', '#include <stdio.h>\n#include <stdlib.h>\n#include <unistd.h>')
    source=source.replace('    char *const arguments[] = {', '    if (setenv(\"NODE_EXTRA_CA_CERTS\", '+c_string(str(root/'tls/ca.pem'))+', 1) != 0) {\n        perror(\"Could not configure the project CA for isolated Node processes\");\n        return 1;\n    }\n    char *const arguments[] = {')
    source_path=resources/'launch.c'
    source_path.write_text(source)
    subprocess.run(['clang','-arch','arm64','-O2','-o',str(executable),str(source_path)],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['codesign','--force','--sign','-','--identifier','local.serverdrivenchat.vscode',str(bundle)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

root.mkdir(parents=True,exist_ok=True,mode=0o700);root.chmod(0o700)
if (root/'provisioned.json').exists():
    if a.refresh_oidc_redirects:
        from local_oidc import refresh_redirects
        refresh_redirects(root)
        print('Exact local control-page callback configured; recreate the server to load its updated allowlist. No credentials rotated.')
        raise SystemExit(0)
    if a.refresh_vscode_launcher:
        provision_vscode_launcher()
        print('Isolated VS Code launcher rebuilt without changing deployment secrets or data.')
        raise SystemExit(0)
    print('Existing local settings retained; no keys, credentials or data rotated.');raise SystemExit(0)
if list(root.iterdir()):
    raise SystemExit('Refusing to initialize nonempty unprovisioned state directory')
for name in ['tls','realm','attachments','signing','vscode-user','vscode-extensions']:
    (root/name).mkdir(mode=0o755)
# Parent state directory is private; the isolated non-root container needs initial mount write access.
(root/'attachments').chmod(0o777)
def write(name,text,mode=0o600):
    f=root/name;f.write_text(text);f.chmod(mode)
def openssl(*args):
    subprocess.run(['openssl',*args],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
openssl('req','-x509','-newkey','rsa:3072','-nodes','-keyout',str(root/'tls/ca-key.pem'),'-out',str(root/'tls/ca.pem'),'-days','1825','-subj','/CN=ServerDrivenChat Local CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign')
openssl('req','-new','-newkey','rsa:2048','-nodes','-keyout',str(root/'tls/privkey.pem'),'-out',str(root/'tls/localhost.csr'),'-subj','/CN=localhost')
write('tls/extensions.cnf','subjectAltName=DNS:localhost,DNS:proxy,IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n')
openssl('x509','-req','-in',str(root/'tls/localhost.csr'),'-CA',str(root/'tls/ca.pem'),'-CAkey',str(root/'tls/ca-key.pem'),'-CAcreateserial','-out',str(root/'tls/fullchain.pem'),'-days','365','-extfile',str(root/'tls/extensions.cnf'))
for name in ['decision.pem','signing/release-ed25519.pem']:
    openssl('genpkey','-algorithm','ED25519','-out',str(root/name));(root/name).chmod(0o600)
openssl('pkey','-in',str(root/'signing/release-ed25519.pem'),'-pubout','-out',str(root/'signing/release-public.pem'))
(root/'tls/ca-key.pem').chmod(0o600);(root/'tls/privkey.pem').chmod(0o600)
db,identity,admin,user=[secrets.token_urlsafe(32) for _ in range(4)]
write('postgres.env',f'POSTGRES_DB=sdc\nPOSTGRES_USER=sdc_app\nPOSTGRES_PASSWORD={db}\n')
write('postgres-init.sql',f"CREATE USER sdc_identity WITH PASSWORD '{identity}';\nCREATE DATABASE sdc_identity OWNER sdc_identity;\n",0o644)
write('keycloak.env',f'KC_DB_PASSWORD={identity}\nKC_BOOTSTRAP_ADMIN_USERNAME=sdc-admin\nKC_BOOTSTRAP_ADMIN_PASSWORD={admin}\n')
write('server.env',f'DATABASE_URL=postgres://sdc_app:{db}@postgres:5432/sdc\nSDC_OIDC_ISSUER=https://localhost:15943/identity/realms/sdc\nSDC_OIDC_CLIENT_ID=sdc-native\nSDC_OIDC_API_AUDIENCE=sdc-api\nSDC_OIDC_REDIRECT_URIS=vscode://server-driven-chat.sdc-cline-bridge/auth;http://127.0.0.1:15945/callback;https://localhost:15943/\nSDC_PUBLIC_API_TOOL_BINDINGS_JSON=[]\n')
write('gateway.env','PYTHONUNBUFFERED=1\n')
write('compose.env',f'SDC_DOMAIN=localhost\nSDC_LOCAL_STATE={root}\nSDC_DB_ENV_FILE={root}/postgres.env\nSDC_SERVER_ENV_FILE={root}/server.env\nSDC_GATEWAY_ENV_FILE={root}/gateway.env\nSDC_DECISION_KEY_FILE={root}/decision.pem\nSDC_ATTACHMENT_DIR={root}/attachments\nSDC_TLS_DIR={root}/tls\n')
realm={'realm':'sdc','enabled':True,'sslRequired':'all','registrationAllowed':False,'clients':[{'clientId':'sdc-native','enabled':True,'publicClient':True,'standardFlowEnabled':True,'directAccessGrantsEnabled':False,'redirectUris':['vscode://server-driven-chat.sdc-cline-bridge/auth','http://127.0.0.1:15945/callback'],'attributes':{'pkce.code.challenge.method':'S256'},'protocolMappers':[{'name':'api-audience','protocol':'openid-connect','protocolMapper':'oidc-audience-mapper','config':{'included.custom.audience':'sdc-api','access.token.claim':'true','id.token.claim':'false'}}]}],'users':[{'username':'sdc-local','enabled':True,'email':'local@sdc.invalid','emailVerified':True,'firstName':'SDC','lastName':'Local','credentials':[{'type':'password','value':user,'temporary':False}]}]}
realm['clients'][0]['redirectUris'].append('https://localhost:15943/')
write('realm/sdc-realm.json',json.dumps(realm),0o644)
write('login.json',json.dumps({'username':'sdc-local','password':user}))
write('LOCAL-LOGIN.txt',f'Local SDC login: https://localhost:15943\nUsername: sdc-local\nPassword: {user}\n\nKeycloak admin: https://localhost:15943/identity/admin/\nUsername: sdc-admin\nPassword: {admin}\n')
provision_vscode_launcher()
write('provisioned.json',json.dumps({'url':'https://localhost:15943','issuer':'https://localhost:15943/identity/realms/sdc','mode':'local Docker','secrets':'outside checkout; never copy into evidence'}))
print('Local deployment settings and graphical isolated VS Code launcher provisioned. Secrets remain in the private state directory.')
