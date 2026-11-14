import { ADAPTER_OPERATIONS } from '../../protocol/dist/index.js';

export function backendFixture() {
    const descriptor = { contractVersion: '1.0', backendId: 'example', driverId: 'example.driver', driverVersion: '1.0.0', appId: 'example.app', displayName: 'Simulated example', hostKind: 'vscode-local', extensionIds: ['example.native'] };
    const inventory = { platform: 'darwin-arm64', nativeApiVersion: '1.0', artifacts: ['host', 'driver', 'native'].map((role, index) => ({ role, id: `example.${role}`, version: '1.0.0', sha256: String(index).repeat(64) })) };
    const operations = Object.fromEntries(ADAPTER_OPERATIONS.map(name => [name, { status: 'supported', reason: 'SIMULATED fixture', evidenceRef: `fixture:${name}` }]));
    const report = { protocolVersion: '2.0', adapterId: descriptor.driverId, adapterVersion: descriptor.driverVersion, appId: descriptor.appId, appVersion: '1.0.0', platform: 'vscode-local', observedAt: '2026-10-11T00:00:00Z', operations, effectPolicies: { nativeToolsDenied: operations.probe } };
    const qualification = { qualificationId: 'simulation-only', descriptor, inventory, appVersion: report.appVersion, evidenceRef: 'fixture:backend', evidenceLevel: 'simulation', effectBoundary: 'queued-fenced', operations, nativeToolsDenied: operations.probe };
    return { descriptor: structuredClone(descriptor), inventory: structuredClone(inventory), report: structuredClone(report), qualification: structuredClone(qualification) };
}
