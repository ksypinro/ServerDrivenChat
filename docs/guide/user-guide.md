# Beginner guide: connect Cline and send your first message

This guide takes you from a prepared Server-Driven Chat installation to a browser
conversation with your existing Cline task. You do not need to write code or use a
terminal for these steps.

**Your first goal:** send a harmless message from the browser, see Cline answer it,
and learn how to disconnect when finished.

If you have only downloaded or cloned the GitHub repository, start with
[Before you begin](#2-check-what-your-operator-has-prepared). The repository contains
source code; it does not include the generated extension installers or a configured
server. Running a source build alone does not create a usable installation.

## Choose your starting point

| Your situation | Start here |
|---|---|
| You have source code but no working installation | [2. Before you begin](#2-check-what-your-operator-has-prepared) |
| An operator supplied the launcher and installers | [3. Open the isolated editor](#3-open-the-correct-editor-and-install-the-pair) |
| Both extensions are installed, but no task is connected | [4. Prepare a task](#4-open-your-project-and-cline-task) |
| The bridge already says online | [7. Send a browser message](#7-send-your-first-browser-message) |
| You used it before and restarted the computer/editor | [10. Return after an interruption](#10-return-after-a-restart-or-interruption) |
| Something is not working | [12. Troubleshooting](#12-find-and-fix-common-problems) |
| You want to remove the integration | [11. Cleanup and uninstall](#11-remove-credentials-and-uninstall) |

## 1. Understand what connects to what

You will use three applications:

| Application | Its job |
|---|---|
| Docker Desktop | Keeps the local server services running |
| The isolated VS Code installation | Runs Cline and the SDC bridge extension |
| Your browser | Shows the control page where you send messages and read results |

A browser message travels to the server, through the bridge, and into the selected
Cline task. Cline uses its configured model provider to produce the answer. The
bridge sends the result back to the server and browser.

A **task** is a conversation inside Cline. A **session** is the server's record of
that connected conversation. A **binding** associates the server session with one
specific task, workspace, and running editor. It does not grant control of every
Cline task on your computer.

The bridge keeps listening after an answer finishes. Keep the isolated editor and
the selected task open while using the browser. Switching tasks, reloading the
editor, or sending a message directly in Cline can invalidate the remote binding.

You may see two sign-in flows: one from the bridge when pairing the editor, and one
from the browser control page. Signing into the browser alone does not connect a
native task. Cline's own model-provider credentials are separate from both SDC sign-ins.

## 2. Check what your operator has prepared

An **operator** is the person who installs and maintains the server. On your own
computer, that person may be you. The operator should finish the
[operator guide](operator-guide.md) before you follow the everyday steps below.

Ask for these six items:

| You need | What to write down or check |
|---|---|
| Isolated editor launcher | Its name and location, supplied by your operator |
| Server origin | The full address, including `https://` and any port |
| SDC account | Your ordinary sign-in username and a secure way to obtain its password |
| Reviewed extension installers | Both VSIX files and confirmation that their signatures/hashes were checked |
| Certificate setup | The approved public CA is trusted by the browser and isolated extension host |
| Cline provider setup | Cline can already answer a message locally using your intended model |

For the currently qualified local deployment, the server origin is
`https://localhost:15943`, the host is Apple-silicon macOS, and the editor is
VS Code **1.140.0**. The matched extension pair is:

| Installer filename | Version shown in the editor |
|---|---|
| `cline-4.1.22-sdc-m24.1.vsix` | Maintained Cline **4.1.2204** |
| `sdc-cline-bridge-0.7.3-m24.4.vsix` | Server-Driven Chat — Cline bridge **0.7.3** |

A **VSIX** is an extension installation file. These generated files are not included
in a source-only Git clone. Obtain the reviewed pair from your operator; compare
against the [package manifest](../../evidence/M24/artifact-manifest.json), rather
than trusting a matching filename. The project integrity signature is separate
from Microsoft Marketplace signing.

Use the launcher and account supplied for **your installation**. Paths, task IDs,
and credentials in historical developer records are not values you should copy.
`localhost` means the same computer as the browser; opening that address on another
computer will not reach this installation.

The maintained Cline uses the stock Cline extension identifier. Installing it into
your everyday editor can replace that editor's Cline binary. The operator must
provide separate VS Code user-data **and** extension directories, or a separate
macOS account. A VS Code profile by itself is insufficient.

**Ready to continue when:** you have the launcher, a reachable server address, an
account, the verified pair, and working certificate trust. For certificate setup,
use the [certificate guide](certificates.md). A browser certificate warning or an
extension HTTPS validation error should be resolved before signing in; do not
turn off certificate validation to continue.

## 3. Open the correct editor and install the pair

If the pair is already installed, verify its versions and skip the installation steps.

1. Open **Docker Desktop** from Applications and wait until it is running. If the
   server was not configured to start automatically, ask the operator to start it.
   Starting Docker alone does not create or provision the SDC services.
2. In Finder, open the **isolated launcher supplied by your operator**. Avoid the
   ordinary VS Code shortcut unless the operator explicitly identified it as isolated.
3. In that editor, open **Code → About Visual Studio Code**. For the qualified pair,
   confirm version **1.140.0**.
4. Open **Extensions** in the left sidebar, or press **Shift+Command+X**.
5. If installation is needed, open the **Command Palette** with **Shift+Command+P**.
   Search for **Extensions: Install from VSIX...** and choose the Cline installer.
6. Repeat the same command for the companion installer. Install both files from
   the same reviewed release; do not mix an old companion with a new native package.
7. Save open work and use the offered reload action if requested.
8. Return to the installed extensions and verify **Cline 4.1.2204** and
   **Server-Driven Chat — Cline bridge 0.7.3**.

The Command Palette is a searchable list of editor commands. You will use it again
for configuration, connection, status, and disconnect.

**Expected result:** both extensions are installed in the isolated editor. The
status bar can show **Cline bridge: disconnected**. That is normal: installation
has not yet paired the editor or authorized a task.

Keep the reviewed versions until your operator supplies a qualified replacement.
If the displayed version differs, use the [migration guide](cline-version-migration.md)
instead of assuming the newer package is compatible.

## 4. Open your project and Cline task

1. Choose **File → Open Folder…** and select the project you intend Cline to use.
2. If VS Code asks whether to trust the workspace, review the exact folder. Trust
   allows its code/configuration to run; select only a project you intend to trust.
3. Open Cline from its sidebar icon.
4. Open the intended conversation from Cline's history. If you do not yet have a
   task, create one locally in Cline first; connecting does not create an arbitrary
   native task through the server API.
5. Confirm Cline's model provider is configured and working. If the task needs
   resuming, resolve that locally before attempting remote work.
6. For a simple readiness check, send this message **in Cline**:

   > Do not use tools or read or change files. Reply exactly READY.

7. Wait for the reply and any pending interaction to settle. Keep native
   **Auto-approve** set to **None** for this introductory walkthrough.

**Expected result:** the correct Cline task is visible, has answered locally, and
is ready for another message. If this local check fails, fix the native setup first;
connecting the bridge will not repair a missing model credential or paused task.

From this point, keep that task selected. Use the browser for the first remote test.

## 5. Configure your local server profile

A **server profile** stores a short name, the server address, and the control
categories you intend to permit. It is unrelated to VS Code's profile isolation.

1. Open the Command Palette.
2. Run **Cline Bridge: Configure Server**.
3. In **Configured server profile ID**, enter `default`, or another name agreed
   with the operator. Names use 1–64 letters, numbers, underscores, or hyphens.
4. In **Server origin**, enter your operator's address. For the documented local
   setup, enter exactly `https://localhost:15943`.
5. Do not append `/api/v1`, `/identity`, a username, or a query string. An origin
   contains only the scheme, host, and port.
6. In **Allowed controls for this server profile**, select **prompts**,
   **questions**, and **cancel**. Leave **approvals** unselected for this guide.
7. Confirm the selection and wait for the profile-saved message.

| Selection | Meaning |
|---|---|
| prompts | Deliver new instructions to the connected task |
| questions | Deliver an answer to a specific pending native question |
| cancel | Request that the observed native turn stop |
| approvals | Deliver supported decisions for exact native approval requests; requires separate qualification and consent |

These categories do not automatically approve file operations or override native
and operating-system permissions.

**Expected result:** the profile is saved locally. It is not connected yet.
The companion may display `http://127.0.0.1:15945/callback` as its sign-in return
address. You do not need to open or edit it; the extension uses it temporarily to
receive the browser's sign-in result. Your server address remains HTTPS.

Changing a saved profile does not change an existing binding silently. Deliberate
category changes require disconnecting and reviewing a fresh connection.

## 6. Sign in, pair and connect

1. Keep the intended task selected and open the Command Palette.
2. Run **Cline Bridge: Connect Current Task to Server**.
3. Select your server profile, such as `default`.
4. Review **Connect default to this exact Cline task?** Check the server, workspace,
   task, and control categories. Choose **Connect this task** when they are correct.
5. On first use, the browser opens the SDC sign-in page. Enter your ordinary SDC
   account details there and choose **Sign In**. Never put the password in a Cline
   prompt or browser chat message.
6. When sign-in completes, return to the isolated editor that started the flow.
7. Review the server pairing-code confirmation and choose **Confirm on server**
   for the intended server/account. Pairing identifies the device to the server.
8. Review **Allow this paired device to control Cline task …?** Check the task and
   categories once more. Choose **Allow this binding** to grant that specific access.
9. Wait for **Cline bridge: online** in the status bar. You can also run
   **Cline Bridge: Connection Status** to inspect the result.

**Expected result:** the bridge is online for the selected task. Device credentials
are stored through VS Code SecretStorage. The connection continues after a model
turn finishes.

The first-use Connect flow has a **120-second** bound. If sign-in takes longer,
keep the correct task selected and explicitly retry Connect. A completed sign-in
or a saved profile is not proof that the task is online. Cancel stale dialogs if
the task or workspace changed while you were signing in.

On later connections, valid saved credentials may let you skip first-use pairing
dialogs. The task connection still requires review. After **Revoke and Forget**,
you must sign in and pair again.

The installed Connect model tool can also respond to “Connect to my server and
follow its instructions.” Use the graphical command above for this first walkthrough:
a sentence alone does not install the integration or grant consent.

## 7. Send your first browser message

1. Open your server origin in the browser. For the documented local setup, use
   `https://localhost:15943`.
2. Choose **Sign in securely**. Sign in with the SDC account that has access to the
   connected session. This is separate from the bridge's saved device credentials.
3. In **Conversations**, select the session for the task you just connected.
4. Confirm **Bridge connected**. If the view is stale, choose **Refresh state**.
5. In **Message**, enter:

   > Do not use tools or read or change files. Reply exactly BROWSER-READY.

6. Choose **Queue prompt**. **Enter** also submits; **Shift+Enter** adds a new line.
7. Watch the transcript and **TURN STATUS**. Wait for the native answer and the
   completed state before sending another message.
8. Send a second harmless message from the browser:

   > What exact marker did you just reply with? Do not use tools.

**Expected result:** the messages and replies belong to the same Cline task and
browser session. Cline produced the answer using its configured model.

“Queued” or “recorded” means the server accepted the request. It does not mean
Cline has completed it. If you lose the connection after submission, refresh and
inspect the existing turn before resending; the first request may still be running.

### Attach a file

Use **Attach** beside the message box, select a file, and review the selected-file
list before choosing **Queue prompt**. You can remove a file before submitting.

The shared picker lists more formats than every native binding supports. The
qualified public image paths use committed **PNG/JPEG**, with a **10 MiB** upload
and aggregate prompt-image limit plus native checks. Confirm the current binding's
capabilities in the [support matrix](support-matrix.md); seeing a filename in the
picker does not prove that Cline can consume it.

Uploads are verified before queueing. If an attachment fails, remove it or resolve
the reported type, size, or access problem. Do not assume the prompt was delivered.

## 8. Answer questions and understand approvals

### Answer a question

When Cline asks for clarification, look for a **Question** card in the browser.
Choose an offered answer or type your response, then select **Send answer**.
The card identifies the pending native request; answering it continues the waiting
turn rather than starting a new prompt.

If someone already answered in Cline, the old browser card can become stale.
Choose **Refresh state** and inspect the current request instead of repeatedly
submitting an old answer.

### Handle a permission request

This walkthrough leaves **approvals disabled**. When Cline requires a native
permission decision, review it locally in Cline. Do not enable remote approvals
just to make a disabled browser control clickable.

If your operator has separately qualified remote approvals and you explicitly
consent to that category, inspect the whole displayed action and choose an offered
once/deny response, then **Record decision**. “Decision recorded” means the server
saved it; application must be confirmed by the native receipt. A previous allow
cannot authorize a different action.

The route does not grant “always allow,” persistent, or narrowed permissions.
Native Cline and operating-system permissions continue to apply. Revoking access
later cannot undo an action that already ran.

## 9. Stop work or disconnect

Choose the action that matches your intention:

| Your intention | Action | Expected result |
|---|---|---|
| Stop the currently observed turn | Browser **Request stop** | Native cancellation/abort is reported; a recorded request alone is insufficient |
| Prevent new remote commands locally | **Cline Bridge: Disconnect** in the editor | Bridge status becomes disconnected |
| Ask the server to disable a session | Browser **Request remote disable**, if authorized | A remote request is recorded and separately applied; network failure can delay it |
| Remove the selected device's credentials | Follow [cleanup](#11-remove-credentials-and-uninstall) | Device revoked and selected local credentials/inbox removed |

**Disconnect does not cancel work already running.** To end both work and remote
access, request stop, inspect the result, and then disconnect.

If the result is **unknown** or requires **reconciliation**, inspect Cline locally
and ask the operator to determine what happened. Do not repeat a file-changing
instruction merely to discover whether the first attempt worked.

After cancellation, Cline may display **Resume Task**. Resume deliberately in Cline,
wait for readiness, and reconnect if the local action invalidated the binding.

## 10. Return after a restart or interruption

### Daily return checklist

1. Check Docker Desktop and the retained services are running.
2. Open the supplied isolated editor launcher.
3. Open the intended project and existing task from Cline's history.
4. Resolve a local Resume prompt or pending interaction deliberately.
5. Run **Cline Bridge: Connect Current Task to Server** and review the task/profile.
6. Wait for **online**.
7. Sign into the browser if necessary, select the current session, and choose
   **Refresh state** before sending work.

Saved pairing credentials may remain, but a fresh editor process does not silently
restore the previous task's control grant.

### Brief network loss

The bridge can reconnect and replay retained events. Wait for recovery and check
the existing turn's state. A timeout does not prove that work was cancelled.
For programmatic retry rules, use the [API guide](api-guide.md).

### Local Cline use or task switching

Typing directly into Cline can detach the remote binding. Finish the local work,
select the intended task again, and explicitly reconnect before returning to the
browser. A different task is a different binding, even in the same editor window.

An API credential tied to an old binding cannot automatically follow its replacement.
If you use an API client, its owner must issue an appropriate replacement credential
and revoke the old one. Ordinary browser users do not need to create an API key
for this walkthrough.

## 11. Remove credentials and uninstall

Use this when retiring the selected connection. For a temporary break, **Disconnect**
is enough.

1. Finish or deliberately stop native work; credential cleanup does not stop it.
2. Keep the server reachable and leave the companion installed.
3. Run **Cline Bridge: Revoke and Forget Server Credentials**.
4. Select only the profile you intend to remove.
5. Read the confirmation's server and deletion scope, then choose **Revoke and forget**.
6. If asked to sign in again, use the same owner account to authorize revocation.
7. Wait for confirmation that the device is revoked and the saved credentials and
   local bridge inbox are removed.
8. Separately have the owner revoke public API credentials issued for the retired
   session. The control page does not provide API-key management in this release.
9. If removing the software too, open **Extensions → Installed** in the isolated
   editor. Uninstall the companion first, then the maintained Cline extension.
10. Reload if requested and verify those extensions are no longer installed there.

**What this preserves:** Cline tasks/history, other server profiles, server databases,
and certificate trust. It does not remove the ordinary editor's stock Cline.

If server revocation fails, the bridge stays disconnected and local credentials/inbox
remain for a retry. Restore connectivity and retry cleanup. Uninstalling software
alone does not prove the server device was revoked.

Deleting deployment directories, Docker volumes, backups, or CA trust is a separate
operator decision. Reinstallation after successful credential cleanup requires
fresh sign-in, pairing, and task consent.

## 12. Find and fix common problems

| Symptom | What to check | Next step |
|---|---|---|
| The local address does not open | Docker and retained SDC services | Ask the operator to inspect/start the deployment; do not assume a new install is required |
| Certificate warning or HTTPS error | Correct hostname, approved CA, and extension-host trust | Follow the [certificate guide](certificates.md); browser success alone does not prove Node trust |
| No Cline Bridge commands | Correct launcher, both extensions, extension activation | Verify the isolated editor and installed versions |
| Unsupported build error | Actual installed package identity and hashes | Restore the reviewed pair or use the [migration guide](cline-version-migration.md) |
| Sign-in finishes but the bridge is disconnected | Timeout or changed task | Select the intended task and retry Connect explicitly |
| Empty Conversations list | Browser account and successful bridge connection | Confirm the account has access; refresh sessions and inspect bridge status |
| Bridge unavailable | Offline, detached, or expired binding | Reconnect the intended task and choose its current browser session |
| Prompt/answer button disabled | Read-only access, missing capability, busy task, or offline bridge | Read the displayed reason and inspect Cline; do not grant unrelated controls |
| Task busy or conversation revision changed | Pending turn, Resume prompt, or local takeover | Resolve locally, reconnect as needed, then refresh state |
| Decision recorded but not applied | Native acknowledgement has not arrived | Inspect the exact request and Cline state; do not assume execution |
| API client stopped after reconnect | Credential belongs to the previous binding | Owner replaces the scoped key; do not paste it into a chat |
| Revoke/forget asks for sign-in | Saved authentication expired | Reauthenticate as the owner and finish cleanup |

When asking for help, include the stage that failed, displayed error, editor and
extension versions, and whether the bridge is online. Remove passwords, tokens,
pairing codes, and private conversation content from screenshots or reports.
Do not run commands named **Probe**, **Capture**, or **Disposable Task** for ordinary
use; they are developer qualification tools.

## 13. Glossary

| Term | Plain-language meaning |
|---|---|
| Task | One native Cline conversation |
| Session | The server's authorized record of a connected conversation |
| Binding | The current link to one specific native task and running host |
| Device | A paired bridge installation |
| Lease | Short-lived authority for the bridge to continue dispatching work |
| Server profile | A local name, server origin, and chosen control categories |
| VSIX | A file used to install a VS Code extension |
| Bridge / companion | The extension carrying commands and events between server and Cline |
| Origin | A scheme, hostname, and optional port, without an API path |
| Loopback / localhost | An address that refers to this computer |
| TLS / CA | Verified encrypted transport / the authority that signs a certificate |
| Scope | The operations a credential is allowed to perform |
| SSE | An HTTP connection carrying a sequence of events |
| Idempotency key | A stable identifier that makes an API retry refer to the original request |
| Reconciliation | Checking retained records and native state to resolve an uncertain outcome |

Next: [API usage](api-guide.md) · [All manuals](README.md) ·
[Current support matrix](support-matrix.md).
