# M30 pinned Aider candidate

Aider **0.86.2** is locked in `uv.lock` for Python **3.12.15**. It is an
acceptance client, not part of the server runtime or a released application.
Run `uv sync --locked --python <Python 3.12 path>` in this directory before
using the local `sdc_aider.py` entry point.

The original Aider request has no `Idempotency-Key` and sends `temperature=0`.
The SDC gateway correctly rejects both before native dispatch. The pinned
entry point assigns one key for each `Coder.send`, preserves it through Aider's
outer retry loop, and gives a new key to a later identical user submission.
The model settings omit temperature and disable inner LiteLLM retries. The
entry point allows only `openai/sdc-default` and `anthropic/sdc-default`,
sets `X-SDC-Context-Mode: shared-task`, and stores no bearer credential.

For OpenAI Chat, point `--openai-api-base` at `<gateway>/openai/v1` and pass
`--openai-api-key` from a disposable scoped SDC credential. For Anthropic
Messages, set `ANTHROPIC_API_BASE=<gateway>/anthropic` and pass
`--anthropic-api-key` from that credential; LiteLLM appends `/v1/messages`.
Use `--model-settings-file` with this directory's `model-settings.yml`,
`--model openai/sdc-default` or `--model anthropic/sdc-default`, and disable
repo map/auto commits for bounded acceptance. The native runner also uses
`empty-config.yml` and an empty env file so personal Aider configuration is
not loaded, disables shell suggestions, auto linting and notifications, and
passes only the disposable profile credential to the selected provider.
`--edit-format whole` is the coding-edit path. The real installed Cline run
passed two sequential local edits for each text profile with no native Cline
`tool` events; see `evidence/M30/native-run/aider-native.json`. This does not
qualify a caller-tool profile or process-loss retry recovery.

Run `./.venv/bin/python -m unittest test_sdc_aider.py -v` here for the
stateful shim tests. `evidence/M30/aider-wire.jsonl` contains sanitized wire
samples with only a short SHA-256 digest of each retry key. A process crash
after an ambiguous send loses Aider's in-memory key. That recovery case is
outside the accepted pinned text/whole-file profile until an explicit
original-key recovery path is proved.
