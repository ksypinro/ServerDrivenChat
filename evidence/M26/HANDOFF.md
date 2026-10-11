# Maintainer handoff for the frozen local release

M26 is Done for the frozen local release subsets. The final gate audit, actual-hour reports and live-key local-disable/cleanup test passed. [Final state](final-state.json): five persistent services healthy, bridge disconnected, task/history retained, approvals disabled, zero unrevoked M26 test keys and disposable PostgreSQL stopped. See [release report](README.md), [FR-01–FR-28 traceability](traceability.md), [exact support matrix](../../docs/guide/support-matrix.md) and [frozen candidate](frozen-candidate.json).

## What is shipped

The unchanged M24 pair is maintained Cline4.1.2204/native API1.3 plus companion0.7.3 in official isolated VS Code1.140.0 on macOS arm64. It controls the retained Cline task through its reviewed native API. The persistent local Docker services expose verified HTTPS at `https://localhost:15943`; FastAPI forwards requests to the existing authoritative TypeScript server and Cline executes the model. Genuine local Keycloak provides identity.

The signed manifest covers the two exact VSIX archives. [M24 graphical lifecycle](../M24/persistent-local/package-lifecycle.json) performed actual uninstall/reinstall, retained history and fresh pairing for this same pair immediately before release qualification. M26 did not repeat installation or silently replace that evidence. Source hashes identify this checkout because it has no Git metadata. [Freeze validation](freeze-validation.json) compares90product/lock/contract files, installed files and all five running image IDs.

The final native profile uses prompts/questions/cancel, with approvals disabled. The user temporarily authorized once/deny tests only under the disposable native-sandbox; Auto-approve remained None. Caller functions remain withheld on this deployment. Root/gateway fixtures and historical M30 qualified-tool records do not automatically grant new current native access.

## Reproduce developer checks

These commands belong to maintainers. Everyday users should follow the [graphical beginner guide](../../docs/guide/user-guide.md), not run the test drivers. Use Node24/npm11 and the exact Python/uv pins; do not use a different runtime and silently reuse the release result.

```sh
node --version
npm --version
npm ci
npm run build
npm run lint
docker compose up -d postgres-m06
```

Enable every repository database suite for the disposable database, then run the root suite. This URL is the explicitly documented test-service credential, never a persistent deployment credential.

```sh
SDC_M26_TEST_URL='postgres://sdc_m06_test:m06_local_test_only@127.0.0.1:55432/sdc_m06_test'
for milestone in 06 08 09 10 11 14 15 21 22 23 27 30; do
    export "M${milestone}_TEST_DATABASE_URL=$SDC_M26_TEST_URL"
done
M06_TEST_DOCKER_RESTORE=1 npm test
swift test --package-path companion
```

Run restart/restore qualification separately from every database-dependent suite or soak. A restart can terminate another fixture's live pool. The first M26 bridge soak was interrupted by this exact orchestration mistake; its crash is retained and its replacement runs without fault injection.

```sh
M06_TEST_DATABASE_URL="$SDC_M26_TEST_URL" \
M06_TEST_DOCKER_RESTART=1 M06_TEST_DOCKER_RESTORE=1 npm run test:m06
```

From `api-gateway/`, use Python3.13.16 and uv0.12.23:

```sh
uv sync --locked --all-groups
M27_TEST_DATABASE_URL="$SDC_M26_TEST_URL" uv run --locked pytest -q
```

From `tests/clients/aider/`, use its separate Python3.12.15 lock:

```sh
uv sync --locked
uv run --locked python -m unittest -v test_sdc_aider
```

From the repository root, measured bridge checks use real HTTP/PostgreSQL/file-backed SQLite but explicitly simulated native effects:

```sh
M26_TEST_DATABASE_URL="$SDC_M26_TEST_URL" node tests/helpers/m26-performance-soak.mjs
M26_TEST_DATABASE_URL="$SDC_M26_TEST_URL" node tests/helpers/m26-performance-soak.mjs --soak
```

Do not restart databases or services during healthy latency/final soak measurements. The second command takes a real hour; it is not a fast test. Keep the disposable service alive until its fixture exits.

## Real native qualification

The `scripts/m26-native-*.mjs` drivers are public API test consumers. They never run a replacement model. `m26-human-auth.mjs` uses the registered PKCE loopback callback, retains bearer tokens only in process memory and refreshes the original owner authorization. Password entry remains human. It must not read/copy private login, token, vault or environment files into evidence.

Trust only the previously verified public CA with additive `NODE_EXTRA_CA_CERTS`, preserving certificate validation. Python/Aider uses the normal certifi roots plus that public CA; replacing all roots with only the private CA caused an external metadata-fetch warning in the first Aider run. The corrected current Aider rerun passed.

`m26-start-soak.mjs` first verifies a committed JPEG through all four supported routes, then starts `m26-native-soak.mjs`:30minutes idle with the real native lease, followed by30minutes of serial tool-free marker turns, one scheduled every90seconds. It separately records gateway admission and model-inclusive completion latency. `m26-deployed-soak.py` can concurrently write an independently named monitor report of health, container status and live leases. Do not reuse the preliminary monitor, which deliberately observed takeover/restart faults, as a healthy pass.

After the hour, `m26-final-disable.mjs` issues a fresh bounded key and waits while the maintainer performs graphical **Cline Bridge: Disconnect**. It requires the key still to authenticate200, the old binding's new prompt to fail403, and the durable admitted prompt-command count to stay unchanged. It then revokes the key, checks401 and requires zero unrevoked M26-labeled keys. An expired credential401 does not prove local disable.

Finally run:

```sh
python3 scripts/verify-m25-docs.py
python3 scripts/verify-m26-evidence.py
docker compose stop postgres-m06
```

The second command must pass before marking M26 Done. Verify the trusted release integrity signature with the independently retained public key using `deploy/m24/sign-release.mjs verify`; never sign with or print a private key during verification. Current public package signatures are project Ed25519 integrity, not Marketplace signing.

## Operational boundaries

Leave the five persistent local services healthy, stock editor untouched and native history retained. No Internet/public distribution is authorized by local release qualification. Operator restore/rollback/startup procedures are in the [operator runbook](../../docs/guide/operator-guide.md) and [local deployment guide](../../deploy/m24/LOCAL.md).

Changing a product file, native bundle, package, gateway dependency or deployment image invalidates the corresponding frozen acceptance. Recut fingerprints and rerun affected native/security/contracts/performance checks. Keep failed attempts and corrections visible. New Cline versions, native platforms, named tool clients, Codex/Claude integration and a new Mac client require their own explicit implementation/adoption/acceptance instruction.

The first final-disable checker used a live snapshot cursor as its durable counter. Detached snapshots reset that projection to0, so its assertion failed despite authentication200 and refusal403. [Failed checker attempt](final-local-disable-attempt-1.json) is retained. The corrected checker uses a narrowly scoped read-only command count in the operator’s real PostgreSQL and its [repeat passed](final-local-disable.json). Native mutation requests still use public APIs; this operator evidence read is not gateway database access.
