// Package only the new companion; preserve and fingerprint the adopted M21 native package.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const previous=JSON.parse(await readFile(join(root,'../../evidence/M21/artifact-manifest.json'),'utf8'));
const clineDirectory=join(root,'dist/cline-4.1.22-sdc-m21.3');
for(const [file,expected] of [['extension.js',previous.patchedBundleSha256],['sdc-native.cjs',previous.nativeAddonSha256]]){
 if(hash(await readFile(join(clineDirectory,'dist',file)))!==expected)throw Error('Frozen native package differs from M21 evidence');
}
const companionDirectory=join(root,'dist/sdc-cline-bridge-m27');
await rm(companionDirectory,{recursive:true,force:true});await mkdir(join(companionDirectory,'dist'),{recursive:true});
const companion=JSON.parse(await readFile(join(root,'package.json'),'utf8'));companion.name='sdc-cline-bridge';
if(companion.version!=='0.6.0')throw Error('M27 package version mismatch');
for(const key of ['dependencies','devDependencies','scripts','exports','type','private'])delete companion[key];
await writeFile(join(companionDirectory,'package.json'),JSON.stringify(companion,null,2)+'\n');
await cp(join(root,'dist/extension.cjs'),join(companionDirectory,'dist/extension.cjs'));
await writeFile(join(companionDirectory,'README.md'),'# M27 development acceptance build\n\nAdopted Cline API 1.2 with command-specific public authority fences and opaque native output categories. Provider semantics remain blocked; not a provider-compatible native expansion. Unsigned local test artifact; production packaging is M24.\n');
const zipScript = `
import pathlib,sys,zipfile,xml.sax.saxutils,json
source=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]); manifest=json.loads((source/'package.json').read_text())
escape=xml.sax.saxutils.escape
name=escape(manifest['name']); publisher=escape(manifest['publisher']); version=escape(manifest['version']); title=escape(manifest['displayName'])
xml=f'''<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="{name}" Version="{version}" Publisher="{publisher}" TargetPlatform="darwin-arm64"/><DisplayName>{title}</DisplayName><Description xml:space="preserve">M27 development build for explicit existing Cline task binding</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.101.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="{','.join(manifest.get('extensionDependencies',[]))}"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>'''
types='<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="xml" ContentType="text/xml"/></Types>'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('extension.vsixmanifest',xml); archive.writestr('[Content_Types].xml',types)
    for file in source.rglob('*'):
        if file.is_file() and file.name!='.DS_Store': archive.write(file, 'extension/'+file.relative_to(source).as_posix())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read('extension/package.json'))['version']==manifest['version']
`;

const path=join(root,'dist/sdc-cline-bridge-0.6.0.vsix');
const result=spawnSync('python3',['-c',zipScript,companionDirectory,path],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);
const record={...previous,companionVersion:companion.version,companionBundleSha256:hash(await readFile(join(companionDirectory,'dist/extension.cjs'))),packages:[previous.packages[0],{path,sha256:hash(await readFile(path))}],nativePackageReusedFrom:'evidence/M21/artifact-manifest.json',milestone:'M27'};
await mkdir(join(root,'../../evidence/M27'),{recursive:true});
await writeFile(join(root,'../../evidence/M27/artifact-manifest.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record,null,2));
