import { rolldown } from 'rolldown';
const root = new URL('../', import.meta.url);
const bundle = await rolldown({ input: new URL('src/index.ts', root).pathname, external: ['vscode', /^node:/] });
await bundle.write({ file: new URL('dist/extension.cjs', root).pathname, format: 'cjs', sourcemap: true });
await bundle.close();
