# Server control interface (M14)

> **Current user instructions:** Start with the [M24/M25 beginner manual](guide/README.md). This document preserves its historical milestone/pin and implementation details; its old package names are not the current installation target.

The control interface is a same-origin React 19 app in `control-ui/`. The server serves the production build from `control-ui/dist/` and provides authenticated session discovery at `GET /v2/sessions`. It displays only sessions the signed-in user may view, together with the session role, latest binding, lease state, and adapter capability reasons.

## Development setup

Configure the server's OIDC provider with the exact callback URI `http://127.0.0.1:5173/` for local development and the deployed same-origin root for production. The UI asks the server to start and exchange the authorization-code flow; the server retains the PKCE verifier/nonce and registers the verified OIDC identity before issuing the access token. The SPA keeps the access token in tab memory and never puts it in a URL or persistent browser storage. Copy `control-ui/.env.example` to `control-ui/.env.local` and set `SDC_API_ORIGIN` only when the Vite dev proxy should use a non-default loopback API address. For production, build the workspace and start the server with its OIDC provider configuration; `/` serves the UI and `/v2/` serves the API.

## Behavior and boundaries

- Select from the caller's existing sessions and show the bound app/conversation identity, connection lease, and supported/unsupported/unverified capabilities. A missing lease or unsupported operation disables the corresponding action.
- Render transcript content as text, preserve partial/unknown labels, show artifacts with authorized downloads, and use authenticated fetch-based SSE with snapshot refresh for reconnect recovery.
- Queue prompts with the current binding fence and conversation revision. Images and files upload to the authorized M13 endpoint, are checksum-committed, and are included by opaque attachment ID; upload failure prevents prompt submission.
- Show exact approval action, target, arguments, requested grants, offered choices, evidence source/completeness, and expiry. Grant checkboxes are opt-in per requested grant. Server-recorded, applying, and app-confirmed states remain distinct. There is no global approve action.
- Show clarification questions separately. Operators may prompt; only the owner can approve or request administrative disable. The API remains authoritative for each role. Stop requests require supported cancellation. Server disable is labelled as pending remote dispatch and points to the companion's immediate local disable.

The browser suite runs real Chrome against a development server with a deterministic OIDC/API fixture. PostgreSQL acceptance independently verifies session listing and server-side role enforcement. Production must allow the UI origin to use `/v2/auth/oidc/start` and `/v2/auth/oidc/exchange`; no token is accepted directly from the browser as an identity registration. No production identity provider, real app adapter, deployed storage, or native action is claimed by this milestone.
