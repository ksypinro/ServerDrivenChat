import { REQUIRED_LITERALS, REQUIRED_METHODS, REQUIRED_PROPERTIES } from '../../extensions/vscode/scripts/analyze-cline.mjs';

export const syntheticClineManifest = { publisher: 'saoudrizwan', name: 'claude-dev', version: '4.1.22', main: './dist/extension.js', engines: { vscode: '^1.101.0' } };

/** Minified-looking synthetic bundle exposing the surface the SDC add-on relies on. */
export function syntheticClineBundle({ factory = 'b4u', local = 'e', omit = [], bodies = {}, extraFactory = false, patched = false, optional = [] } = {}) {
    const methods = [...REQUIRED_METHODS, ...optional].filter(name => !omit.includes(name))
        .map(name => `${name}(${local}){${bodies[name] ?? `let q="{";return this.sessions&&${local}?q:/[{}]/g.test(\`\${{a:1}.a}\`)`}}`).join('');
    const properties = REQUIRED_PROPERTIES.map(name => `this.${name}`).join(',');
    const literals = REQUIRED_LITERALS.map(name => `"${name}"`).join(',');
    const head = patched ? 'serverDrivenChat:require("./sdc-native.cjs").createPinnedClineApi(t),' : '';
    const exportFactory = name => `function ${name}(t){return{${head}startNewTask:async(r,i)=>{await t.clearTask(),await t.initTask(r,i)},sendMessage:async(r)=>{t.task&&await t.task.handleWebviewAskResponse("messageResponse",r||"")}}}`;
    return `var Zq=1;class Ab{${methods}init(){return[${properties}],[${literals}]}}${exportFactory(factory)}${extraFactory ? exportFactory('x9z') : ''}async function Cd(a){return ${factory}(a.controller)}`;
}
