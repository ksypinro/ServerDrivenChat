# M25: beginner guides and maintainer handoff

The user requested M25 on 11 October 2026, explicitly asking for enough detail for a beginner. The [manual hub](../../docs/guide/README.md) is the current entry point. The scope is documentation and example consumers of the accepted M24 product; no native binary, runtime, dependency lock, permission category or architecture was changed.

## Deliverables

| Document | Coverage |
|---|---|
| [User guide](../../docs/guide/user-guide.md) | Graphical isolation/install, project trust, existing task, Configure/Connect, human sign-in, server pairing/local consent, browser two-turn use, questions, conditional approvals, stop/disconnect, recovery, forget/uninstall and glossary |
| [Certificate guide](../../docs/guide/certificates.md) | Later user-requested addendum: public CA acquisition/export, fingerprint checks, macOS SSL-only trust, browser/isolated editor/curl/Node/Python access, isolated manual creation, server wiring, expiry/rotation and troubleshooting; [verification](certificate-guide-verification.json) |
| [Support/field matrix](../../docs/guide/support-matrix.md) | Exact pins/platform, current versus historical SDK/media/Aider/tool evidence, supported/rejected fields, control/native grants, limits and estimate provenance |
| [API/client guide](../../docs/guide/api-guide.md) | REST/SSE desktop loop, owner credentials/scopes/rotation, operations/retries/errors, blocked controls, attachments, runnable official Node SDK/REST samples, Python configuration, history/alias/tool ownership and historical Aider integration |
| [Operator runbook](../../docs/guide/operator-guide.md) | Private data map, exact local provisioning/trust/signatures/callbacks, health, consistent two-database backup, independent restore, upgrades/rollback, credential retirement and incidents |
| [Maintainer guide](../../docs/guide/maintainer-guide.md) | Module ownership/invariants, exact locked/dependency/DB/Swift checks, schema/docs audit, effect diagnosis/incidents and M26 handoff |

README and historical Cline/API entry points link current guides. Historical milestone pins remain intact. Ordinary users follow graphical steps; terminal provisioning, clients and checks are in separate operator/developer guides. Every support matrix claim links its exact accepted scope or explicitly identifies absent acceptance.

## Verification and its limits

[Deployed examples](deployed-examples.json) ran the actual documented files on Node 24.19.0 through verified local HTTPS → deployed FastAPI → TypeScript/PostgreSQL → the existing graphically consented Cline task. OpenAI Chat, Responses, Anthropic Messages and first-party REST returned their exact harmless text; original-key retries returned the same IDs. Snapshot/operation retrieval, snapshot-cursor SSE replay, pre-dispatch unsupported sampling refusal and equivalent scoped-key rotation/revocation/ownership fencing passed. Temporary view/prompt keys were revoked and rejected, and their private temporary file was removed. Estimates remain labeled; no file/tool effect was requested. [Native receipts](native-receipts.json) confirm exactly four applied commands, with no duplicate command from retries.

[Deployed OpenAPI](deployed-openapi.json) was exported from the running pinned gateway and compared structurally to `api-gateway/openapi.json`: identical, 42 paths. [Documentation audit](documentation-audit.json) checks local links/anchors, current command titles from the signed VSIX, absence of terminal steps in the beginner product guide and unchanged accepted package checksums. The independent project signature is verified separately. [Verification summary](verification.json) records commands and results.

[Walkthrough audit](walkthrough-audit.json) maps beginner steps to the exact signed package/source and real M24 graphical installation, clean selected-device credentials, uninstall/reinstall/fresh human sign-in/consent and native control evidence. M25 additionally observed the existing isolated host, exact-task unchanged-control reconnect, native example output and final Disconnect. The cached recent-command label “Configure Server Account” is explained beside the archive's authoritative “Configure Server” title.

There was **no new independent novice participant, macOS account, CA trust change, package reinstall or new native permission grant** during M25. The graphical installation/fresh-credential lifecycle walkthrough uses the actual M24 acceptance performed immediately before writing these guides; M25 audits those concrete steps rather than claiming another fresh install. Approval/media/Aider acceptance retains its separately recorded earlier pins. Backup/restore commands were cross-checked against the implemented scripts and M24 independent restore; no new restore/upgrade is claimed. Product build/lint/root/Swift/gateway results referenced in the manuals remain M24 historical checks, not new M25 reruns. Documentation-only validation and deployed examples are the new checks.

M25 is Done for the selected local target and declared subsets; the linked verification records passed. M26 remains Not started and requires a new instruction. Internet production, public Marketplace publication, full vendor parity, new host/client/tool qualification and release/load/soak are outside this milestone.
