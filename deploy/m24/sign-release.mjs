import { createPrivateKey, createPublicKey, createHash, sign, verify } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const [mode, keyPath] = process.argv.slice(2);
if (!['sign','verify'].includes(mode) || !keyPath) throw new Error('Usage: node deploy/m24/sign-release.mjs sign <private-key> | verify <trusted-public-key>');
const manifestPath = resolve('evidence/M24/artifact-manifest.json');
const signaturePath = resolve('evidence/M24/artifact-manifest.sig');
const publicPath = resolve('evidence/M24/release-public.pem');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (mode === 'sign') {
    const key = createPrivateKey(await readFile(keyPath));
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('Release key must be Ed25519');
    const publicKey = createPublicKey(key).export({ type:'spki', format:'pem' }).toString();
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const imageCatalog = JSON.parse(await readFile(resolve('evidence/M24/persistent-local/images.json'), 'utf8').catch(() => '[]'));
    manifest.deploymentImages = imageCatalog.map(({ Repository, Tag, ID, Platform }) => ({ repository: Repository, tag: Tag, id: ID, platform: Platform })).sort((a,b) => (a.repository+a.tag).localeCompare(b.repository+b.tag));
    manifest.signing = { scheme:'Ed25519 detached manifest', publicKeySha256:hash(publicKey), scope:'Project release integrity; VSIX is not Marketplace-signed', ownership:'ServerDrivenChat local operator' };
    await writeFile(manifestPath, JSON.stringify(manifest,null,2)+'\n');
    await writeFile(publicPath, publicKey);
    await writeFile(signaturePath, sign(null,await readFile(manifestPath),key).toString('base64')+'\n');
}
const bytes = await readFile(manifestPath);
if (!verify(null,bytes,createPublicKey(await readFile(keyPath === undefined ? publicPath : mode === 'sign' ? publicPath : keyPath)),Buffer.from((await readFile(signaturePath,'utf8')).trim(),'base64'))) throw new Error('Release signature invalid');
const manifest = JSON.parse(bytes);
const trustedPublicKey = createPublicKey(await readFile(mode === 'sign' ? publicPath : keyPath)).export({ type:'spki', format:'pem' }).toString();
if (hash(trustedPublicKey) !== manifest.signing.publicKeySha256) throw new Error('Signing identity fingerprint mismatch');
for (const artifact of manifest.artifacts) {
    if (artifact.file !== artifact.file.split('/').at(-1) || !/^[a-zA-Z0-9._-]+$/.test(artifact.file)) throw new Error('Invalid artifact filename');
    if (hash(await readFile(join(resolve('extensions/vscode/dist/m24-release-candidate'), artifact.file))) !== artifact.sha256) throw new Error('Artifact checksum mismatch');
}
console.log('Trusted signature and both artifact checksums verified.');
