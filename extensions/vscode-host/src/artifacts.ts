import { createHash } from "node:crypto";
import { constants } from "node:fs";
import * as nodeFs from "node:fs";
import { createRequire } from "node:module";

// Electron's patched fs treats ASARs as virtual directories and synthesizes stat
// identities. Integrity measurement must use the physical archive bytes instead.
// original-fs is Electron's built-in module, not a workspace dependency.
const physicalFs = process.versions.electron
    ? createRequire("file:///sdc-artifact-verifier.cjs")("original-fs") as typeof nodeFs
    : nodeFs;
const { lstat, open, readdir, readlink, realpath } = physicalFs.promises;
import { isAbsolute, join, resolve, sep } from "node:path";

export interface InstalledTreeMeasurement {
    format: "sdc-installed-tree-v1" | "sdc-bundle-tree-v1";
    sha256: string;
    files: number;
    bytes: number;
}

/** Complete installed tree, including editor metadata. No ignored executable paths. */
export async function measureInstalledTree(directory: string, internalSymlinks = false): Promise<InstalledTreeMeasurement> {
    if (!isAbsolute(directory)) throw new Error("Artifact root must be absolute");
    const root = resolve(directory);
    if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error("Artifact root must be a real directory without symlink ancestors");
    const format = internalSymlinks ? "sdc-bundle-tree-v1" : "sdc-installed-tree-v1";
    const hash = createHash("sha256").update(format + "\n");
    let files = 0, bytes = 0, entries = 0;
    const walk = async (relative: string, depth: number): Promise<void> => {
        if (depth > 64) throw new Error("Artifact directory depth exceeds limit");
        const path = relative ? join(root, relative) : root;
        const before = await lstat(path, { bigint: true });
        if (!before.isDirectory() || await realpath(path) !== path) throw new Error("Artifact directory changed or contains a symlink");
        const names = (await readdir(path)).sort();
        entries += names.length;
        if (entries > 100_000) throw new Error("Artifact entry limit exceeded");
        hash.update(JSON.stringify(["directory", relative, names]) + "\n");
        for (const name of names) {
            const child = relative ? `${relative}/${name}` : name;
            const target = join(root, child);
            const stat = await lstat(target, { bigint: true });
            if (stat.isSymbolicLink()) {
                if (!internalSymlinks) throw new Error("Artifact symlinks are unsupported");
                const link = await readlink(target), destination = await realpath(target);
                if (isAbsolute(link) || !destination.startsWith(root + sep)) throw new Error("Bundle symlink escapes artifact root");
                const after = await lstat(target, { bigint: true });
                if (stat.ino !== after.ino || stat.ctimeNs !== after.ctimeNs || link !== await readlink(target)) throw new Error("Bundle symlink changed during measurement");
                // Target bytes are visited at their real location within this same tree.
                hash.update(JSON.stringify(["symlink", child, link]) + "\n");
                continue;
            }
            if (stat.isDirectory()) { await walk(child, depth + 1); continue; }
            if (!stat.isFile()) throw new Error("Artifact contains a special file");
            if (++files > 100_000 || stat.size > 1_073_741_824n) throw new Error("Artifact file limit exceeded");
            bytes += Number(stat.size);
            if (bytes > 8_589_934_592) throw new Error("Artifact total size limit exceeded");
            const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
                const initial = await handle.stat({ bigint: true });
                if (initial.dev !== stat.dev || initial.ino !== stat.ino || initial.size !== stat.size || initial.mtimeNs !== stat.mtimeNs || initial.ctimeNs !== stat.ctimeNs || !initial.isFile()) throw new Error("Artifact changed before reading");
                const content = createHash("sha256");
                const buffer = Buffer.alloc(256 * 1024);
                let count = 0;
                for (;;) {
                    const read = await handle.read(buffer, 0, buffer.length, null);
                    if (!read.bytesRead) break;
                    count += read.bytesRead;
                    if (count > Number(stat.size)) throw new Error("Artifact grew while reading");
                    content.update(buffer.subarray(0, read.bytesRead));
                }
                const after = await handle.stat({ bigint: true });
                const current = await lstat(target, { bigint: true });
                if (count !== Number(stat.size) || initial.size !== after.size || initial.mtimeNs !== after.mtimeNs || initial.ctimeNs !== after.ctimeNs || current.ino !== initial.ino || current.dev !== initial.dev || current.mtimeNs !== after.mtimeNs || current.ctimeNs !== after.ctimeNs || current.isSymbolicLink()) throw new Error("Artifact changed while reading");
                hash.update(JSON.stringify(["file", child, Number(stat.mode & 0o111n), count, content.digest("hex")]) + "\n");
            } finally { await handle.close(); }
        }
        const after = await lstat(path, { bigint: true });
        if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("Artifact directory changed during measurement");
    };
    await walk("", 0);
    return { format, sha256: hash.digest("hex"), files, bytes };
}
