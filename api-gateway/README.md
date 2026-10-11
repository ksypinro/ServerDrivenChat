# SDC FastAPI gateway — M27/M28/M29/M30/M24

Typed authenticated first-party REST/SSE and the declared [OpenAI API profile](../docs/openai-api-profile.md) and [Anthropic API profile](../docs/anthropic-api-profile.md) run over the existing server. Durable state, credential authority, scheduling and native execution stay in their original owners. M27 real connection/authority acceptance is complete. M28 implements model discovery, Chat Completions and Responses. M29 adds Anthropic discovery, Messages and server-owned input estimates, including status-sensitive caller tool results. Official SDK packages are pinned test consumers only. M30 completed its recorded native/SDK/Aider subsets; arbitrary named tool-using clients remain unqualified. M24 accepted the selected persistent local HTTPS deployment. Start with the [current API/client guide](../docs/guide/api-guide.md) and [support matrix](../docs/guide/support-matrix.md).

Developer setup (graphical native setup/consent remains required):

```sh
cd api-gateway
uv sync --locked
SDC_SERVER_URL=http://127.0.0.1:3000 uv run --locked python -m sdc_gateway
```

Use Python **3.13.16**, uv **0.12.23** for the recorded lock workflow, FastAPI **0.142.4**, Uvicorn **0.54.0**, HTTPX **0.28.1**, Pydantic **2.12.5**. All transitive versions/hashes are in `uv.lock`. Python 3.13's maintenance/security schedule and the official package Python support metadata were reviewed on 2026-10-08: [Python release](https://www.python.org/downloads/release/python-31316/), [schedule](https://peps.python.org/pep-0719/), [FastAPI](https://pypi.org/project/fastapi/0.142.4/), [Uvicorn](https://pypi.org/project/uvicorn/0.54.0/), [HTTPX](https://pypi.org/project/httpx/0.28.1/), [Pydantic](https://pypi.org/project/pydantic/2.12.5/). This is a reproducible tested set, not a claim of indefinite support or a production dependency audit.

The default listener is loopback port 8000, with access logging disabled and bounded concurrency. `SDC_SERVER_URL` is a fixed HTTPS origin or loopback HTTP. A deployment may explicitly set `SDC_TRUSTED_HTTP_UPSTREAMS=http://server:3000` only for a fixed service URL on its private isolated network; the M24 Compose file uses that for `http://server:3000`. User URLs, database credentials and redirection are rejected. No cross-origin browser access is enabled. See [`deploy/m24`](../deploy/m24/README.md) for the accepted local TLS edge and the remaining distinction from Internet production.

[`openapi.json`](openapi.json) is generated from `create_app().openapi()`. [REST semantics and desktop contract](../docs/public-rest-api.md) define retries, limits, scopes, controls and retention.

Checks:

```sh
uv run --locked python -m pytest -q
M27_TEST_DATABASE_URL=postgres://sdc_m06_test:m06_local_test_only@127.0.0.1:55432/sdc_m06_test \
SDC_TEST_NODE=/path/to/node24 uv run --locked python -m pytest -q
```

Build the TypeScript workspace first. Integration fixtures create/drop isolated schemas and listeners; their identity provider and native outputs are explicitly simulated. M28 SDK fixtures do not establish live Cline tool safety or named coding-client compatibility. Separate [M27 real Cline evidence](../evidence/M27/restart-media-run/README.md) establishes the declared connection/control profile. `uv`/npm commands are developer tooling, not a product installation/control journey.
