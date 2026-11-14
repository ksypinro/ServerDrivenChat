// One simulated VS Code window in its own process: a bridge runtime with a per-binding inbox and a fake adapter.
import { BridgeRuntime, BridgeStore } from '../../bridge/dist/index.js';
import { FakeAppAdapter } from '../../adapters/fake/dist/index.js';

const config = JSON.parse(process.argv[2]);
const adapter = new FakeAppAdapter({ sessionId: config.sessionId, appInstanceId: config.appInstanceId, bridgeEpoch: `epoch-${config.sessionId}`, now: () => new Date().toISOString() });
const binding = (await adapter.attach({ appId: 'fake.app', appInstanceId: config.appInstanceId, conversationId: 'fake-conversation' })).value;
const store = new BridgeStore({ path: config.storePath, sessionId: config.sessionId });
store.initializeCursors(config.deviceId, config.watermarks);
const runtime = new BridgeRuntime({ serverUrl: config.serverUrl, deviceId: config.deviceId, credential: config.credential, binding, adapter, store, reconnectBaseMs: 10, reconnectCapMs: 100 });
await runtime.start();
process.stdout.write(`${JSON.stringify({ state: runtime.state })}\n`);
process.once('SIGTERM', () => {
    void runtime.stop().then(() => {
        const summary = { state: runtime.state, prompt: store.getCursor(config.deviceId, 'prompt'), control: store.getCursor(config.deviceId, 'control') };
        store.close();
        process.stdout.write(`${JSON.stringify(summary)}\n`);
        process.exit(0);
    });
});
