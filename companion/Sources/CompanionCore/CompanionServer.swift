import Foundation
import Security

public enum CompanionServerError: Error, Equatable, LocalizedError {
    case invalidServerURL
    case invalidResponse
    case httpStatus(Int, String)
    case signInStateMismatch

    public var errorDescription: String? {
        switch self {
        case .invalidServerURL: return "Use an HTTPS server URL, or localhost for development."
        case .invalidResponse: return "The server returned an invalid response."
        case .httpStatus(let status, let message): return "Server request failed (\(status)): \(message)"
        case .signInStateMismatch: return "The sign-in response did not match this request. Start again."
        }
    }
}

public enum CompanionTimestamp {
    /// Accepts standard RFC 3339 timestamps with or without fractional seconds.
    public static func parse(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        let wholeSeconds = ISO8601DateFormatter()
        wholeSeconds.formatOptions = [.withInternetDateTime]
        return wholeSeconds.date(from: value)
    }
}

/// A server profile stores a validated origin, never a credential-bearing URL.
public struct CompanionServerProfile: Codable, Equatable, Sendable {
    public let origin: URL
    public let displayName: String

    public init(origin: URL, displayName: String) throws {
        guard let scheme = origin.scheme?.lowercased(),
              let host = origin.host?.lowercased(),
              origin.user == nil, origin.password == nil, origin.query == nil, origin.fragment == nil,
              (scheme == "https" || (scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host))),
              !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw CompanionServerError.invalidServerURL
        }
        var normalized = origin
        normalized = URL(string: "\(scheme)://\(origin.host ?? "")\(origin.port.map { ":\($0)" } ?? "")")!
        self.origin = normalized
        self.displayName = String(displayName.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120))
    }

    /// Stable Keychain namespace that contains no server path or secret material.
    public var keychainNamespace: String {
        let port = origin.port.map(String.init) ?? "default"
        let host = origin.host ?? "invalid"
        let sanitized = host.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? String($0) : "-" }.joined()
        return "profile.\(sanitized).\(port)"
    }
}

public struct OidcAuthorizationStart: Decodable, Sendable {
    public let authorizationUrl: URL
    public let state: String
    public let expiresAt: String
}

public struct CompanionUserTokens: Codable, Equatable, Sendable {
    public let accessToken: String
    public let refreshToken: String?
    public let expiresAt: String
    public let userId: String
    public let email: String

    public init(accessToken: String, refreshToken: String?, expiresAt: String, userId: String, email: String) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.userId = userId
        self.email = email
    }
}

public struct CompanionPairing: Codable, Equatable, Sendable {
    public let pairingId: String
    public let deviceId: String
    public let pairingCode: String
    public let expiresAt: String
}

public struct CompanionDeviceCredential: Codable, Equatable, Sendable {
    public let deviceId: String
    public let credential: String
    public let expiresAt: String
}

/// Networking used by the graphical companion; bearer tokens are headers and never URL parameters.
public protocol CompanionServerClient: Sendable {
    func startSignIn(redirectUri: String) async throws -> OidcAuthorizationStart
    func exchangeSignIn(code: String, state: String) async throws -> CompanionUserTokens
    func refreshSignIn(userId: String, refreshToken: String) async throws -> CompanionUserTokens
    func startPairing(accessToken: String, label: String, localSecret: String) async throws -> CompanionPairing
    func confirmPairingOnServer(accessToken: String, pairingId: String, code: String) async throws
    func confirmPairingLocally(pairingId: String, localSecret: String) async throws -> CompanionDeviceCredential
}

/// Thin typed client for M08 identity and pairing routes.
public struct URLSessionCompanionServerClient: CompanionServerClient {
    private let profile: CompanionServerProfile
    private let session: URLSession

    public init(profile: CompanionServerProfile, session: URLSession = .shared) {
        self.profile = profile
        self.session = session
    }

    public func startSignIn(redirectUri: String) async throws -> OidcAuthorizationStart {
        try await post("/v2/auth/oidc/start", body: ["redirectUri": redirectUri], as: OidcAuthorizationStart.self)
    }

    public func exchangeSignIn(code: String, state: String) async throws -> CompanionUserTokens {
        try await post("/v2/auth/oidc/exchange", body: ["code": code, "state": state], as: CompanionUserTokens.self)
    }

    public func refreshSignIn(userId: String, refreshToken: String) async throws -> CompanionUserTokens {
        try await post("/v2/auth/oidc/refresh", body: ["userId": userId, "refreshToken": refreshToken], as: CompanionUserTokens.self)
    }

    public func startPairing(accessToken: String, label: String, localSecret: String) async throws -> CompanionPairing {
        try await post("/v2/pairings", body: ["label": label, "localConfirmationSecret": localSecret], bearer: accessToken, as: CompanionPairing.self)
    }

    public func confirmPairingOnServer(accessToken: String, pairingId: String, code: String) async throws {
        let _: PairingConfirmation = try await post("/v2/pairings/\(pairingId)/confirm", body: ["pairingCode": code], bearer: accessToken, as: PairingConfirmation.self)
    }

    public func confirmPairingLocally(pairingId: String, localSecret: String) async throws -> CompanionDeviceCredential {
        try await post("/v2/pairings/\(pairingId)/local-confirm", body: LocalPairingConfirmation(localConfirmationSecret: localSecret, explicitConsent: true), as: CompanionDeviceCredential.self)
    }

    private func post<Body: Encodable, Response: Decodable>(_ path: String, body: Body, bearer: String? = nil, as responseType: Response.Type) async throws -> Response {
        let parts = path.split(separator: "/").map(String.init)
        let url = parts.reduce(profile.origin) { $0.appendingPathComponent($1) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw CompanionServerError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            let body = (try? JSONDecoder().decode(ApiErrorBody.self, from: data))
            throw CompanionServerError.httpStatus(response.statusCode, body?.error.message ?? "Request rejected")
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}

private struct PairingConfirmation: Decodable { let pairingId: String; let expiresAt: String }
private struct LocalPairingConfirmation: Encodable { let localConfirmationSecret: String; let explicitConsent: Bool }
private struct ApiErrorBody: Decodable { struct Detail: Decodable { let message: String }; let error: Detail }

/// Generates a cryptographically random secret that stays in local Keychain storage during pairing.
public enum LocalPairingSecret {
    public static func generate() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else { throw CredentialVaultError.keychainStatus(status) }
        return Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
