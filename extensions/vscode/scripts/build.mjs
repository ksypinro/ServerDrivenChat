import { rolldown } from "rolldown";
const root = new URL("../", import.meta.url);
for (const [input, file] of [["src/index.ts", "dist/extension.cjs"], ["src/native-entry.ts", "dist/sdc-native.cjs"], ["src/connect.ts", "dist/connect.mjs"], ["src/pin.ts", "dist/pin.mjs"], ["src/credentials.ts", "dist/credentials.mjs"], ["src/connect-ui.ts", "dist/connect-ui.mjs"]]) {
    const bundle = await rolldown({ input: new URL(input, root).pathname, external: ["vscode", /^node:/] });
    await bundle.write({ file: new URL(file, root).pathname, format: file.endsWith(".mjs") ? "esm" : "cjs", sourcemap: true });
    await bundle.close();
}
