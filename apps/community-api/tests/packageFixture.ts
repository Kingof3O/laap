import { crc32 } from "node:zlib";
import { hashBytes, type PackageManifest } from "../src/packageValidation.ts";
export function packageFixture(
  entries = [
    {
      name: "assets/nested/original.txt",
      bytes: Buffer.from("Original CC0 artwork metadata"),
    },
  ],
) {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    const n = Buffer.from(name);
    const crc = crc32(bytes);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(bytes.length, 18);
    h.writeUInt32LE(bytes.length, 22);
    h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(bytes.length, 20);
    c.writeUInt32LE(bytes.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    locals.push(h, n, bytes);
    central.push(c, n);
    offset += h.length + n.length + bytes.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(Buffer.concat(central).length, 12);
  end.writeUInt32LE(offset, 16);
  const archive = Buffer.concat([...locals, ...central, end]);
  const hash = hashBytes(archive);
  const manifest: PackageManifest = {
    schemaVersion: 1,
    modId: "original.fixture",
    version: "1.0.0",
    displayName: "Original fixture",
    author: "Fixture artist",
    license: "CC0-1.0",
    rightToDistribute: true,
    containsPaidRiotContent: false,
    sha256: hash,
    supportedGameBuilds: [],
    files: entries.map((e) => ({
      relativePath: e.name,
      sha256: hashBytes(e.bytes),
      sizeBytes: e.bytes.length,
    })),
  };
  return {
    archive,
    manifest,
    packageHash: hash,
    archiveBase64: archive.toString("base64"),
  };
}
