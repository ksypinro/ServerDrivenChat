import AppKit
import AuthenticationServices
import CompanionCore
import SwiftUI

@main
struct ServerDrivenChatCompanionApp: App {
    @StateObject private var model = CompanionViewModel()
    @StateObject private var browserAuth = CompanionBrowserAuth()

    var body: some Scene {
        WindowGroup {
            CompanionWindow(model: model, browserAuth: browserAuth)
                .frame(minWidth: 980, minHeight: 720)
                .task { await model.restoreSecureState() }
                .onReceive(NSWorkspace.shared.notificationCenter.publisher(for: NSWorkspace.willSleepNotification)) { _ in model.hostWillSleep() }
                .onReceive(NSWorkspace.shared.notificationCenter.publisher(for: NSWorkspace.didWakeNotification)) { _ in model.hostDidWake() }
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in model.hostWillTerminate() }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1120, height: 790)
    }
}

@MainActor
final class CompanionBrowserAuth: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var authenticationSession: ASWebAuthenticationSession?

    func authorize(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "sdccompanion") { callback, error in
                if let callback { continuation.resume(returning: callback) }
                else { continuation.resume(throwing: error ?? CompanionServerError.invalidResponse) }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            authenticationSession = session
            if !session.start() { continuation.resume(throwing: CompanionServerError.invalidResponse) }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApp.keyWindow ?? NSApp.windows.first ?? NSWindow()
    }
}

private enum CompanionPage: String, CaseIterable, Identifiable {
    case overview = "Overview"
    case pairing = "Sign in & pair"
    case conversation = "App & conversation"
    case capabilities = "Capabilities"
    case settings = "Settings"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .overview: "rectangle.grid.1x2"
        case .pairing: "person.badge.key"
        case .conversation: "bubble.left.and.bubble.right"
        case .capabilities: "checkmark.shield"
        case .settings: "gearshape"
        }
    }
}

private struct CompanionWindow: View {
    @ObservedObject var model: CompanionViewModel
    @ObservedObject var browserAuth: CompanionBrowserAuth
    @State private var selectedPage: CompanionPage? = .overview

    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationSplitViewColumnWidth(min: 220, ideal: 245, max: 285)
        } detail: {
            VStack(spacing: 0) {
                header
                ScrollView { pageContent.padding(28) }
                footer
            }
            .background(Color(nsColor: .windowBackgroundColor))
        }
        .tint(Color(red: 0.16, green: 0.63, blue: 0.56))
        .alert("Companion", isPresented: Binding(get: { !model.error.isEmpty }, set: { if !$0 { model.error = "" } })) {
            Button("OK", role: .cancel) { model.error = "" }
        } message: { Text(model.error) }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 11) {
                Image(systemName: "arrow.trianglehead.2.clockwise.rotate.90")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(Color(red: 0.16, green: 0.63, blue: 0.56), in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 2) {
                    Text("SERVER DRIVEN CHAT").font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
                    Text("Companion").font(.system(size: 17, weight: .semibold, design: .rounded))
                }
            }
            VStack(alignment: .leading, spacing: 5) {
                Label(model.statusText, systemImage: model.lifecycle.connectionState == .connected ? "circle.inset.filled" : "circle")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(model.lifecycle.connectionState == .connected ? Color.green : Color.secondary)
                    .lineLimit(2)
                Text(model.lifecycle.hostState == .sleeping ? "Mac is asleep" : "Companion stays open between turns")
                    .font(.system(size: 10)).foregroundStyle(.tertiary)
            }
            List(CompanionPage.allCases, selection: $selectedPage) { page in
                Label(page.rawValue, systemImage: page.symbol).tag(page as CompanionPage?)
            }
            .listStyle(.sidebar)
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 8) {
                Text("LOCAL SAFETY").font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
                Button {
                    model.lifecycle.remoteDispatchEnabled ? model.disableLocally() : model.enableLocally()
                } label: {
                    Label(model.lifecycle.remoteDispatchEnabled ? "Disable remote control" : "Enable remote control",
                          systemImage: model.lifecycle.remoteDispatchEnabled ? "hand.raised.fill" : "checkmark.shield.fill")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.borderedProminent)
                .tint(model.lifecycle.remoteDispatchEnabled ? Color.orange : Color.green)
                .controlSize(.small)
                Text(model.lifecycle.remoteDispatchEnabled ? "Stops dispatch on this Mac immediately." : "Locally disabled. No running model work was cancelled.")
                    .font(.system(size: 9)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
        }
        .padding(18)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 3) {
                Text(selectedPage?.rawValue.uppercased() ?? "COMPANION")
                    .font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
                Text(pageTitle).font(.system(size: 22, weight: .semibold, design: .rounded))
            }
            Spacer()
            HStack(spacing: 8) {
                Circle().fill(model.lifecycle.hostState == .sleeping ? Color.orange : Color.green).frame(width: 7, height: 7)
                Text(model.lifecycle.hostState == .sleeping ? "Mac asleep" : "Companion running")
                    .font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 11).padding(.vertical, 7)
            .background(.quaternary, in: Capsule())
        }
        .padding(.horizontal, 30).padding(.vertical, 19)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.55))
        .overlay(alignment: .bottom) { Divider() }
    }

    private var footer: some View {
        HStack {
            Label(model.lifecycle.connectionState == .connected ? "Fake adapter preview" : "App adapter disconnected", systemImage: "desktopcomputer")
            Spacer()
            Text("App-owned execution · no LLM runtime in this companion")
        }
        .font(.system(size: 9)).foregroundStyle(.secondary)
        .padding(.horizontal, 26).padding(.vertical, 10)
        .overlay(alignment: .top) { Divider() }
    }

    @ViewBuilder private var pageContent: some View {
        switch selectedPage ?? .overview {
        case .overview: overviewPage
        case .pairing: pairingPage
        case .conversation: conversationPage
        case .capabilities: capabilityPage
        case .settings: settingsPage
        }
    }

    private var pageTitle: String {
        switch selectedPage ?? .overview {
        case .overview: "Your companion is ready"
        case .pairing: "Sign in and pair this Mac"
        case .conversation: "Choose an app conversation"
        case .capabilities: "What this adapter can do"
        case .settings: "Server and secure settings"
        }
    }

    private var overviewPage: some View {
        VStack(alignment: .leading, spacing: 21) {
            HStack(spacing: 12) {
                Image(systemName: model.lifecycle.connectionState == .connected ? "checkmark.circle.fill" : "sparkles")
                    .font(.system(size: 20)).foregroundStyle(model.lifecycle.connectionState == .connected ? Color.green : Color.teal)
                VStack(alignment: .leading, spacing: 3) {
                    Text(model.statusText).font(.system(size: 14, weight: .semibold))
                    Text(model.lifecycle.hostState == .sleeping ? "Connection status is stale until wake and lease renewal." : "The graphical companion remains open even when a simulated turn ends.")
                        .font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer()
                Text(model.lifecycle.remoteDispatchEnabled ? "ENABLED LOCALLY" : "DISABLED LOCALLY")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(model.lifecycle.remoteDispatchEnabled ? Color.green : Color.orange)
            }
            .padding(16).background(.background, in: RoundedRectangle(cornerRadius: 13)).overlay(RoundedRectangle(cornerRadius: 13).stroke(.quaternary))

            HStack(alignment: .top, spacing: 15) {
                infoCard(title: "SERVER PROFILE", value: model.profile?.displayName ?? "Needs a valid URL", detail: model.profile?.origin.absoluteString ?? model.serverURLText, symbol: "server.rack")
                infoCard(title: "DEVICE PAIRING", value: model.isPaired ? "Paired" : "Not paired", detail: model.pairedDevice.map { "Device · \($0.deviceId.prefix(8))…" } ?? "Sign in, then pair this Mac", symbol: "laptopcomputer.and.iphone")
            }

            VStack(alignment: .leading, spacing: 13) {
                sectionHeading("FAKE ADAPTER PREVIEW", subtitle: "A local simulation for M15. It does not connect to Codex, Cline, or a model.")
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(model.selectedConversation?.title ?? "Select a conversation").font(.system(size: 15, weight: .semibold))
                        Text("\(FakeAppAdapter.appName) · Existing simulated conversation").font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(model.lifecycle.turnState.rawValue.uppercased())
                        .font(.system(size: 9, weight: .bold, design: .monospaced)).padding(.horizontal, 9).padding(.vertical, 6).background(.quaternary, in: Capsule())
                }
                HStack(spacing: 9) {
                    Button { model.connectPreview() } label: { Label("Connect", systemImage: "link") }.buttonStyle(.borderedProminent).disabled(!model.lifecycle.remoteDispatchEnabled || model.isWorking)
                    Button { model.disconnectPreview() } label: { Label("Disconnect", systemImage: "link.slash") }.buttonStyle(.bordered).disabled(model.lifecycle.connectionState != .connected)
                    Button { model.restartPreview() } label: { Label("Restart preview", systemImage: "arrow.clockwise") }.buttonStyle(.bordered).disabled(!model.lifecycle.remoteDispatchEnabled)
                    Spacer()
                    Button("Simulate turn completion") { model.beginFakeTurn(); model.finishFakeTurn() }
                        .buttonStyle(.link).disabled(!model.lifecycle.canDispatch)
                }
                HStack(spacing: 8) {
                    Image(systemName: "info.circle").foregroundStyle(.secondary)
                    Text("Ending a turn leaves the companion running. Remote server command subscriptions are M16 work.")
                        .font(.system(size: 10)).foregroundStyle(.secondary)
                }
            }
            .padding(18).background(.background, in: RoundedRectangle(cornerRadius: 13)).overlay(RoundedRectangle(cornerRadius: 13).stroke(.quaternary))

            if !model.notice.isEmpty { Label(model.notice, systemImage: "checkmark.circle").font(.system(size: 11)).foregroundStyle(.secondary) }
        }
    }

    private var pairingPage: some View {
        VStack(alignment: .leading, spacing: 18) {
            sectionHeading("1 · SERVER PROFILE", subtitle: "Credentials are sent only in HTTPS authorization headers. Loopback HTTP is allowed for development.")
            TextField("https://server.example.com", text: $model.serverURLText).textFieldStyle(.roundedBorder)
            TextField("Profile name", text: $model.serverLabel).textFieldStyle(.roundedBorder)
            HStack(spacing: 10) {
                Label(model.isSignedIn ? "Signed in · \(model.userTokens?.email ?? "account")" : "Not signed in", systemImage: model.isSignedIn ? "person.crop.circle.badge.checkmark" : "person.crop.circle")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer()
                Button { Task { await model.signIn { url in try await browserAuth.authorize(url) } } } label: {
                    Label(model.isSignedIn ? "Sign in again" : "Sign in with browser", systemImage: "safari")
                }.buttonStyle(.borderedProminent).disabled(model.isWorking || model.profile == nil)
            }
            Divider()
            sectionHeading("2 · PAIR THIS DEVICE", subtitle: "The server confirmation and local Keychain-backed consent are separate steps.")
            if model.isPaired {
                Label("This Mac is paired", systemImage: "checkmark.shield.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(.green)
                Text("Device ID · \(model.pairedDevice?.deviceId ?? "")").font(.system(size: 10, design: .monospaced)).textSelection(.enabled)
                Text("Credential expiry · \(model.pairedDevice?.expiresAt ?? "")").font(.system(size: 10)).foregroundStyle(.secondary)
            } else if let pending = model.pendingPairing {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Pairing code").font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
                    Text(pending.serverResponse.pairingCode).font(.system(size: 24, weight: .bold, design: .monospaced)).tracking(3).textSelection(.enabled)
                    Text("Expires \(pending.serverResponse.expiresAt)").font(.system(size: 10)).foregroundStyle(.secondary)
                    Text("Device ID · \(pending.serverResponse.deviceId)").font(.system(size: 9, design: .monospaced)).foregroundStyle(.secondary).textSelection(.enabled)
                }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
                Button { Task { await model.confirmOnServer() } } label: { Label("Confirm pairing code on server", systemImage: "checkmark.seal") }
                    .buttonStyle(.bordered).disabled(model.isWorking || pending.serverConfirmed)
                if pending.serverConfirmed {
                    Divider()
                    Text("LOCAL CONSENT").font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(.orange)
                    Text("Allow this Mac to receive authenticated commands for the selected app. The device credential will be stored in this Mac’s Keychain.")
                        .font(.system(size: 11)).fixedSize(horizontal: false, vertical: true)
                    Button { Task { await model.confirmLocallyWithConsent() } } label: { Label("Allow this Mac and store credential", systemImage: "hand.thumbsup") }
                        .buttonStyle(.borderedProminent).tint(.orange).disabled(model.isWorking)
                }
            } else {
                Button { Task { await model.startPairing() } } label: { Label("Start device pairing", systemImage: "plus.circle") }
                    .buttonStyle(.borderedProminent).disabled(!model.isSignedIn || model.isWorking || model.profile == nil)
                if !model.isSignedIn { Text("Sign in first to create a short-lived pairing request.").font(.system(size: 10)).foregroundStyle(.secondary) }
            }
            Text("The local challenge never appears in the pairing response or the UI. Local disable remains available without sign-in or network access.")
                .font(.system(size: 10)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .padding(20).background(.background, in: RoundedRectangle(cornerRadius: 13)).overlay(RoundedRectangle(cornerRadius: 13).stroke(.quaternary))
    }

    private var conversationPage: some View {
        VStack(alignment: .leading, spacing: 17) {
            sectionHeading("SIMULATED APP", subtitle: "Real vendor bindings are intentionally outside M15. This selection uses the deterministic fake adapter.")
            HStack(spacing: 12) {
                Image(systemName: "bubble.left.and.bubble.right.fill").font(.system(size: 18)).foregroundStyle(.teal).frame(width: 44, height: 44).background(.teal.opacity(0.1), in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 4) { Text(FakeAppAdapter.appName).font(.system(size: 14, weight: .semibold)); Text("Deterministic simulation · no provider or LLM runtime").font(.system(size: 10)).foregroundStyle(.secondary) }
                Spacer()
                Text("FAKE").font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(.orange).padding(6).background(.orange.opacity(0.1), in: Capsule())
            }.padding(13).background(.background, in: RoundedRectangle(cornerRadius: 10))
            Text("Existing conversation").font(.system(size: 11, weight: .semibold))
            ForEach(FakeAppAdapter.conversations) { conversation in
                Button { model.selectedConversationId = conversation.id } label: {
                    HStack(spacing: 12) {
                        Image(systemName: model.selectedConversationId == conversation.id ? "largecircle.fill.circle" : "circle").foregroundStyle(model.selectedConversationId == conversation.id ? Color.teal : Color.secondary)
                        VStack(alignment: .leading, spacing: 3) { Text(conversation.title).font(.system(size: 12, weight: .medium)); Text(conversation.detail).font(.system(size: 10)).foregroundStyle(.secondary) }
                        Spacer()
                        if model.fakeAdapter.selectedConversation?.id == conversation.id { Text("ATTACHED").font(.system(size: 8, weight: .bold, design: .monospaced)).foregroundStyle(.green) }
                    }.padding(12).contentShape(Rectangle())
                }.buttonStyle(.plain).background(.background, in: RoundedRectangle(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(model.selectedConversationId == conversation.id ? Color.teal.opacity(0.55) : Color.clear))
            }
            HStack {
                Button { model.connectPreview() } label: { Label("Attach fake adapter", systemImage: "link") }.buttonStyle(.borderedProminent).disabled(!model.lifecycle.remoteDispatchEnabled)
                Button { model.disconnectPreview() } label: { Label("Detach", systemImage: "link.slash") }.buttonStyle(.bordered).disabled(model.lifecycle.connectionState != .connected)
            }
            Label("The companion host remains running after the simulated turn ends.", systemImage: "info.circle").font(.system(size: 10)).foregroundStyle(.secondary)
        }
    }

    private var capabilityPage: some View {
        VStack(alignment: .leading, spacing: 15) {
            sectionHeading("FAKE ADAPTER CAPABILITIES", subtitle: "These values describe only the built-in preview, never Codex or Cline.")
            ForEach(FakeAppAdapter.capabilities) { capability in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: capability.status == "supported" ? "checkmark.circle.fill" : "minus.circle.fill")
                        .foregroundStyle(capability.status == "supported" ? Color.green : Color.secondary).padding(.top, 2)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(capability.operation).font(.system(size: 12, weight: .semibold, design: .monospaced)); Spacer(); Text(capability.status.uppercased()).font(.system(size: 8, weight: .bold, design: .monospaced)).foregroundStyle(capability.status == "supported" ? Color.green : Color.secondary) }
                        Text(capability.explanation).font(.system(size: 10)).foregroundStyle(.secondary)
                    }
                }.padding(12).background(.background, in: RoundedRectangle(cornerRadius: 9))
            }
            Text("Unsupported operations remain unavailable. M16/M17/M19/M20 own real-app control and native approvals.")
                .font(.system(size: 10)).foregroundStyle(.secondary)
        }
    }

    private var settingsPage: some View {
        VStack(alignment: .leading, spacing: 17) {
            sectionHeading("SERVER PROFILE", subtitle: "Server URLs are preferences. Access, refresh and device credentials are stored separately in Keychain.")
            TextField("Server origin", text: $model.serverURLText).textFieldStyle(.roundedBorder)
            TextField("Display name", text: $model.serverLabel).textFieldStyle(.roundedBorder)
            Label(model.profile == nil ? "URL rejected · HTTPS required outside localhost" : "Validated origin · \(model.profile!.origin.absoluteString)", systemImage: model.profile == nil ? "xmark.shield" : "checkmark.shield")
                .font(.system(size: 10)).foregroundStyle(model.profile == nil ? Color.orange : Color.secondary)
            Divider()
            sectionHeading("SECURE CREDENTIALS", subtitle: "Opaque access/refresh and paired-device credentials use this Mac’s Keychain with device-only accessibility.")
            credentialRow("Identity", value: model.isSignedIn ? model.userTokens?.email ?? "Signed in" : "Not signed in")
            credentialRow("Paired device", value: model.pairedDevice?.deviceId ?? "Not paired")
            credentialRow("Local dispatch", value: model.lifecycle.remoteDispatchEnabled ? "Enabled" : "Disabled immediately")
            HStack(spacing: 9) {
                Button { Task { await model.signIn { url in try await browserAuth.authorize(url) } } } label: { Label("Sign in", systemImage: "person.crop.circle") }.buttonStyle(.borderedProminent).disabled(model.isWorking || model.profile == nil)
                if model.isSignedIn { Button("Sign out on this Mac") { model.signOut() }.buttonStyle(.bordered) }
            }
            Divider()
            sectionHeading("MACOS ACCESS", subtitle: "Open native privacy settings only when a future UI-assisted adapter requires them.")
            HStack {
                Button("Accessibility settings") { openPrivacyPane("Privacy_Accessibility") }.buttonStyle(.bordered)
                Button("Screen recording settings") { openPrivacyPane("Privacy_ScreenCapture") }.buttonStyle(.bordered)
            }
            Text("M15 requests no accessibility or screen-capture permission. The fake adapter needs neither.").font(.system(size: 10)).foregroundStyle(.secondary)
        }
        .padding(20).background(.background, in: RoundedRectangle(cornerRadius: 13)).overlay(RoundedRectangle(cornerRadius: 13).stroke(.quaternary))
    }

    private func infoCard(title: String, value: String, detail: String, symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Image(systemName: symbol).font(.system(size: 15)).foregroundStyle(.teal)
            Text(title).font(.system(size: 8, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
            Text(value).font(.system(size: 13, weight: .semibold))
            Text(detail).font(.system(size: 9)).foregroundStyle(.secondary).lineLimit(2)
        }.frame(maxWidth: .infinity, minHeight: 112, alignment: .leading).padding(14).background(.background, in: RoundedRectangle(cornerRadius: 11))
    }

    private func sectionHeading(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
            Text(subtitle).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func credentialRow(_ title: String, value: String) -> some View {
        HStack { Text(title).font(.system(size: 11)).foregroundStyle(.secondary); Spacer(); Text(value).font(.system(size: 10, design: .monospaced)).lineLimit(1).textSelection(.enabled) }.padding(.vertical, 4)
    }

    private func openPrivacyPane(_ pane: String) {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)") else { return }
        NSWorkspace.shared.open(url)
    }
}
