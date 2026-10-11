# macOS companion (M15)

> **Current user instructions:** Start with the [M24/M25 beginner manual](guide/README.md). This document preserves its historical milestone/pin and implementation details; its old package names are not the current installation target.

The SwiftUI companion is the graphical shell for the local bridge host. M15 uses a deterministic **Fake Chat** adapter to exercise conversation selection, connection state, sleep/wake recovery, local disable, and completed-turn lifecycle. It does not connect to Codex or Cline and does not start an LLM process. Real app binding and remote command delivery are later milestones.

## Build and launch

On macOS 15 or later with Xcode 27 / Swift 6.2 or newer:

```sh
swift test --package-path companion
npm run companion:package
open companion/dist/ServerDrivenChatCompanion.app
```

The packaging script builds and wraps the executable as a Finder-launchable `.app`, including the `sdccompanion://auth` callback registration. This is a local development bundle, not signed or notarized; distribution signing and installer polish are M24. The companion can launch from Finder without a terminal after it is built.

## Configure sign-in and pair this Mac

Set the server origin and a display name in **Sign in & pair** or **Settings**. HTTPS is required except for loopback development URLs. Configure the server's OIDC client with the exact redirect URI `sdccompanion://auth`. Sign-in uses the server's PKCE start/exchange endpoints, then stores access and refresh tokens in the macOS Keychain.

Start pairing after sign-in. The app creates a random local challenge and stores it in Keychain; only its hash is held by the server. The displayed short code must be confirmed by the authenticated user. A second, explicit local consent action activates the device credential and saves it to this Mac's Keychain. The two confirmations are independently enforced and the pairing challenge is one-use. The server URL/name are ordinary preferences; credentials are not written to preferences or URLs.

The local **Disable remote control** action synchronously blocks new dispatch in the companion state gate and detaches the preview, without relying on network access. Sleep marks the connection stale; wake does not resume dispatch until a connection/lease renewal. A completed simulated turn leaves the host running. App termination moves the lifecycle to shutdown.

## M15 scope

The app/session picker and capability list are explicitly fake fixtures. Unsupported operations remain unavailable. Accessibility and screen-recording privacy panes can be opened for future UI-assisted adapters, but M15 requests neither permission because the fake adapter does not need them. Server command subscription and real vendor bindings start at M16 and later.
