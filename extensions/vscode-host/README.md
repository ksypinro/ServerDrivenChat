# Experimental generic VS Code backend host

This package implements the MB-03 host candidate. It is a separate extension from
the accepted Cline companion, with no mandatory Cline extension dependency. The
current build has an **empty native qualification catalog**. Its commands can
configure local profiles and explain missing drivers; it cannot control Cline,
Claude, or Codex until their driver and exact host/package qualification are adopted.

The reusable lifecycle engine and registry live in `adapters/core`. This package
supplies graphical consent/authentication, SecretStorage, durable SQLite and the
existing HTTP/SSE bridge. It preserves addressed signed approvals and native effect
authority. The server retains identity, policy, scheduling and history ownership.

## Developer use

Use Node 24/npm 11 and the root workspace build. Launch this folder as an extension
development host only in a disposable local, trusted VS Code window. There is no
release VSIX or production installation claim. Commands appear under **SDC Backend**:
configure server, select conversation and connect, disconnect, status, and revoke
and forget connection credentials. With the empty catalog, Connect explains which
gates are pending and does not sign in or pair.

## Storage and recovery

New keys start with `sdc.backendHost.v1` and include a SHA-256 of the exact profile
origin and backend/native/host selection scope. They do not read or migrate the old
`sdc.profile.*` Cline keys. Native history is never copied. Instance identities
change on extension-host restart; old connection grants are not silently inherited.

Before server binding registration, the host saves a recovery marker containing
only profile/binding/device IDs. Secrets remain in VS Code SecretStorage. A retained
marker blocks reconnection after a crash or uncertain HTTP outcome. Connection
Status can detach retained server bindings using their scoped saved credential.
Failed recovery keeps the marker. The explicit revoke-and-forget flow retires the
device before deleting that scope's credentials/inbox; a successful revocation also
removes its retained markers. Native uncertainty still requires native reconciliation.

The OIDC flow reuses the existing server's allowed loopback callback at
`http://127.0.0.1:15945/callback`. Only one host can run that sign-in listener at a
time; another active listener causes a visible failure. Password entry remains with
the user. New generic-host sign-in, callback, crash recovery and cleanup require
fresh graphical acceptance before publication.

## Verification and remaining gates

`tests/backend-contract.test.mjs` and `tests/backend-host.test.mjs` test qualification,
selection, local consent, wrong identity, queued effects after detach/expiry/native
takeover, late startup, registry removal, uncertain detach and multiple-window
isolation with simulated drivers. No native adapter is certified by those fixtures.
The generic auth callback and bridge service have fixture checks as well. MB-03 is
complete for its experimental source/fixture scope. Actual graphical/native/package
acceptance is still required in MB-04 and subsequent phases before publication.

Driver loading must use an embedded/reviewed catalog, verify complete artifact
identities, and obtain an explicit exported driver API from the matching extension.
There is deliberately no public register-any-object command or workspace-controlled
catalog setting. MB-04 includes the Cline registration package and installed-file loader;
MB-05/06 still require supported Claude/Codex native attachment routes.

## Installed artifact measurement

The host now uses `sdc-installed-tree-v1` to measure every file and directory name
in each installed extension, including VS Code-added manifest metadata. It hashes
file contents, relative paths, sizes and executable bits in deterministic name
order. It does not follow symlinks or ignore extra files. Relative roots, symlink
ancestors, special files, excessive sizes/depth/counts and observed changes during
reading fail closed. This is a consistency/integrity snapshot, not a defense against
an adversary with ongoing write access to the extension host's own installation.

The loader obtains directories from VS Code's extension registry, checks manifest
publisher/name/version, and measures before/after metadata parsing and activation.
An extension inventory change invalidates authority and requires reloading. The macOS editor runtime is now measured as a complete signed app bundle;
unknown runtime identities still fail closed.

After building, developers can inspect an extension without activating it:

```sh
node scripts/measure-backend-artifacts.mjs /absolute/path/to/installed-extension
```

The output explicitly says `inventory-only-not-qualified`. Its digest is not the
VSIX archive hash: installed metadata and executable modes participate in the tree
hash. Record both kinds of identity. Copying an archive hash into the installed-tree
inventory will fail verification.

The production catalog remains empty. The signed local evaluation path below
implements the separate evaluation entry point and external integrity envelope. Embedding the full host's own digest inside its hashed
bundle would be self-referential; do not solve this by excluding arbitrary code or
inventing a passing qualification record.

## Signed local evaluation

**Load Signed Evaluation Plan (Unqualified)** admits only a detached Ed25519-signed
`evaluation` plan from the compiled local evaluation key. A plan pins the full host,
driver, native extension and signed macOS editor bundle. The signature does not
assert that native acceptance passed. The plan lasts at most seven days; the
preparation script issues 24 hours and fixes the server to `https://localhost:15943`.

The local user first chooses the manifest and confirms loading. They then select an
existing task, confirm evaluation, review the exact native controls, and sign in.
Passwords remain user-entered. Evaluation storage has a distinct scope. The plan
is memory-only and must be loaded again after restart. Expiry fences queued native
mutations synchronously as well as disconnecting via a timer. Default production
and simulated hosts reject evaluation plans. Approvals, media and caller-tool
qualification are withheld from the initial evaluation plan.

The preparation script is `scripts/prepare-backend-evaluation.mjs`; it only reads
installed artifacts and writes a signed plan. The private signing key lives outside
the repository. The local evaluation key cannot publish production qualification
through this command. Complete native acceptance and a separate reviewed production
adoption before describing this candidate as a release.

The macOS editor measurement verifies the code signature before and after hashing
the complete app bundle. `sdc-bundle-tree-v1` records relative symlinks only when
their resolved targets remain inside the bundle; it also hashes their target bytes
at their real location. Extension trees continue to reject all symlinks.
