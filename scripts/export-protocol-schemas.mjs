import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commandSkipSchema, dispatchPermitSchema, connectResultSchema, connectToolSchema, protocolSchema, trustedConnectContextSchema } from "../protocol/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemas = [
  ["protocol/schemas/v2.0/command-skip.schema.json", commandSkipSchema],
  ["protocol/schemas/v2.0/dispatch-permit.schema.json", dispatchPermitSchema],
  ["protocol/schemas/v2.0/messages.schema.json", protocolSchema],
  ["protocol/schemas/v2.0/connect-tools.schema.json", connectToolSchema],
  ["protocol/schemas/v2.0/connect-context.schema.json", trustedConnectContextSchema],
  ["protocol/schemas/v2.0/connect-result.schema.json", connectResultSchema]
];
for (const [relativePath, schema] of schemas) {
  const path = resolve(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(schema, null, 2)}\n`);
}
