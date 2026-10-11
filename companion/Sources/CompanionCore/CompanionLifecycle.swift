import Foundation

public enum CompanionHostState: String, Equatable, Sendable {
    case starting
    case running
    case sleeping
    case shuttingDown
}

public enum CompanionConnectionState: String, Equatable, Sendable {
    case disconnected
    case connected
    case disabled
    case stale
}

public enum CompanionTurnState: String, Equatable, Sendable {
    case idle
    case running
    case completed
}

/// State gate that keeps local disable and host sleep effective independently of remote commands.
public struct CompanionLifecycle: Equatable, Sendable {
    public private(set) var hostState: CompanionHostState = .starting
    public private(set) var connectionState: CompanionConnectionState = .disconnected
    public private(set) var turnState: CompanionTurnState = .idle
    public private(set) var remoteDispatchEnabled = true

    public init() {}

    public var canDispatch: Bool {
        hostState == .running && connectionState == .connected && remoteDispatchEnabled
    }

    public mutating func start() {
        hostState = .running
        if connectionState == .stale { connectionState = .disconnected }
    }

    public mutating func connect() {
        guard hostState == .running, remoteDispatchEnabled else { return }
        connectionState = .connected
    }

    public mutating func disconnect() {
        connectionState = remoteDispatchEnabled ? .disconnected : .disabled
        turnState = .idle
    }

    /// Stops local dispatch synchronously before any network request or lease change.
    public mutating func disableImmediately() {
        remoteDispatchEnabled = false
        connectionState = .disabled
    }

    public mutating func enableRemoteDispatch() {
        remoteDispatchEnabled = true
        connectionState = .disconnected
    }

    public mutating func restart() {
        hostState = .starting
        connectionState = remoteDispatchEnabled ? .disconnected : .disabled
        turnState = .idle
        hostState = .running
    }

    public mutating func beginFakeTurn() {
        guard canDispatch else { return }
        turnState = .running
    }

    public mutating func fakeTurnCompleted() {
        guard turnState == .running else { return }
        turnState = .completed
        // A completed LLM turn does not stop the graphical companion or its listener.
    }

    public mutating func hostWillSleep() {
        hostState = .sleeping
        connectionState = .stale
    }

    public mutating func hostDidWake() {
        hostState = .running
        connectionState = .stale
        turnState = .idle
    }

    public mutating func markLeaseRenewed() {
        guard hostState == .running, remoteDispatchEnabled else { return }
        connectionState = .connected
    }

    public mutating func shutDown() {
        hostState = .shuttingDown
        connectionState = .disconnected
        turnState = .idle
    }
}

public struct FakeConversation: Identifiable, Equatable, Sendable {
    public let id: String
    public let title: String
    public let detail: String
}

public struct FakeCapability: Identifiable, Equatable, Sendable {
    public var id: String { operation }
    public let operation: String
    public let status: String
    public let explanation: String
}

/// Deterministic companion-preview adapter. It reports simulated capabilities and never runs a model.
@MainActor
public final class FakeAppAdapter {
    public static let appName = "Fake Chat"
    public static let conversations = [
        FakeConversation(id: "fake-conversation-context", title: "Design review", detail: "Existing simulated conversation"),
        FakeConversation(id: "fake-conversation-scratch", title: "Scratchpad", detail: "Existing simulated conversation")
    ]
    public static let capabilities = [
        FakeCapability(operation: "inspect", status: "supported", explanation: "Deterministic local fixture"),
        FakeCapability(operation: "submit", status: "supported", explanation: "Simulation only; no LLM is started"),
        FakeCapability(operation: "subscribe", status: "supported", explanation: "Fixture events are local"),
        FakeCapability(operation: "respondInput", status: "supported", explanation: "Simulation only"),
        FakeCapability(operation: "resolveApproval", status: "supported", explanation: "Simulation only"),
        FakeCapability(operation: "cancel", status: "unsupported", explanation: "Native turn cancellation is not implemented"),
        FakeCapability(operation: "revoke", status: "unsupported", explanation: "Fake grants have no native permission effect")
    ]

    public private(set) var selectedConversation: FakeConversation?

    public init() {}

    public func attach(conversationId: String) throws -> FakeConversation {
        guard let conversation = Self.conversations.first(where: { $0.id == conversationId }) else {
            throw FakeAdapterError.conversationUnavailable
        }
        selectedConversation = conversation
        return conversation
    }

    public func detach() { selectedConversation = nil }
}

public enum FakeAdapterError: Error, Equatable { case conversationUnavailable }
