# MB-02/MB-03 implementation evidence

Date: 2026-10-11. Evidence level: contract and host fixtures, plus real local
file-backed SQLite through the existing bridge. HTTP/vendor effects are simulated.
The OIDC callback tests use a real loopback listener with simulated identity-provider
responses. No new native backend is qualified.

## Implemented

- Local driver contract 1.0, strict descriptor schema/parsers, exact host/driver/native
  artifact qualification, native/simulation distinction and per-operation limits.
- Policy/consent/live capability intersection and explicit queue-fencing requirements.
- Host-owned registry and native selection generation; stale/wrong identity rejection.
- Generic connection lifecycle with effect-time authority, local abort, safe switching,
  late startup cleanup, driver removal, and uncertain detach reconciliation.
- Separate `extensions/vscode-host` workspace with generic graphical configuration,
  consent/sign-in/pairing, SecretStorage namespaces and the existing SQLite/HTTP/SSE
  bridge. Its production native catalog is intentionally empty.
- Durable registration-intent markers block automatic rebind after uncertain HTTP
  effects. Server detach or successful scoped device revocation is required to retire
  them. Markers contain IDs; credentials are stored only in SecretStorage.
- Selected-scope revoke/forget, including revocation using owner authentication when
  a retained device's credential has been lost. Failure retains local recovery state.

The accepted Cline extension source/package identity has not been migrated into the
generic host. No Cline, Codex or Claude authentication/grant/model execution occurred.
The earlier Cline native acceptance remains evidence for its exact old pair only.

## Verification

Toolchain: Node 24.19.0, npm 11.12.1. Exact commands were executed through:

```sh
npx --yes --package=node@24.19.0 --package=npm@11.12.1 -c 'npm ci'
npx --yes --package=node@24.19.0 --package=npm@11.12.1 -c 'npm run build && npm run lint && npm test'
```

`npm install --package-lock-only --ignore-scripts` updated the lock before `npm ci`
when adding the host workspace. No third-party dependency version changed.

At the MB-03 boundary, build/lint succeeded and root tests passed **152**, with
**55 optional database tests skipped**, 0 failures (207 total). The skipped checks
are not integration proof. The new contract, host and service tests cover descriptor
drift/missing exports, unsupported limits, core/text-only subsets, consent, same-ID
generation changes, wrong binding, cancelled/expired queued effects, late startup,
uncertain/failed detach, switching and multi-window/storage isolation. The existing
auth callback test now runs both old and generic UI implementations sequentially to
avoid contention on their shared callback port.

An initial MB-02 test fixture accidentally shared object references between observed
inventory and qualification. Independent copies fixed that test setup. No failed
fixture result was counted as acceptance. Review additionally tightened limits,
selection generations, and cleanup so server failure still attempts native detach.

## Remaining acceptance

MB-03 is complete for its stated experimental source/fixture boundary. The empty
catalog prevents user-facing native controls. A reviewed loader/registration package,
exact candidate packaging and native Cline regression/lifecycle acceptance belong to
MB-04. Claude/Codex still require the supported routes in MB-01. No release, native
behavior, production identity or three-backend support is inferred from these tests.
