# Contributing to ServerDrivenChat

Thanks for helping improve ServerDrivenChat. Bug reports, documentation fixes,
tests and focused code changes are welcome. Please be respectful and constructive
in issues and reviews, and help new contributors understand your reasoning.

## Before starting

Read [README.md](README.md), [requirements.md](requirements.md),
[AGENTS.md](AGENTS.md), and the current [implementation tracker](IMPLEMENTATION_TRACKER.md).
The tracker includes historical checkpoints; use its latest completion entries.
For a new adapter, native version, public API capability or architecture change,
open an issue describing the proposal before implementing a large change.
Small fixes and documentation corrections can go straight to a pull request.

The server coordinates an existing graphical application. Do not introduce a
replacement model executor or bypass native permissions. Protocol/shared packages
must remain vendor-neutral; provider formats belong at the gateway and native
integration belongs in adapters. New native versions require reviewed pins and
fresh native acceptance, not only passing simulated tests.

## Set up a development checkout

1. Fork the repository on GitHub and clone your fork.
2. Create a branch, for example `git switch -c fix/describe-the-change`.
3. Install Node.js 24 LTS and npm 11 (`.nvmrc` specifies the Node major).
4. From the repository root, run:

   ```sh
   npm ci
   npm run build
   npm run lint
   npm test
   ```

Use `npm ci` to preserve the committed dependency graph. Pin direct dependency
versions and include lockfile updates when intentionally changing dependencies.
For the Python gateway, use its exact Python pin and `uv sync --locked`;
follow [api-gateway/README.md](api-gateway/README.md) for checks and configuration.
For the Swift core on macOS with Swift 6.2 and the macOS 15 SDK or newer:

```sh
swift test --package-path companion
```

## Understand the test levels

The default Node suite builds on generated workspace output and runs portable
checks. External database checks skip unless their documented environment variables
are supplied. The preserved native-bundle pin check also skips when the historical
release artifacts are absent; set `SDC_REQUIRE_NATIVE_ARTIFACTS=1` to make their
absence a failure during release qualification. A skip is not native acceptance.

For PostgreSQL checks, use the disposable loopback service and commands in the
[developer setup](README.md#developer-setup). Never point destructive integration
fixtures at a real deployment database. Run Docker restart/restore checks separately
from other database tests. Stop the disposable service when finished.

Run focused tests for your change, then build/lint/root tests for cross-package
changes. Stateful behavior needs failure/recovery tests. Changes affecting actual
native behavior also need fresh graphical acceptance with explicit user consent.
Record commands, outcomes and skipped checks in your pull request.

## Code and documentation conventions

- TypeScript uses strict ESM/NodeNext, four-space indentation and named exports.
  Avoid `any` unless a documented boundary requires it.
- Swift uses four-space indentation and comments for public APIs.
- Preserve protocol spelling, requirement IDs, authority checks, cancellation,
  durable ordering and dependency direction.
- Keep documentation accurate about simulated versus real native behavior and
  the exact versions tested. Do not expand support claims from endpoint shape alone.
- Do not rewrite frozen acceptance records to make a new implementation look accepted.

## What belongs in a pull request

Include source, tests, documentation and required lockfiles. Exclude dependencies,
build outputs, VSIX archives, local editor settings, chat transcripts, raw evidence,
database backups, passwords, tokens, private certificates and signing keys.
Use `.env.example` files with placeholders or clearly disposable test-only values.
See [source distribution notes](docs/source-distribution.md) for omitted local artifacts.

Before committing, inspect `git status --short`, `git diff --check`, and
`git diff --cached`. An ignore rule cannot protect a secret already tracked.
Do not paste real credentials or user conversation contents into an issue or test.
See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Submit and review

Open a pull request against `main`. Explain the problem, the resulting behavior,
why the change is needed, and how you verified it. Reference relevant issue and
requirement IDs. Keep unrelated changes separate. Describe limitations and any
migration, configuration or native permission impact. Maintainers may request
changes before merging; respond with the evidence needed to review them.

## Licensing

By submitting project-owned contributions, you agree to provide them under this
repository's [MIT license](LICENSE). Only contribute material you have the right
to share. Preserve upstream copyright, license and attribution notices; Cline-derived
material retains its separate Apache-2.0 terms. See [third-party notices](THIRD_PARTY_NOTICES.md).
