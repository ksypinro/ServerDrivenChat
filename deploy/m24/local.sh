#!/bin/sh
set -eu
operation=${1:-status}
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
state=${SDC_LOCAL_STATE:-$root/../ServerDrivenChat-local/m24}
compose() { docker compose -p sdc-local --env-file "$state/compose.env" -f "$root/deploy/m24/compose.yaml" -f "$root/deploy/m24/local.compose.yaml" "$@"; }
case "$operation" in
    up) compose up -d --wait --wait-timeout 150 ;;
    stop) compose stop ;;
    status) compose ps ;;
    build) compose build ;;
    backup)
        compose stop proxy gateway server keycloak
        COMPOSE_PROJECT_NAME=sdc-local "$root/deploy/m24/backup.sh" "$state/compose.env" "$state/backups" "$root/deploy/m24/local.compose.yaml"
        ;;
    verify) cd "$root"; node deploy/m24/sign-release.mjs verify "$state/signing/release-public.pem" ;;
    *) echo "Usage: $0 up|stop|status|build|backup|verify" >&2; exit 2 ;;
esac
