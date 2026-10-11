// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "ServerDrivenChatCompanionCore",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "CompanionCore", targets: ["CompanionCore"]),
        .executable(name: "ServerDrivenChatCompanion", targets: ["CompanionApp"])
    ],
    targets: [
        .target(name: "CompanionCore"),
        .executableTarget(name: "CompanionApp", dependencies: ["CompanionCore"]),
        .testTarget(name: "CompanionCoreTests", dependencies: ["CompanionCore"])
    ]
)
