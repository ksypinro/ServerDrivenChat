export let uriHandler;
export let open = async()=>true;
export function setOpen(callback){open=callback;}
export const env={uriScheme:'vscode',asExternalUri:async()=>{throw Error('desktop OIDC callback must not be rewritten');},openExternal:uri=>open(uri)};
export const Uri={parse:value=>({toString:()=>value}),joinPath:()=>({fsPath:'/unused'})};
export const workspace={fs:{createDirectory:async()=>{}}};
export const window={registerUriHandler:handler=>{uriHandler=handler;return {dispose(){}};},showInformationMessage:async()=>{throw Error('No test should reach local consent');}};
