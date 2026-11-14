import { rolldown } from 'rolldown';
const root = new URL('../', import.meta.url);
for (const [input, output] of [['src/index.ts', 'dist/extension.cjs'], ['src/connect.ts', 'dist/connect.mjs'], ['src/connect-ui.ts', 'dist/connect-ui.mjs']]) {
    const bundle = await rolldown({ input: new URL(input, root).pathname, external: ['vscode', /^node:/] });
    await bundle.write({ file: new URL(output, root).pathname, format: output.endsWith('.mjs') ? 'esm' : 'cjs', sourcemap: true });
    await bundle.close();
}
