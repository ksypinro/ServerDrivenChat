// Build a separate M30 disposable candidate; never overwrite the adopted M21/M27 artifacts.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const previous=JSON.parse(await readFile(join(root,'../../evidence/M21/artifact-manifest.json'),'utf8'));
const preserved=join(root,'dist/cline-4.1.22-sdc-m21.3');
for(const [file,expected] of [['extension.js',previous.patchedBundleSha256],['sdc-native.cjs',previous.nativeAddonSha256]]){
 if(hash(await readFile(join(preserved,'dist',file)))!==expected)throw Error('Frozen native package differs from M21 evidence');
}
const clineDirectory=join(root,'dist/cline-4.1.22-sdc-m30.1');
await rm(clineDirectory,{recursive:true,force:true});await cp(preserved,clineDirectory,{recursive:true});
const addon=await readFile(join(root,'dist/sdc-native.cjs'));
await writeFile(join(clineDirectory,'dist/sdc-native.cjs'),addon);
const cline=JSON.parse(await readFile(join(clineDirectory,'package.json'),'utf8'));
cline.version='4.1.2204';cline.displayName='Cline (SDC M30 disposable tool-fence candidate)';
cline.sdcPatch={...cline.sdcPatch,revision:4,nativeAddonSha256:hash(addon),candidateMilestone:'M30',acceptance:'pending fresh native adoption'};
await writeFile(join(clineDirectory,'package.json'),JSON.stringify(cline,null,2)+'\n');
const companionDirectory=join(root,'dist/sdc-cline-bridge-m30');
await rm(companionDirectory,{recursive:true,force:true});await mkdir(join(companionDirectory,'dist'),{recursive:true});
const companion=JSON.parse(await readFile(join(root,'package.json'),'utf8'));companion.name='sdc-cline-bridge';
if(companion.version!=='0.7.0')throw Error('M30 package version mismatch');
for(const key of ['dependencies','devDependencies','scripts','exports','type','private'])delete companion[key];
await writeFile(join(companionDirectory,'package.json'),JSON.stringify(companion,null,2)+'\n');
await cp(join(root,'dist/extension.cjs'),join(companionDirectory,'dist/extension.cjs'));
await writeFile(join(companionDirectory,'README.md'),'# M30 disposable acceptance candidate\n\nExact Cline API 1.3 tool-denial proposal path. Requires fresh graphical local consent and real native acceptance; this package is not adopted for release. Unsigned local test artifact; production packaging is M24.\n');
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

const packages=[];
for(const [directory,name] of [[clineDirectory,'cline-4.1.22-sdc-m30.1.vsix'],[companionDirectory,'sdc-cline-bridge-0.7.0.vsix']]){
 const path=join(root,'dist',name);const result=spawnSync('python3',['-c',zipScript,directory,path],{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr);packages.push({path,sha256:hash(await readFile(path))});
}
const record={milestone:'M30',status:'candidate-needs-native-acceptance',baseVersion:'4.1.22',patchedVersion:cline.version,apiVersion:'1.3',companionVersion:companion.version,
 originalBundleSha256:previous.originalBundleSha256,patchedBundleSha256:previous.patchedBundleSha256,nativeAddonSha256:hash(addon),
 companionBundleSha256:hash(await readFile(join(companionDirectory,'dist/extension.cjs'))),packages,
 nativeSource: 'adapters/cline/src/native-patch.ts and native-controls.ts',
 historicalNativePackagePreserved:'evidence/M21/artifact-manifest.json',signing:'Unsigned disposable candidate; M24 owns distribution'};
await mkdir(join(root,'../../evidence/M30'),{recursive:true});
await writeFile(join(root,'../../evidence/M30/artifact-manifest.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record,null,2));
