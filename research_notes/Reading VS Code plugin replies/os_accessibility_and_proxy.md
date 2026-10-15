# Outside-the-plugin routes for reading AI coding assistant replies in VS Code: (A) OS accessibility / screen reading, (B) model-provider base-URL proxy interception

Research date: 2026-10-15. Context: ServerDrivenChat (macOS arm64, isolated VS Code 1.140.0). Local static inspection was read-only and limited to extension bundles already installed in the stock `~/.vscode/extensions` directory. These were upstream Cline 4.1.23, the Claude Code extension 2.1.296 and the OpenAI `openai.chatgpt` 26.1007.21434 extension, which bundles Codex CLI 0.162.0-alpha.17.2. None of these is the project's accepted maintained Cline 4.1.2204 pin. Bundled Electron versions were read from app plists: isolated VS Code 1.140.0 uses Electron 43.7.3, and stock VS Code 1.141.0 uses Electron 43.7.7. Nothing was executed against a live plugin, no accessibility (TCC) permission was requested, and no proxy was run. Every behavioural claim below is either documentation-sourced or code-sourced, and none was observed at runtime.

## A1. Does the macOS AX tree expose VS Code / Electron webview text, and what enables it?

### Takeaway
Chromium (and therefore Electron/VS Code) builds its accessibility tree lazily. A non-VoiceOver process must set Electron's custom `AXManualAccessibility` attribute on the app's `AXUIElement` to turn it on. Once on, Chromium composes every frame, including out-of-process iframes such as VS Code extension webviews, into one platform tree. In principle, then, text in Cline, Claude Code and Codex webview panels and in the native Copilot chat view is reachable through AX. This has **not been empirically verified on VS Code 1.140 for these specific panels**. `editor.accessibilitySupport` does not control webview exposure.

### Cited Findings
- Electron turns accessibility on automatically when it detects assistive technology such as VoiceOver or JAWS, and exposes `app.setAccessibilitySupportEnabled(enabled)` for apps to enable it themselves. User assistive utilities override that setting. — [Electron accessibility docs](https://www.electronjs.org/docs/latest/tutorial/accessibility)
- On macOS, third-party assistive tech enables accessibility in Electron apps by setting the `AXManualAccessibility` attribute on the app element created from its PID (`AXUIElementCreateApplication(pid)`). The docs give Obj-C and Swift samples. — [Electron accessibility docs](https://www.electronjs.org/docs/latest/tutorial/accessibility)
- Electron added `AXManualAccessibility` because VoiceOver already uses the undocumented `AXEnhancedUserInterface`. The goal was to let tools enable accessibility without VoiceOver running. — [Electron commit mirror (#7206)](https://ayakael.net/mirrors/electron/commit/94dd068e15314ba990fb7b96a6c8e4ff100b19c1); [Electron commit mirror (AXManualAccessibility fix)](https://ayakael.net/mirrors/electron/commit/f35b9b3f06663e657a2f3b36cc021cf4b109ab26)
- A forum user reports that setting `AXEnhancedUserInterface` on an app can break window positioning in window managers such as Magnet. That is part of why Electron listens for `AXManualAccessibility` instead. This is a user report, not Apple documentation. — [Apple Developer Forums thread 659755](https://developer.apple.com/forums/thread/659755)
- Setting `AXManualAccessibility` from Swift returned a spurious failure even when it worked. Electron PR #38102 fixed the reported result. Clients on older Electron builds may therefore see misleading error codes. — [electron/electron PR #38102](https://github.com/electron/electron/pull/38102)
- How Chromium builds the tree:
  - Accessibility is "off by default and enabled automatically on-demand".
  - The renderer builds the tree and sends incremental updates over IPC to a browser-process cache, which may lag the renderer "by a fraction of a second".
  - Chromium builds a separate tree for each frame and "dynamically composes all of the frames into a single virtual accessibility tree on the fly".
  - On macOS the root implements NSAccessibility as `AXWebArea`, and events include `AXFocusedUIElementChanged` and `AXLiveRegionChanged`.

  — [Chromium accessibility overview](https://chromium.googlesource.com/chromium/src/+/main/docs/accessibility/overview.md)
- The `--force-renderer-accessibility` switch (`basic`, `form-controls`, `complete`) forces a Chromium accessibility mode for a whole run. — [Chromium accessibility overview](https://chromium.googlesource.com/chromium/src/+/main/docs/accessibility/overview.md)
- `editor.accessibilitySupport` (`auto`/`on`/`off`) controls screen-reader-optimized mode for the **editor and integrated terminal**. `auto` detects a screen reader by querying the platform. For webviews such as Markdown preview, the docs only say to use F6/Shift+F6 to move focus. — [VS Code accessibility docs](https://code.visualstudio.com/docs/configure/accessibility/accessibility)
- VS Code's chat view has an Accessible View (⌥F2 on macOS) that shows the focused chat response as plain text, read character by character or line by line, plus Accessibility Help (⌥F1). — [VS Code accessibility docs](https://code.visualstudio.com/docs/configure/accessibility/accessibility); [VS Code 1.80 release notes](https://code.visualstudio.com/updates/v1_80)
- VoiceOver users report that VS Code on macOS is noisy and hard to use, especially in the terminal. This is anecdotal and does not specifically address webviews. — [AppleVis "VSCode usability on Mac OS"](https://applevis.com/comment/216541)
- Local inspection shows the Claude Code 2.1.296 webview bundle sets `aria-live="polite"` on some status regions. That is evidence of some live-region markup, but not necessarily on message bodies. — local file `~/.vscode/extensions/anthropic.claude-code-2.1.296-darwin-arm64/webview/index.js`

### Inferences
- VS Code extension webviews are iframes inside the workbench renderer. Chromium composes per-frame trees, so once `AXManualAccessibility=true` is set on the VS Code process, Cline, Claude Code and Codex panel text should appear as `AXStaticText`/`AXGroup` descendants of an `AXWebArea` under the VS Code window. **This is inferred from Chromium's architecture and not tested on VS Code 1.140 / Electron 43.7.3.** It must be confirmed with Accessibility Inspector before anyone relies on it.
- The native Copilot/VS Code chat view is workbench DOM, not an iframe. It should therefore expose AX text in the same way, and the Accessible View offers a cleaner plain-text rendering. Using the Accessible View, however, requires moving keyboard focus in the user's editor, which is UI-intrusive.
- `AXManualAccessibility` is process-wide. It turns on Chromium's accessibility for the whole VS Code window, including the editor and every webview. The cost is not quantified in the sources.

### Gaps
- No primary source or test confirms that VS Code 1.140 webview iframe content appears under the macOS AX tree once `AXManualAccessibility` is set. No source covers the effect of VS Code's webview sandboxing (separate origin) on AX composition.
- It is unknown whether setting `AXManualAccessibility` also flips VS Code's `editor.accessibilitySupport: auto` into screen-reader mode, which disables folding and the minimap.
- No source quantifies the CPU or memory overhead of Chromium accessibility mode in large VS Code windows.

## A2. Notifications vs polling, latency, virtualized lists, rendering fidelity and permission

### Takeaway
An AX reader can register `AXObserver` notifications on the application root, such as value-changed and Chromium's `AXLiveRegionChanged`. It needs the user-granted Accessibility (TCC) permission and cannot run sandboxed. Three effects degrade the result:
- **Lag:** Chromium's browser-side cache lags the renderer.
- **Virtualization:** Cline's chat list is virtualized with react-virtuoso, so off-screen messages are not in the DOM or AX tree.
- **Lost fidelity:** the AX tree yields rendered text, not Markdown source, so code fences, language tags and formatting are lost or flattened.

### Cited Findings
- The standard pattern is `AXObserverCreate` for a PID, then `AXObserverAddNotification`, with the run-loop source attached. Apple's guidance is to add notifications to the root application element to receive them for all children. — [launchd-dev list example](https://lists.macosforge.org/pipermail/launchd-dev/2010-November/000858.html); [Apple forums profile post summarizing Apple's guidance](https://origin-devforums.apple.com/forums/profile/tinml)
- Permission checks have known pitfalls:
  - `AXIsProcessTrusted()` checks the permission without a prompt, and `AXIsProcessTrustedWithOptions` can prompt.
  - Sandboxed apps always get `false`.
  - The result can be stale after the user changes System Settings while the process runs.
  - Improper code signing causes odd behaviour.

  — [Apple Developer Forums thread 649501](https://developer.apple.com/forums/thread/649501)
- One developer reports that some AX text-change notifications did not arrive while `kAXValueChangedNotification` did. This is anecdotal. — [Apple Developer Forums thread 649501 (search summary)](https://developer.apple.com/forums/thread/649501)
- Chromium emits `AXLiveRegionChanged` on macOS, and its browser-side cache "may lag what's in the renderer process by a fraction of a second". — [Chromium accessibility overview](https://chromium.googlesource.com/chromium/src/+/main/docs/accessibility/overview.md)
- **Verified locally:** the Cline 4.1.23 webview bundle includes react-virtuoso, a virtualized list library, with `data-virtuoso-scroller` and `virtuoso-item-list` markers. — local file `~/.vscode/extensions/saoudrizwan.claude-dev-4.1.23/webview-ui/build/assets/index.js`
- The Claude Code 2.1.296 webview bundle has no react-virtuoso string. That does not prove its message list is unvirtualized. — local file `~/.vscode/extensions/anthropic.claude-code-2.1.296-darwin-arm64/webview/index.js`

### Inferences
- Use observers as triggers, then re-read the subtree. Notifications on Chromium web content are not guaranteed for every text append. A robust reader would debounce `AXValueChanged`/`AXLiveRegionChanged`/`AXLayoutChanged` and re-walk the last message subtree, with a polling fallback of about 250–1000 ms. End-to-end latency would then be Chromium cache lag (under 1 s) plus debounce and tree-walk time. This is an inference; no benchmark was found.
- Virtualization undermines both history and completeness:
  - In Cline (react-virtuoso), any message scrolled out of the viewport is unmounted and disappears from the AX tree.
  - Reading earlier replies requires programmatically scrolling the user's panel, which is intrusive.
  - Even the current reply can drop out of the tree if the user scrolls up.
- AX gives rendered text, not Markdown source. Headings, lists, inline code and code blocks come back as flattened `AXStaticText` runs. Code-block language tags, copy buttons, diff widgets, collapsed tool-call cards and thinking sections all show up as UI chrome to filter out. Reconstructing exact Markdown is not possible.
- Telling a partial reply from a final one needs plugin-specific UI cues, such as a stop button that disappears, a "thinking" spinner, or completion-tool cards in Cline. Those cues change between versions.

### Gaps
- No benchmark of AX tree-walk cost or notification reliability for Electron 43 / VS Code webviews was found.
- It is unverified whether the Claude Code and Codex webview message lists, or VS Code's native chat list widget, are virtualized.
- It is unverified whether AX actions can inject text into React-controlled webview inputs reliably. Setting `AXValue` on a controlled `<textarea>` may not fire React `onChange`. That is the "send prompt" half and is outside this note's main reading scope.

## A3. Windows UI Automation and Linux AT-SPI equivalents

### Takeaway
Windows: Chromium implements MSAA/IA2 and, since Chrome 138, native UI Automation by default. Linux: Chromium exposes ATK over AT-SPI, and VS Code documents `ACCESSIBILITY_ENABLED=1` when Orca reads nothing. Both carry the same lazy-enablement, virtualization and identity problems as macOS.

### Cited Findings
- Chromium implements IAccessible, IAccessible2 and UI Automation on Windows, with IA2↔UIA node mapping. On Linux it implements ATK. — [Chromium accessibility overview](https://chromium.googlesource.com/chromium/src/+/main/docs/accessibility/overview.md)
- Chromium-based browsers enabled native UIA by default starting with Chrome 138, replacing the MSAA-to-UIA proxy that added latency and reliability problems. Post dated 2025-08-14. — [Chrome for Developers blog: Native UI Automation for Windows in Chromium](https://developer.chrome.com/blog/windows-uia-support-update)
- If Orca does not read VS Code, set `editor.accessibilitySupport: on`, and if needed the environment variable `ACCESSIBILITY_ENABLED=1`. — [VS Code accessibility docs](https://code.visualstudio.com/docs/configure/accessibility/accessibility)

### Inferences
- Electron 43 is far newer than the Chromium 138 era, so it very likely includes native UIA. Electron's own UIA activation behaviour was not checked.
- On Linux the reader process must be on the AT-SPI bus, and VS Code may need to be launched with `ACCESSIBILITY_ENABLED=1` or `--force-renderer-accessibility`. That changes how VS Code is launched, which matters for "existing IDE conversation" preservation in ServerDrivenChat.

### Gaps
- No Electron-specific documentation on Windows/Linux equivalents of `AXManualAccessibility` was found. The Electron docs page does not describe Windows/Linux behaviour beyond naming JAWS.

## A4. Screenshot + OCR as a last resort (macOS Vision)

### Takeaway
Vision's `VNRecognizeTextRequest` (accurate, neural) or the newer `RecognizeTextRequest` can OCR VS Code panels. It only sees on-screen, unoccluded pixels, gives word-level boxes, and cannot recover Markdown structure, off-screen content or conversation identity. It is the least reliable route and fit only for diagnostics.

### Cited Findings
- Vision offers `fast` (traditional OCR) and `accurate` (neural network, the default) recognition levels. — [Apple: Locating and displaying recognized text](https://developer.apple.com/documentation/vision/locating-and-displaying-recognized-text.md)
- Accurate mode works on whole words and has no per-character bounding boxes, according to Apple DTS. — [Apple Developer Forums thread 705477](https://developer.apple.com/forums/thread/705477)
- Developers report odd confidence values clustering at 0.5 and 1.0 in accurate mode. — [Apple Developer Forums thread 695693](https://developer.apple.com/forums/thread/695693)
- Developers report that `RecognizeTextRequest` and the legacy `VNRecognizeTextRequest` can differ on the same input. — [Apple Developer Forums thread 766505](https://developer.apple.com/forums/thread/766505)

### Inferences
- Capturing another app's window needs the Screen Recording TCC permission in addition to Accessibility. No source was fetched for this; it is standard macOS behaviour.
- Monospace code (0/O, l/1/I, punctuation such as backticks), syntax-highlighting colours, small fonts, themes and partially scrolled messages degrade accuracy. Streaming replies must be re-captured repeatedly, and "final" can only be judged heuristically (text stable for N frames). The route depends on the window being visible and unobstructed, which conflicts with background or server-driven operation.

### Gaps
- No published accuracy benchmark for OCR of IDE chat panels or code blocks was found.

## A5. Existing tools and prior art for AX-driven Electron automation

### Takeaway
General-purpose AX tooling exists, including Hammerspoon `hs.axuielement` with observers, CommandPost's AX notifier and Apple's Accessibility Inspector. No maintained project was found that reads VS Code AI-assistant replies through AX.

### Cited Findings
- Hammerspoon's `hs.axuielement` module inspects and interacts with accessibility objects and has an observer submodule for notifications. — [hs.axuielement overview (Hammerspoon wiki)](https://github.com/asmagill/hammerspoon/wiki/hs.axuielement-Overview); [Hammerspoon docs](https://www.hammerspoon.org/docs/)
- CommandPost (Final Cut Pro automation) wraps `AXObserver` notifications in `cp.ui.notifier`. This is a real-world example of AX-notification-driven UI automation on macOS. — [CommandPost cp.ui.notifier](https://commandpost.fcp.cafe/api-references/commandpost/cp.ui.notifier/)
- Rust bindings (`accessibility-sys-ng`, `axuielement`) expose the same C APIs. — [docs.rs accessibility-sys-ng](https://docs.rs/accessibility-sys-ng/^0.1.3); [docs.rs axuielement](https://docs.rs/axuielement)

### Inferences
- AppleScript "System Events" UI scripting uses the same AX layer, so it hits the same Electron enablement and virtualization limits.

### Gaps
- No project specifically scraping Cline, Claude Code, Codex or Copilot chat via AX was found, and no reliability report exists for such use.

## A6. Identity, robustness and project-rule classification for Route A

### Takeaway
AX/OCR is read-only screen scraping. It gives no conversation, task or turn identity, and it breaks whenever a plugin changes its UI. It cannot provide the "supported attachment and effect-time fencing" that ServerDrivenChat's gates require. It does not replace the runtime and does not use a private socket or database, but it needs broad, user-granted TCC privileges and falls under consumer-ToS anti-scraping clauses.

### Cited Findings
- Project rules:
  - "The existing application executes the LLM. Do not add a replacement runtime, headless executor, private app socket/API or separate model app-server."
  - For the multi-backend workstream: keep Codex/Claude drivers blocked "until supported attachment and effect-time fencing are established", and "Do not substitute standalone vendor runtimes, CLI sessions, private app channels or new conversations."
  - "Never claim fixture-only or endpoint-shape compatibility as real native/client support."

  — local file `/Users/samin/Documents/ServerDrivenChat/AGENTS.md`
- Anthropic's Consumer Terms bar accessing the Services "through automated or non-human means" (bots, scripts) except via an Anthropic API key or where explicitly permitted. They also bar crawling, scraping or harvesting data from the Services. — [Anthropic Consumer Terms](https://www.anthropic.com/legal/consumer-terms); [archived version](https://anthropic.com/legal/archive/00a33a87-61a2-477f-b953-9f352a02bb46)
- OpenAI's Terms of Use prohibit users from "Automatically or programmatically extract data or Output". — [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)

### Inferences
- **Identity:** the AX tree shows whatever conversation is currently displayed in each panel. The reader cannot reliably tell which Cline task, Claude Code session or Codex thread it is looking at except by scraping titles, which are not unique IDs. If the user switches tasks, the reader silently reads another conversation. That fails ServerDrivenChat's identity and fencing requirements.
- **Partial vs final:** completion is detectable only through UI heuristics.
- **Version fragility:** DOM and ARIA structure change with each plugin release, and nothing about it is a supported contract.
- **Classification:**
  - Runtime rule: not a replacement runtime and not a private socket or database read, so not forbidden by the letter of the runtime rule.
  - Driver qualification: not a "supported attachment" and offers no effect-time fencing, so it cannot qualify as a backend driver.
  - Security: needs a security-relevant OS permission that only the user may grant (Accessibility, plus Screen Recording for OCR).
  - Terms of service: likely within consumer-ToS anti-scraping language when the plugin runs on a subscription. Legal review is needed.
  - Best fit: an out-of-band diagnostic or human-assist observer, not a product channel.

### Gaps
- No vendor statement was found on whether ToS anti-scraping clauses apply to a user's own local reading of a plugin UI via OS accessibility. GitHub Copilot terms were not researched.

## B1. Which plugins let users set a custom model base URL?

### Takeaway
All the major VS Code assistants expose a documented base-URL setting for at least some auth modes:
- Claude Code: `ANTHROPIC_BASE_URL`, with `apiKeyHelper` or gateway credential variables.
- Codex: `model_providers.<id>.base_url` or `openai_base_url` in a `~/.codex/config.toml` shared by the CLI and IDE extension.
- Cline and Roo: OpenAI-compatible Base URL plus custom headers; Cline also has `anthropicBaseUrl`.
- Continue: `apiBase`.
- VS Code Copilot Chat: BYOK "Custom Endpoint" supporting Chat Completions, Responses and Anthropic Messages.

In Copilot, only BYOK models can be redirected. GitHub-hosted Copilot models cannot.

### Cited Findings
- **Claude Code**
  - `ANTHROPIC_BASE_URL` selects an Anthropic-Messages-format gateway, and inference posts to `/v1/messages?beta=true`.
  - Bedrock and Vertex formats use `ANTHROPIC_BEDROCK_BASE_URL`/`ANTHROPIC_VERTEX_BASE_URL`.
  - `ANTHROPIC_CUSTOM_HEADERS` adds headers.
  - Managed `allowedProviders: ["customEndpoint"]` can pin the only permitted base URL (v2.1.285+).

  — [Claude Code gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol.md); [Claude Code: Other LLM gateways](https://code.claude.com/docs/en/llm-gateway.md)
- **Verified locally:** the Claude Code 2.1.296 native binary references `ANTHROPIC_BASE_URL`, `apiKeyHelper` and `CLAUDE_CODE_GATEWAY_HINT_HEADERS`. — local file `~/.vscode/extensions/anthropic.claude-code-2.1.296-darwin-arm64/resources/native-binary/claude`
- **Codex**
  - `[model_providers.<id>]` keys are `base_url`, `env_key`, `wire_api` (`responses` only), `http_headers`, `env_http_headers`, `query_params`, `requires_openai_auth`, `request_max_retries` (4), `stream_idle_timeout_ms` (300000) and `supports_websockets`.
  - Top-level keys are `model_provider`, `openai_base_url` (overrides the built-in `openai` provider) and `chatgpt_base_url` (the ChatGPT login flow).
  - Provider keys are ignored in project-local `.codex/config.toml`.

  — [Codex config reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- The Codex IDE extension and CLI share `~/.codex/config.toml` and cached login. Credentials live in `~/.codex/auth.json` or the OS credential store. — [Codex config basics](https://developers.openai.com/codex/config-basic.md); [Codex auth docs](https://developers.openai.com/codex/auth)
- **Cline (verified locally, 4.1.23):**
  - Its settings schema includes `openAiBaseUrl`, `openAiHeaders` (a string map), `anthropicBaseUrl` and `liteLlmBaseUrl`.
  - It also contains an OpenRouter-style header set (`HTTP-Referer: https://cline.bot`, `X-Title: Cline`).

  — local file `~/.vscode/extensions/saoudrizwan.claude-dev-4.1.23/dist/extension.js`
- Third-party gateway guides show Cline's "OpenAI Compatible" provider with Base URL and a "Custom Headers" field. One reports that some Cline versions intermittently drop custom headers. — [Coder AI Gateway: Cline](https://coder.com/docs/ai-coder/ai-gateway/clients/cline); [PwC coding-agents guide: Cline](https://idi-coding-agents-dev.pwc.it/guide/coding-agents/cline)
- **Roo Code** documents an "OpenAI Compatible" provider with Base URL, API key and model ID. A third-party guide shows a "Custom Headers" field. — [Roo Code docs: OpenAI Compatible](https://docs.roocode.com/providers/openai-compatible); [Coder AI Gateway: Roo Code](https://coder.com/docs/ai-coder/ai-gateway/clients/roo-code)
- **Continue:** the openai provider accepts an `apiBase` override, per a third-party example only. — [apisrouter for Continue](https://apisrouter.com/fr/for-continue)
- **VS Code Copilot Chat BYOK**
  - The Custom Endpoint provider (vendor `customendpoint`) supports Chat Completions, Responses and Messages APIs, is configured in `chatLanguageModels.json`, and replaces the deprecated OpenAI Compatible provider and the deprecated `github.copilot.chat.customOAIModels`.
  - BYOK models "work without signing into a GitHub account and without a Copilot plan".
  - BYOK applies only to chat and utility tasks. Inline suggestions, embeddings and semantic search still use GitHub services.
  - Business/Enterprise admins control the "Bring Your Own Language Model Key in VS Code" policy.

  — [VS Code docs: language models](https://code.visualstudio.com/docs/copilot/customization/language-models)
- GitHub announced BYOK in VS Code as generally available on 2026-04-22. — [GitHub changelog 2026-04-22](https://github.blog/changelog/2026-04-22-bring-your-own-language-model-key-in-vs-code-now-available/)
- One vendor states that the Custom Endpoint provider reached Stable in VS Code 1.122 (2026-05-28). This is secondary and unverified. — [Orq.ai GitHub Copilot integration](https://docs.orq.ai/docs/ai-studio/integrations/code-assistants/github-copilot.md)

### Inferences
- For Copilot, the proxy route only covers conversations using a BYOK Custom Endpoint model. Conversations on GitHub-hosted Copilot models go to GitHub and cannot be redirected through a documented setting.
- Every route requires changing the user's plugin provider settings. In Cline, switching from an existing provider to "OpenAI Compatible" may change prompt formatting and model behaviour for the existing conversation.

### Gaps
- No primary Continue docs were fetched for `apiBase`/`requestOptions.headers`.
- Kilo Code was not researched.
- No minimum VS Code version for the Custom Endpoint provider was confirmed from Microsoft docs.

## B2. Can a pass-through proxy reconstruct the visible reply, and with what latency?

### Takeaway
Yes for raw model output, with true token-level latency, provided the proxy relays SSE without buffering. But "visible reply" is plugin-specific:
- Claude Code: assistant `text` content blocks, spread across multiple model calls per prompt, plus thinking and tool_use blocks to filter.
- Codex: Responses `output_text` items across multiple calls.
- Cline: the user-visible final answer is carried as **tool-call arguments** (`attempt_completion`/`submit_and_exit` → `summary`/`result`), not as plain text.

The proxy sees what the model generated, not what the plugin rendered. It misses UI-side edits, local tool output, approvals, errors shown only in the UI, and anything the plugin filters.

### Cited Findings
- **Claude Code streaming requirements**
  - It reads streamed responses event by event. A buffering gateway makes it stall.
  - It expects the full event sequence through `message_delta` and `message_stop`. A stream ending early counts as a dropped connection.
  - SSE `ping` events must be passed through, or the streaming idle timeout can trip during long thinking.
  - It returns `content-type: text/event-stream`.

  — [Claude Code gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol.md)
- Claude Code sends a system-prompt attribution block "containing the client version and a fingerprint derived from the conversation". From v2.1.181 it is stable per conversation via custom base URL. A gateway must forward the `system` array and bodies unmodified, and redacting or rewriting bodies breaks header/body pairing and preserved-thinking checks. — [Claude Code gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol.md)
- mitmproxy buffers responses by default. Streaming requires `flow.response.stream = True` in the `responseheaders` hook, or the `stream_large_bodies` option. The docs advise against streaming messages you intend to modify. — [mitmproxy addon examples](https://docs.mitmproxy.org/stable/addons-examples)
- One project found that size-based buffering under 1 MiB stalled small-chunk LLM SSE streams. Its fix forced streaming for `text/event-stream`. — [OpenSandbox egress v1.0.12 release note](https://newreleases.io/project/github/opensandbox-group/OpenSandbox/release/docker%2Fegress%2Fv1.0.12)
- An older mitmproxy forum report says SSE did not come through with default settings. — [mitmproxy discourse: Server Sent Events](https://discourse.mitmproxy.org/t/server-sent-events/1496)
- LiteLLM's Anthropic pass-through accepts native Anthropic-format requests (base URL `<proxy>/anthropic`) with logging, cost tracking and streaming. Anthropic's Claude Code docs describe both the LiteLLM unified endpoint and the pass-through, and say Anthropic does not endorse or audit LiteLLM. — [LiteLLM Anthropic pass-through](https://docs.litellm.ai/docs/pass_through/anthropic_completion); [Anthropic Claude Code LLM gateway (older docs URL)](https://docs.claude.com/en/docs/claude-code/llm-gateway)
- **Verified locally (Cline 4.1.23):**
  - Cline maps `attempt_completion` to `submit_and_exit` and extracts the completion text from the tool input's `summary` or else `result` field.
  - It treats `ask_question`/`ask_followup_question` as question tools.

  — local file `~/.vscode/extensions/saoudrizwan.claude-dev-4.1.23/dist/extension.js`
- Codex sets `prompt_cache_key` in the request body on every request. — [openai/codex `codex-rs/core/src/client.rs` (main branch, fetched 2026-10-15)](https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/src/client.rs)

### Inferences
- **Event mapping:** for Anthropic Messages SSE, the visible text is the concatenation of `content_block_delta`/`text_delta` for blocks whose `content_block_start` type is `text`. `thinking`, `redacted_thinking`, `tool_use` (`input_json_delta`) and server-tool blocks must be classified separately. For Responses SSE, the equivalents are `response.output_text.delta` versus reasoning-summary and function-call-argument deltas. Event names come from the public API specs, which were not re-fetched here.
- **Latency:** an unbuffered loopback proxy adds negligible latency, well under AX/OCR. It sees tokens as early as the plugin does.
- **Multi-call turns:** an agent turn makes N model calls. Visible-reply reconstruction must group calls by prompt or turn (see B3) and drop auxiliary calls such as titles, classifiers and compaction.
- **What the proxy cannot see:**
  - Tool results the plugin produces locally appear only in the next request's history.
  - User edits, approvals, rejections and plugin-side errors are invisible.
  - Retries create duplicate partial streams that must be de-duplicated.
  - Plugin-specific transformations are invisible, for example Cline rendering a completion card from tool args.
- **Fidelity:** the proxy gets exact Markdown source of model text, which is far better than AX.

### Gaps
- It is unverified how Codex IDE and Copilot BYOK present "commentary" versus "final answer" text across multiple Responses items.
- No measured latency for LiteLLM or claude-code-router streaming overhead was found.
- Only one claude-code-router project (Go, hishamkaram) surfaced; the Node one did not. — [pkg.go.dev claude-code-router](https://pkg.go.dev/github.com/hishamkaram/claude-code-router)

## B3. Correlating a proxied request to a specific plugin conversation and turn

### Takeaway
Claude Code and Codex send documented or code-visible conversation identifiers. Cline sends a task ID header **only on its own Cline provider**, not on OpenAI-compatible or Anthropic base-URL providers. Copilot BYOK identifiers are unknown.
- **Claude Code:** `X-Claude-Code-Session-Id` is always sent. `x-claude-code-prompt-id` and `x-claude-code-request-class` are sent only when the opt-in `CLAUDE_CODE_GATEWAY_HINT_HEADERS=1` is set.
- **Codex:** `session_id`/`thread_id` headers plus `prompt_cache_key`.

### Cited Findings
- **Claude Code headers**
  - `x-claude-code-session-id`: "A unique identifier for the current Claude Code session". Use it to aggregate a session's requests without parsing bodies.
  - `x-claude-code-agent-id` and `x-claude-code-parent-agent-id`: subagents.
  - Gateway hint headers (v2.1.273+) are **off by default for a custom base URL** and enabled with `CLAUDE_CODE_GATEWAY_HINT_HEADERS=1`:
    - `x-claude-code-request-class` (`main`/`subagent`/`workflow`/`compaction`/`auxiliary`)
    - `x-claude-code-prompt-id`: a random UUID per user prompt, shared by all requests serving that prompt, including subagents (v2.1.283+)
    - `x-claude-code-compaction`
    - `x-claude-code-context-compacted`
    - `x-claude-code-prev-tool-durations`
    - `x-claude-code-agent-type`

  — [Claude Code gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol.md)
- **Verified locally:** the Claude Code 2.1.296 binary contains `X-Claude-Code-Session-Id`, `x-claude-code-prompt-id`, `x-claude-code-request-class`, `x-claude-code-agent-id`, `x-claude-code-parent-agent-id`, `x-claude-code-compaction` and `x-claude-code-context-compacted`. — local file `~/.vscode/extensions/anthropic.claude-code-2.1.296-darwin-arm64/resources/native-binary/claude`
- **Codex (main-branch source)**
  - Responses requests carry `session_id` (root agent: the `prompt_cache_key`; subagents: metadata session ID), `thread_id` and `originator` headers.
  - `x-codex-turn-state` is a server-issued sticky-routing token.
  - `prompt_cache_key` is in the body.
  - These are also sent to custom (non-OpenAI) providers. Routing-hint and Codex-backend headers need OpenAI auth.
  - The fetched summary inferred the exact header names behind `build_session_headers` because they live in a helper crate.

  — [openai/codex `client.rs`](https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/src/client.rs)
- **Verified locally:** the bundled Codex 0.162.0-alpha.17.2 binary contains the header strings `x-codex-turn-metadata`, `x-codex-window-id`, `x-codex-parent-thread-id`, `x-codex-installation-id`, `x-openai-subagent`, `x-codex-turn-state` and `x-codex-inference-call-id`. Which of these reach a custom provider was not determined. — local file `~/.vscode/extensions/openai.chatgpt-26.1007.21434-darwin-arm64/bin/macos-aarch64/codex`
- **Verified locally (Cline 4.1.23):**
  - The header builder returns `X-Task-ID: <sessionId>`, plus `X-CLIENT-TYPE`, `X-CLIENT-VERSION`, `X-PLATFORM`, `X-CORE-VERSION` and `User-Agent: Cline/<v>`, **only when `providerId` is `cline` or `cline-pass`**.
  - The Anthropic path adds `metadata.user_id` and the OpenAI path adds `prompt_cache_key` only when those values are supplied. Whether Cline supplies them was not determined.

  — local file `~/.vscode/extensions/saoudrizwan.claude-dev-4.1.23/dist/extension.js`
- Third-party guides suggest gateway-specific identifiers be injected via custom header fields, for example `X-Coder-AI-Governance-Token` in Cline or Roo. — [Coder AI Gateway: Cline](https://coder.com/docs/ai-coder/ai-gateway/clients/cline)

### Inferences
- **Claude Code:** the session ID gives conversation-level grouping, and the opt-in prompt ID gives turn-level grouping. Mapping a Claude Code session ID to a specific VS Code extension tab or transcript, and proving it is the user's existing conversation, would still need a supported, verified link. It is unverified that the header equals the on-disk transcript ID, and reading transcript files would conflict with the project's "no internal databases" rule.
- **Codex:** `thread_id`/`session_id` likely equal the Codex thread ID shown or resumable in the IDE. Unverified at runtime.
- **Cline on OpenAI-compatible or Anthropic base URLs:** there is no task header. Static custom headers (`openAiHeaders`) are per-provider configuration, not per-task, so they cannot tell concurrent tasks apart. Correlation would fall back to body heuristics such as hashing the system prompt plus message-history prefix. That is fragile across compaction, retries and edits, and is not acceptable as identity for SDC's fencing gates.
- No route gives the proxy turn **causality**. It cannot tell whether a request was triggered by a server-sent prompt or a local user prompt, so it cannot provide effect-time fencing.

### Gaps
- Copilot BYOK Custom Endpoint request headers and conversation identifiers are unknown. No source was found and no local inspection was done.
- Roo Code and Kilo Code task headers were not verified.
- The Codex `x-codex-turn-metadata` contents (likely the turn ID) were not verified.

## B4. Limits: subscription/OAuth logins, TLS, credential exposure, ToS

### Takeaway
Subscription logins are the main barrier:
- **Claude Code:** with only `ANTHROPIC_BASE_URL` set and a saved claude.ai login, traffic *does* route through the gateway carrying the subscription OAuth credential. The proxy therefore handles a subscription bearer, which is a serious security and ToS exposure.
- **Codex:** ChatGPT-login interaction with custom providers is undocumented.
- **Copilot:** plan models cannot be redirected.

A plain-HTTP loopback base URL avoids TLS interception. Any proxy sees full prompts, code and credentials.

### Cited Findings
- **Claude Code credentials and subscriptions**
  - While a gateway credential variable or `apiKeyHelper` is active, requests carry that credential instead of the claude.ai login, and are billed per token to the credential owner.
  - Setting only `ANTHROPIC_BASE_URL` "doesn't replace the subscription". Requests route through the gateway with the saved claude.ai login as the active credential, and the gateway must forward the OAuth `anthropic-beta` capability.

  — [Claude Code: Other LLM gateways](https://code.claude.com/docs/en/llm-gateway.md); [gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol.md)
- Some Claude Code traffic bypasses `ANTHROPIC_BASE_URL`: the fast-mode availability check and the WebFetch domain safety check call `api.anthropic.com` directly. Gateway sessions are not eligible for the HIPAA configuration. — [gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol.md)
- **Codex login**
  - `forced_login_method` restricts login to `chatgpt` or `api`.
  - `chatgpt_base_url` overrides only the ChatGPT login flow.
  - `requires_openai_auth` marks providers that use OpenAI auth.
  - The docs do not state whether a ChatGPT-plan login can be used with a custom `base_url`.

  — [Codex config reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- Copilot BYOK traffic is billed by the chosen provider, not Copilot quotas. Business/Enterprise policy can disable BYOK. — [VS Code docs: language models](https://code.visualstudio.com/docs/copilot/customization/language-models); [GitHub changelog 2026-04-22](https://github.blog/changelog/2026-04-22-bring-your-own-language-model-key-in-vs-code-now-available/)
- Claude Code gateway model discovery sends both `Authorization` and `x-api-key` with resolved credentials, and treats redirects as failure so credentials cannot leak. — [gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol.md)
- Anthropic Consumer Terms restrict automated or non-human access except via API key or explicit permission. — [Anthropic Consumer Terms](https://www.anthropic.com/legal/consumer-terms)

### Inferences
- **TLS:** pointing the plugin at `http://127.0.0.1:<port>` and having the proxy make the upstream HTTPS call avoids MITM certificates entirely.
  - Transparent interception (mitmproxy-style) would instead require trusting a local CA in each runtime. Node-based extensions honour `NODE_EXTRA_CA_CERTS`, as the project already uses it for its own CA. Codex is a Rust binary whose trust store behaviour was not checked.
  - Transparent interception of a vendor's TLS to its own backend, especially subscription traffic, is materially more ToS-sensitive than a documented base-URL setting.
- **Credentials:** the proxy receives API keys or OAuth bearer tokens, the full system prompt, the entire code context and tool outputs. It must bind to loopback only, authenticate its own clients, never log credentials, and keep logs out of evidence. That matches the project's existing "bind local services to loopback, authenticate requests" rule.
- **ToS:** pass-through of an API-key session to its own provider is the use case vendors document for gateways, and appears low-risk. Routing a **subscription** OAuth session through a self-built proxy that extracts outputs for another system is a grey area under the consumer-terms automation and scraping clauses. Needs vendor or legal confirmation.

### Gaps
- No primary source on whether Codex with a ChatGPT-plan login honours `openai_base_url` or a custom provider.
- No GitHub Copilot ToS review was done.
- No explicit Anthropic statement on proxying claude.ai-subscription Claude Code traffic through a user-run proxy, beyond the docs describing it as working.

## B5. Project-rule classification for Route B, and overall comparison

### Takeaway
A strictly pass-through, non-modifying proxy does not replace the plugin's runtime: the plugin still builds prompts, runs the agent loop and executes tools. It is, however, a new component on the model-call path, so it must be flagged against the AGENTS.md ban on a "separate model app-server". It is **read-only**: it cannot send a prompt into an existing conversation without tampering with model requests, and tampering *would* make it a replacement or hidden executor. Neither route meets the multi-backend gates of supported attachment, conversation identity and effect-time fencing. Each is at most an observational supplement.

### Cited Findings
- AGENTS.md:
  - "Do not add a replacement runtime, headless executor, private app socket/API or separate model app-server."
  - Codex/Claude drivers stay blocked "until supported attachment and effect-time fencing are established".
  - "Do not substitute standalone vendor runtimes, CLI sessions, private app channels or new conversations."
  - The FastAPI gateway is "a public HTTP/SSE facade over the existing TypeScript server, not a new LLM executor."

  — local file `/Users/samin/Documents/ServerDrivenChat/AGENTS.md`
- Prior project research (2026-10-11) treated "Codex calling SDC as its Responses model service" as a separate design. It needs durable per-model-call identity, exact payload/tool mapping, truthful catalog, store/compaction handling and qualified caller-effect ownership. It concluded that static headers, body hashes or proxy UUIDs do not solve identity. — local file `/Users/samin/Documents/ServerDrivenChat/AGENTS.md` (Codex model-provider consumer research section)
- Claude Code's gateway guide says a gateway that rewrites or redacts bodies breaks capability pairing and preserved-thinking checks. Inspection must be "without modifying". — [gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol.md)

### Inferences
- **Route A (OS accessibility/OCR):**
  - Allowed by the letter of the runtime rule: no runtime replacement, public OS API, no private socket or database.
  - Not qualifiable as a driver: no identity, no fencing, UI-version-fragile, virtualized history.
  - Requires user-granted Accessibility (and Screen Recording for OCR) TCC permissions.
  - Consumer-ToS scraping risk on subscription plans.
  - Latency: under 1 s typical, inferred.
  - Fidelity: rendered text only.
  - Classification: **diagnostic/assistive only**.
- **Route B (base-URL pass-through proxy):**
  - Grey zone under the "separate model app-server" rule. It needs an explicit decision record saying it is pass-through, non-modifying, loopback-only and never synthesizes responses.
  - Requires changing the plugin's provider configuration.
  - Feasible for API-key or BYOK sessions.
  - Claude Code subscription traffic is technically routable but carries OAuth exposure and ToS concerns.
  - Codex ChatGPT-plan behaviour is unknown, and Copilot-plan models are excluded.
  - Identity: good for Claude Code (session ID, plus prompt ID if opted in) and Codex (session/thread IDs). Poor for Cline on non-Cline providers.
  - Latency: true token streaming.
  - Fidelity: exact model Markdown, but plugin-specific parsing is needed, for example Cline's completion-tool arguments.
  - Still read-only: no prompt injection without becoming an executor, and no causal turn fencing.
  - Classification: **observational supplement only; injection prohibited**.
- **Sending prompts:** neither route provides the "send prompt into existing conversation" half. AX could type into the UI via UI automation, which is fragile and intrusive and needs user consent. A proxy could only alter in-flight requests, which is forbidden tampering.

### Gaps
- No runtime test has confirmed any of: AX visibility of webview text on VS Code 1.140; Claude Code session-ID-to-IDE-tab mapping; Codex thread-ID-to-IDE-thread mapping; or Copilot BYOK request identifiers. Each needs a disposable, user-approved lab run with an isolated profile and test credentials, not the user's existing conversations.
