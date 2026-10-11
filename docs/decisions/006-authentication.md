# DECISION-006 — Authentication and identity provider

**Status:** Accepted for planned implementation. **Scope:** M03/M08.

Use OpenID Connect authorization-code flow with PKCE for human sign-in, backed initially by a self-hosted Keycloak realm. Keep provider-specific discovery/token verification behind a small authentication-provider interface so a deployment can replace Keycloak without changing protocol/session authorization. Pairing a local device to a server session is a separate short-lived user-confirmed operation; OIDC login does not itself bind an app/task.

The browser uses the system authorization flow for the native companion, with the verifier held locally and refresh credentials in Keychain. Server sessions derive user/role from validated issuer, audience, expiry, signature, and configured claims. No implicit grant, password collection by the app, credentials in URLs, or model-supplied reviewer identity. M08 defines exact claims, pairing, roles, rotation and revocation. M03 configures no realm/provider or credentials.

M08 implements the provider interface and Keycloak-compatible authorization-code + PKCE verifier, exact redirect allowlisting, OIDC subject linking, server-side role checks, separately authenticated device credentials, and Ed25519 request-bound decision assertions. The native companion vault stores opaque credentials as Keychain generic-password data with `AfterFirstUnlockThisDeviceOnly`. No Keycloak realm, HTTP routes, or graphical sign-in screen is provisioned by this decision; route wiring is M09 and GUI flows are later companion work.

## Public API identity amendment — 2026-10-08

[DECISION-009](009-fastapi-public-api.md) requires server-owned scoped, revocable SDC credentials/service principals for API integrations, with human-owned issuance/review and session/model restrictions. The existing user OIDC flow does not establish machine-client support. Gateway header translation must preserve caller identity and live authorization rather than reuse an owner/device token. M27 owns the new ledger/delegation contract; M24 owns real public identity deployment. No credential or provider configuration is created by this plan change.
