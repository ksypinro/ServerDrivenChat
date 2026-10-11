#!/bin/sh
# Developer-only clean build and conformance verification. No app control or product setup.
set -eu
M23_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
M23_STAGE=$(mktemp -d /private/tmp/sdc-m23-node24.XXXXXX)
trap 'rm -rf "$M23_STAGE"' EXIT HUP INT TERM
(cd "$M23_ROOT" && tar --exclude='node_modules' --exclude='dist' --exclude='.build' --exclude='evidence' --exclude='.git' -cf - .) | (cd "$M23_STAGE" && tar -xf -)
M23_PIN=extensions/vscode/dist/cline-4.1.22-sdc-m21.3
mkdir -p "$M23_STAGE/$M23_PIN/dist"
cp "$M23_ROOT/$M23_PIN/package.json" "$M23_STAGE/$M23_PIN/package.json"
cp "$M23_ROOT/$M23_PIN/dist/extension.js" "$M23_ROOT/$M23_PIN/dist/sdc-native.cjs" "$M23_STAGE/$M23_PIN/dist/"
docker run --rm --network serverdrivenchat_default -v "$M23_STAGE:/work" -w /work \
 -e M06_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@postgres-m06:5432/sdc_m06_test \
 -e M08_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@postgres-m06:5432/sdc_m06_test \
 -e M09_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@postgres-m06:5432/sdc_m06_test \
 -e M10_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@postgres-m06:5432/sdc_m06_test \
 -e M11_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@postgres-m06:5432/sdc_m06_test \
 -e M14_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@postgres-m06:5432/sdc_m06_test \
 -e M15_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@postgres-m06:5432/sdc_m06_test \
 -e M21_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@postgres-m06:5432/sdc_m06_test \
 -e M22_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@postgres-m06:5432/sdc_m06_test \
 -e M23_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@postgres-m06:5432/sdc_m06_test \
 node@sha256:64af3819f9275802414d7cdc38c27e9d82bd564dec4d4da87d008255d36c63b4 \
 sh -ec 'node --version; npm --version; npm ci; npm run build; npm run lint; npm test'
