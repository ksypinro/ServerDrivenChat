# M27 server-owned implementation evidence

The server owns API composition/history/tools/accounting; native Cline remains the executor. M27 remains In Progress pending fresh current-companion native acceptance. M28 is authorized next, but has not started.

- `build.log` / `lint.log`: root workspace checks.
- `root-tests.log`: 162 real/fixture regression cases, including isolated PostgreSQL and dump/restore (no live identity realm).
- `server-tests.log`: 22 focused server/REST/policy tests; native events are simulated.
- `gateway-tests.log`: 11 FastAPI checks including actual TypeScript HTTP/PostgreSQL and TCP.
- `historical-validators.log`: preserved M19–M23 artifacts/evidence only, not new native acceptance.
- `verification.json`: current implementation and remaining gates.

New native-run files are in `../server-owned-run/`; until their status is validated as passed, they establish setup attempts only. Native and candidate companion packages are unchanged. No Git checkout/commit is available.
