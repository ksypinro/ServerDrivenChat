# Step 01 state correction discovered during Step 02

The first broad CUA app-list snapshot returned `running=false` for the separate
ServerDrivenChat VS Code application. That field was stale. A direct read-only
view of `/Users/samin/Applications/ServerDrivenChat VS Code 1.140.app` showed the
window `Project analysis — ServerDrivenChat`; a filtered process check showed its
isolated user-data/extensions arguments and process start predating the 2026-10-15
inventory capture. No application was launched by this inspection.

At the direct UI observation (2026-10-15, approximately 02:41 UTC):

- Workspace: `~/Documents/ServerDrivenChat`.
- SDC status item: `disconnected`.
- Claude panel: existing `Project analysis` conversation.
- Claude ownership notice: “This conversation is still open somewhere else. Using
  it in two places at once can mix up its messages.”
- The **Open here anyway** control was left untouched. No prompt or command was
  submitted and no session identifier was copied into this record.
- The other official VS Code app window exposed only a generic “Visual Studio
  Code” window in this inspection; it did not establish which view owns the Claude
  session. Other process/profile identity is not proof of conversation ownership.

This corrects only the runtime-state observation in `inventory.json`. The package
measurements, clean project settings, disabled probe flags, and evidence taxonomy
remain unchanged. Live native plugin-manager state is still the last explicit
cleanup observation in `NATIVE-AUTHORITY.md`; the editor being open does not make
the settings flags equivalent to a fresh native plugin-manager check.

The state correction was discovered after the earlier Luna review. That review is
retained, and the amended baseline received a final gpt-6-luna consistency
re-review with verdict ACCEPT; see
[`luna-review-amendment-attempt-02.md`](luna-review-amendment-attempt-02.md).
Step 01's package result and acceptance are PASS. Step 02 remains blocked on
safely establishing the owner of the existing conversation.
