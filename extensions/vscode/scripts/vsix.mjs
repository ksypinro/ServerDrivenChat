// Minimal ZIP reader/writer for VSIX packages (no ZIP64, deflate or stored entries).
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

/** Read entries from a ZIP buffer, verifying sizes and CRC-32. `wanted` limits extraction to those names. */
export function readZipEntries(buffer, wanted) {
    let end = -1;
    for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index--) if (buffer.readUInt32LE(index) === 0x06054b50) { end = index; break; }
    if (end < 0) throw new Error("Not a ZIP archive");
    const count = buffer.readUInt16LE(end + 10);
    let offset = buffer.readUInt32LE(end + 16);
    const names = [], entries = new Map();
    for (let entry = 0; entry < count; entry++) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Corrupt ZIP central directory");
        const method = buffer.readUInt16LE(offset + 10), crc = buffer.readUInt32LE(offset + 16);
        const compressedSize = buffer.readUInt32LE(offset + 20), size = buffer.readUInt32LE(offset + 24);
        const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32);
        const local = buffer.readUInt32LE(offset + 42), name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
        names.push(name);
        if (!name.endsWith("/") && (!wanted || wanted.includes(name))) {
            if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`Corrupt local header for ${name}`);
            const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
            const compressed = buffer.subarray(start, start + compressedSize);
            const bytes = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : undefined;
            if (!bytes) throw new Error(`Unsupported compression ${method} for ${name}`);
            if (bytes.length !== size || crc32(bytes) !== crc) throw new Error(`Integrity check failed for ${name}`);
            entries.set(name, bytes);
        }
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return { names, entries };
}

/** Deterministic deflated ZIP: entries in the given order, fixed 1980-01-01 timestamps. */
export function writeZip(entries) {
    const locals = [], centrals = [];
    let offset = 0;
    for (const [name, data] of entries) {
        const bytes = Buffer.from(data), packed = deflateRawSync(bytes, { level: 9 }), nameBytes = Buffer.from(name, "utf8"), crc = crc32(bytes);
        if (bytes.length >= 0xffffffff || offset >= 0xffffffff) throw new Error("ZIP64 is not supported");
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
        local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);
        local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(nameBytes.length, 26);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
        central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14);
        central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(bytes.length, 24);
        central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
        locals.push(local, nameBytes, packed); centrals.push(central, nameBytes);
        offset += local.length + nameBytes.length + packed.length;
    }
    if (entries.length > 0xffff) throw new Error("Too many ZIP entries");
    const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, directory, end]);
}
