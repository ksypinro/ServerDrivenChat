#!/bin/sh
set -eu
umask 077

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
    echo "Usage: $0 /path/to/compose.env /path/to/backup-directory [compose-overlay.yaml]" >&2
    exit 2
fi

compose_env=$1
backup_dir=$2
compose_file=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/compose.yaml
compose_overlay=${3:-}
compose() {
    if [ -n "$compose_overlay" ]; then
        docker compose --env-file "$compose_env" -f "$compose_file" -f "$compose_overlay" "$@"
    else
        docker compose --env-file "$compose_env" -f "$compose_file" "$@"
    fi
}
if [ ! -f "$compose_env" ]; then
    echo "Compose environment file not found" >&2
    exit 2
fi
running=$(compose ps --status running --services)
if printf '%s\n' "$running" | grep -Eq '^(server|gateway|keycloak)$'; then
    echo "Stop server, gateway and any local Keycloak before taking a consistent database/attachment backup" >&2
    exit 2
fi
attachment_dir=$(compose config --format json | python3 -c 'import json,sys; c=json.load(sys.stdin); print(next(v["source"] for v in c["services"]["server"]["volumes"] if v["target"]=="/var/lib/sdc/attachments"))')
if [ ! -d "$attachment_dir" ]; then
    echo "Configured attachment directory does not exist" >&2
    exit 2
fi
identity_db=$(compose config --format json | python3 -c 'import json,re,sys; c=json.load(sys.stdin); u=c.get("services",{}).get("keycloak",{}).get("environment",{}).get("KC_DB_URL",""); name=u.rsplit("/",1)[-1] if u else ""; assert not name or re.fullmatch("[a-zA-Z0-9_]+",name); print(name)')
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
backup_set="$backup_dir/m24-$stamp.incomplete"
mkdir "$backup_set"
chmod 700 "$backup_set"
compose exec -T postgres sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_set/postgres.dump"
if [ -n "$identity_db" ]; then
    compose exec -T postgres sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$1" -Fc' sh "$identity_db" > "$backup_set/identity.dump"
    chmod 600 "$backup_set/identity.dump"
fi
tar -C "$attachment_dir" -czf "$backup_set/attachments.tar.gz" .
chmod 600 "$backup_set/postgres.dump" "$backup_set/attachments.tar.gz"
(cd "$backup_set" && if command -v sha256sum >/dev/null 2>&1; then
    sha256sum postgres.dump attachments.tar.gz
    if [ -f identity.dump ]; then sha256sum identity.dump; fi
else
    shasum -a 256 postgres.dump attachments.tar.gz
    if [ -f identity.dump ]; then shasum -a 256 identity.dump; fi
fi) > "$backup_set/SHA256SUMS"
chmod 600 "$backup_set/SHA256SUMS"
mv "$backup_set" "$backup_dir/m24-$stamp"
backup_set="$backup_dir/m24-$stamp"
printf 'Backup created at %s\n' "$backup_set"
