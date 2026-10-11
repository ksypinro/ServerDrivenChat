import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { protocolModule } from "../protocol/dist/index.js";
import { bridgeModule, bridgeProtocolDependency } from "../bridge/dist/index.js";
import { adapterCoreModule, adapterProtocolDependency } from "../adapters/core/dist/index.js";
import { fakeAdapterIsSimulation, fakeAdapterModule } from "../adapters/fake/dist/index.js";
import { serverModule, serverProtocolDependency } from "../server/dist/index.js";

test("workspace modules build and preserve neutral dependency direction", () => {
  assert.equal(protocolModule, "protocol");
  assert.equal(bridgeModule, "bridge");
  assert.equal(adapterCoreModule, "adapter-core");
  assert.equal(fakeAdapterModule, "adapter-fake");
  assert.equal(fakeAdapterIsSimulation, true);
  assert.equal(serverModule, "server");
  assert.equal(bridgeProtocolDependency, protocolModule);
  assert.equal(adapterProtocolDependency, protocolModule);
  assert.equal(serverProtocolDependency, protocolModule);
});

test("shared TypeScript workspaces have no app-vendor or UI dependencies", async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (const file of ["protocol/package.json", "server/package.json", "bridge/package.json", "adapters/core/package.json", "adapters/fake/package.json"]) {
    const manifest = JSON.parse(await readFile(resolve(root, file), "utf8"));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      const allowed = dependency.startsWith("@server-driven-chat/") || (["protocol/package.json", "server/package.json"].includes(file) && dependency === "ajv") || (file === "server/package.json" && dependency === "pg");
      assert.equal(allowed, true, `${file} may depend only on neutral workspaces, the neutral JSON schema validator, and the server PostgreSQL driver (${dependency})`);
      assert.doesNotMatch(dependency, /codex|cline|vscode|antigravity|react|swiftui/i);
    }
  }
});
