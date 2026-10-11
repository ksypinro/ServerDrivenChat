import XCTest
@testable import CompanionCore

final class ModuleIdentityTests: XCTestCase {
    func testModuleIdentity() {
        XCTAssertEqual(ModuleIdentity.name, "companion-core")
    }

    func testCompanionLifecycleSurvivesTurnsAndFencesSleepAndDisable() {
        var lifecycle = CompanionLifecycle()
        lifecycle.start()
        lifecycle.connect()
        XCTAssertTrue(lifecycle.canDispatch)

        lifecycle.beginFakeTurn()
        XCTAssertEqual(lifecycle.turnState, .running)
        lifecycle.fakeTurnCompleted()
        XCTAssertEqual(lifecycle.turnState, .completed)
        XCTAssertEqual(lifecycle.hostState, .running, "a completed turn must not stop the companion host")
        XCTAssertTrue(lifecycle.canDispatch)

        lifecycle.hostWillSleep()
        XCTAssertEqual(lifecycle.hostState, .sleeping)
        XCTAssertEqual(lifecycle.connectionState, .stale)
        XCTAssertFalse(lifecycle.canDispatch)
        lifecycle.hostDidWake()
        XCTAssertEqual(lifecycle.connectionState, .stale, "wake must require reconnect or lease renewal")
        lifecycle.markLeaseRenewed()
        XCTAssertTrue(lifecycle.canDispatch)

        lifecycle.disableImmediately()
        XCTAssertFalse(lifecycle.canDispatch)
        XCTAssertEqual(lifecycle.connectionState, .disabled)
        lifecycle.markLeaseRenewed()
        XCTAssertFalse(lifecycle.canDispatch, "a renewal must not override a local disable")
        lifecycle.restart()
        XCTAssertFalse(lifecycle.canDispatch, "restart must preserve a local disable")
    }

    func testCompanionServerProfileRejectsInsecureRemoteAndCredentialURLs() throws {
        XCTAssertThrowsError(try CompanionServerProfile(origin: URL(string: "http://server.example.test")!, displayName: "Remote"))
        XCTAssertThrowsError(try CompanionServerProfile(origin: URL(string: "https://user:secret@server.example.test/path")!, displayName: "Remote"))
        XCTAssertThrowsError(try CompanionServerProfile(origin: URL(string: "http://127.0.0.1:8765/?token=secret")!, displayName: "Local"))
        let local = try CompanionServerProfile(origin: URL(string: "http://127.0.0.1:8765/api")!, displayName: " Local ")
        XCTAssertEqual(local.origin.absoluteString, "http://127.0.0.1:8765")
        XCTAssertEqual(local.displayName, "Local")
        XCTAssertFalse(local.keychainNamespace.contains("/api"))
    }

    func testPairingSecretUsesBase64URLCharactersAndExpectedEntropyLength() throws {
        let secret = try LocalPairingSecret.generate()
        XCTAssertEqual(secret.utf8.count, 43)
        XCTAssertTrue(secret.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
    }

    func testCompanionTimestampsAcceptFractionalAndWholeSeconds() throws {
        let fractional = try XCTUnwrap(CompanionTimestamp.parse("2026-10-06T16:49:00.123Z"))
        let whole = try XCTUnwrap(CompanionTimestamp.parse("2026-10-06T16:49:00Z"))
        XCTAssertEqual(fractional.timeIntervalSince(whole), 0.123, accuracy: 0.001)
    }

    @MainActor
    func testFakeAdapterOnlyAttachesKnownExistingConversations() throws {
        let adapter = FakeAppAdapter()
        let attached = try adapter.attach(conversationId: "fake-conversation-context")
        XCTAssertEqual(attached.title, "Design review")
        XCTAssertThrowsError(try adapter.attach(conversationId: "not-a-real-conversation"))
        adapter.detach()
        XCTAssertNil(adapter.selectedConversation)
    }

    func testCredentialVaultRejectsAnEmptyAccountKey() {
        let vault = KeychainCredentialVault(service: "com.server-driven-chat.tests")
        XCTAssertThrowsError(try vault.read(for: "")) { error in
            XCTAssertEqual(error as? CredentialVaultError, .invalidKey)
        }
    }

    func testCredentialVaultStoresReplacesAndDeletesATemporaryKeychainItem() throws {
        let vault = KeychainCredentialVault(service: "com.server-driven-chat.tests.\(UUID().uuidString)")
        let key = "disposable-\(UUID().uuidString)"
        defer { try? vault.delete(for: key) }
        let first = Data(UUID().uuidString.utf8)
        let replacement = Data(UUID().uuidString.utf8)
        try vault.store(first, for: key)
        XCTAssertEqual(try vault.read(for: key), first)
        try vault.store(replacement, for: key)
        XCTAssertEqual(try vault.read(for: key), replacement)
        try vault.delete(for: key)
        XCTAssertNil(try vault.read(for: key))
    }
}
