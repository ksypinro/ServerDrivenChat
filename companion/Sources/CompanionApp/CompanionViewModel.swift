import CompanionCore
import Foundation
import SwiftUI

struct PendingPairing: Codable, Equatable {
    let serverResponse: CompanionPairing
    let localSecret: String
    var serverConfirmed: Bool
}

@MainActor
final class CompanionViewModel: ObservableObject {
    @Published var serverURLText: String { didSet { UserDefaults.standard.set(serverURLText, forKey: "serverURL") } }
    @Published var serverLabel: String { didSet { UserDefaults.standard.set(serverLabel, forKey: "serverLabel") } }
    @Published var lifecycle = CompanionLifecycle()
    @Published var selectedConversationId = FakeAppAdapter.conversations.first!.id
    @Published var userTokens: CompanionUserTokens?
    @Published var pairedDevice: CompanionDeviceCredential?
    @Published var pendingPairing: PendingPairing?
    @Published var isWorking = false
    @Published var notice = ""
    @Published var error = ""
    @Published var didRestore = false

    let fakeAdapter = FakeAppAdapter()
    private let vault: CredentialVault

    init(vault: CredentialVault = KeychainCredentialVault()) {
        self.vault = vault
        self.serverURLText = UserDefaults.standard.string(forKey: "serverURL") ?? "http://127.0.0.1:8765"
        self.serverLabel = UserDefaults.standard.string(forKey: "serverLabel") ?? "Development server"
    }

    var profile: CompanionServerProfile? {
        guard let url = URL(string: serverURLText) else { return nil }
        return try? CompanionServerProfile(origin: url, displayName: serverLabel)
    }
    var isSignedIn: Bool { userTokens != nil }
    var isPaired: Bool { pairedDevice != nil }
    var selectedConversation: FakeConversation? { FakeAppAdapter.conversations.first { $0.id == selectedConversationId } }
    var statusText: String {
        switch lifecycle.connectionState {
        case .connected: "Fake adapter preview connected"
        case .disabled: "Remote dispatch locally disabled"
        case .stale: "Connection stale after sleep; reconnect required"
        case .disconnected: "Disconnected"
        }
    }

    func restoreSecureState() async {
        guard !didRestore else { return }
        didRestore = true
        lifecycle.start()
        guard let profile else { return }
        let namespace = profile.keychainNamespace
        do {
            if let bytes = try vault.read(for: "\(namespace).auth"), let saved = try? JSONDecoder().decode(CompanionUserTokens.self, from: bytes) {
                if tokenHasTime(saved.expiresAt, remaining: 30) { userTokens = saved }
                else if let refresh = saved.refreshToken {
                    do {
                        let refreshed = try await client(for: profile).refreshSignIn(userId: saved.userId, refreshToken: refresh)
                        let current = CompanionUserTokens(accessToken: refreshed.accessToken,
                                                          refreshToken: refreshed.refreshToken ?? refresh,
                                                          expiresAt: refreshed.expiresAt,
                                                          userId: refreshed.userId,
                                                          email: refreshed.email)
                        try save(current, at: "\(namespace).auth")
                        userTokens = current
                    } catch {
                        try vault.delete(for: "\(namespace).auth")
                        notice = "Sign in again to pair or manage this Mac. The companion host is running locally."
                    }
                } else {
                    try vault.delete(for: "\(namespace).auth")
                }
            }
            if let bytes = try vault.read(for: "\(namespace).device"), let saved = try? JSONDecoder().decode(CompanionDeviceCredential.self, from: bytes), tokenHasTime(saved.expiresAt, remaining: 0) {
                pairedDevice = saved
            }
            if let bytes = try vault.read(for: "\(namespace).pairing"), let saved = try? JSONDecoder().decode(PendingPairing.self, from: bytes), tokenHasTime(saved.serverResponse.expiresAt, remaining: 0) {
                pendingPairing = saved
            } else {
                try vault.delete(for: "\(namespace).pairing")
            }
        } catch { self.error = "Secure settings could not be restored: \(error.localizedDescription)" }
    }

    func signIn(using authorize: @escaping (URL) async throws -> URL) async {
        await perform {
            guard let profile = self.profile else { throw CompanionServerError.invalidServerURL }
            let redirect = "sdccompanion://auth"
            let service = self.client(for: profile)
            let start = try await service.startSignIn(redirectUri: redirect)
            let callback = try await authorize(start.authorizationUrl)
            let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false)
            guard callback.scheme == "sdccompanion", callback.host == "auth", parts?.queryItems?.first(where: { $0.name == "state" })?.value == start.state,
                  let code = parts?.queryItems?.first(where: { $0.name == "code" })?.value else { throw CompanionServerError.signInStateMismatch }
            let tokens = try await service.exchangeSignIn(code: code, state: start.state)
            try self.save(tokens, at: "\(profile.keychainNamespace).auth")
            self.userTokens = tokens
            self.notice = "Signed in as \(tokens.email)."
        }
    }

    func startPairing() async {
        await perform {
            guard let profile = self.profile, let tokens = self.userTokens else { throw CompanionViewError.signInFirst }
            let secret = try LocalPairingSecret.generate()
            let response = try await self.client(for: profile).startPairing(accessToken: tokens.accessToken, label: "\(ProcessInfo.processInfo.hostName) · \(self.serverLabel)", localSecret: secret)
            let pending = PendingPairing(serverResponse: response, localSecret: secret, serverConfirmed: false)
            try self.save(pending, at: "\(profile.keychainNamespace).pairing")
            self.pendingPairing = pending
            self.notice = "Pairing started. Confirm the server code, then confirm local consent on this Mac."
        }
    }

    func confirmOnServer() async {
        await perform {
            guard let profile = self.profile, let tokens = self.userTokens, let pending = self.pendingPairing else { throw CompanionViewError.pairingNotStarted }
            try await self.client(for: profile).confirmPairingOnServer(accessToken: tokens.accessToken, pairingId: pending.serverResponse.pairingId, code: pending.serverResponse.pairingCode)
            let updated = PendingPairing(serverResponse: pending.serverResponse, localSecret: pending.localSecret, serverConfirmed: true)
            try self.save(updated, at: "\(profile.keychainNamespace).pairing")
            self.pendingPairing = updated
            self.notice = "Server confirmed this pairing. Local consent is still required."
        }
    }

    func confirmLocallyWithConsent() async {
        await perform {
            guard let profile = self.profile, let pending = self.pendingPairing, pending.serverConfirmed else { throw CompanionViewError.serverConfirmationRequired }
            let credential = try await self.client(for: profile).confirmPairingLocally(pairingId: pending.serverResponse.pairingId, localSecret: pending.localSecret)
            try self.save(credential, at: "\(profile.keychainNamespace).device")
            try self.vault.delete(for: "\(profile.keychainNamespace).pairing")
            self.pairedDevice = credential
            self.pendingPairing = nil
            self.notice = "This Mac is paired. Its device credential is protected by Keychain."
        }
    }

    func connectPreview() {
        error = ""
        do {
            guard lifecycle.remoteDispatchEnabled else { throw CompanionViewError.enableBeforeConnecting }
            _ = try fakeAdapter.attach(conversationId: selectedConversationId)
            lifecycle.start()
            lifecycle.connect()
            notice = "Fake adapter preview attached. No model process or real app is connected."
        } catch { self.error = error.localizedDescription }
    }

    func disconnectPreview() {
        fakeAdapter.detach()
        lifecycle.disconnect()
        notice = "Preview disconnected. The companion remains available."
    }

    func restartPreview() {
        lifecycle.restart()
        fakeAdapter.detach()
        connectPreview()
        if lifecycle.connectionState == .connected { notice = "Preview restarted and reattached to the selected fake conversation." }
    }

    func disableLocally() {
        lifecycle.disableImmediately()
        fakeAdapter.detach()
        notice = "Local disable is active. New remote dispatch is blocked immediately on this Mac."
    }

    func enableLocally() {
        lifecycle.enableRemoteDispatch()
        notice = "Local dispatch is enabled. Connect the preview explicitly to resume its simulated listener."
    }

    func signOut() {
        guard let profile else { return }
        do {
            try vault.delete(for: "\(profile.keychainNamespace).auth")
            userTokens = nil
            notice = "Signed out on this Mac. Existing device pairing remains available until its credential expires or is revoked."
        } catch let caught { self.error = "Could not remove the saved sign-in: \(caught.localizedDescription)" }
    }

    func beginFakeTurn() { lifecycle.beginFakeTurn() }
    func finishFakeTurn() { lifecycle.fakeTurnCompleted() }
    func hostWillSleep() { lifecycle.hostWillSleep(); fakeAdapter.detach() }
    func hostDidWake() { lifecycle.hostDidWake(); notice = "Mac woke. Reconnect and renew the lease before dispatch can resume." }
    func hostWillTerminate() { lifecycle.shutDown(); fakeAdapter.detach() }

    private func perform(_ action: () async throws -> Void) async {
        guard !isWorking else { return }
        isWorking = true
        error = ""
        defer { isWorking = false }
        do { try await action() }
        catch { self.error = error.localizedDescription }
    }

    private func client(for profile: CompanionServerProfile) -> URLSessionCompanionServerClient {
        URLSessionCompanionServerClient(profile: profile)
    }

    private func save<T: Encodable>(_ value: T, at key: String) throws {
        try vault.store(JSONEncoder().encode(value), for: key)
    }

    private func tokenHasTime(_ timestamp: String, remaining seconds: TimeInterval) -> Bool {
        CompanionTimestamp.parse(timestamp).map { $0.timeIntervalSinceNow > seconds } ?? false
    }
}

enum CompanionViewError: Error, LocalizedError {
    case signInFirst
    case pairingNotStarted
    case serverConfirmationRequired
    case enableBeforeConnecting
    var errorDescription: String? {
        switch self {
        case .signInFirst: "Sign in before starting device pairing."
        case .pairingNotStarted: "Start pairing before confirming it."
        case .serverConfirmationRequired: "Confirm the code on the server before local consent."
        case .enableBeforeConnecting: "Enable local dispatch before connecting the preview."
        }
    }
}
