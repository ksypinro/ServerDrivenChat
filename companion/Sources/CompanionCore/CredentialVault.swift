import Foundation
import Security

public protocol CredentialVault {
    func store(_ credential: Data, for key: String) throws
    func read(for key: String) throws -> Data?
    func delete(for key: String) throws
}

public enum CredentialVaultError: Error, Equatable {
    case invalidKey
    case keychainStatus(OSStatus)
}

/// Stores opaque device credentials in the macOS Keychain, restricted to this device.
public struct KeychainCredentialVault: CredentialVault {
    private let service: String

    public init(service: String = "com.server-driven-chat.companion.credentials") {
        self.service = service
    }

    public func store(_ credential: Data, for key: String) throws {
        try validate(key)
        let query = baseQuery(for: key).merging([
            kSecValueData as String: credential,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]) { _, new in new }
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess || status == errSecDuplicateItem else {
            throw CredentialVaultError.keychainStatus(status)
        }
        if status == errSecDuplicateItem {
            let updateStatus = SecItemUpdate(baseQuery(for: key) as CFDictionary,
                [kSecValueData as String: credential] as CFDictionary)
            guard updateStatus == errSecSuccess else { throw CredentialVaultError.keychainStatus(updateStatus) }
        }
    }

    public func read(for key: String) throws -> Data? {
        try validate(key)
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw CredentialVaultError.keychainStatus(status) }
        return data
    }

    public func delete(for key: String) throws {
        try validate(key)
        let status = SecItemDelete(baseQuery(for: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw CredentialVaultError.keychainStatus(status) }
    }

    private func validate(_ key: String) throws {
        guard !key.isEmpty, key.utf8.count <= 255 else { throw CredentialVaultError.invalidKey }
    }

    private func baseQuery(for key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccount as String: key]
    }
}
