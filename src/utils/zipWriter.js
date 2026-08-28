// ================== ZIP Writer (no external library) ==================
// Creates .zip files in store mode (no compression), spec-compliant

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++)
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time =
    ((d.getHours() & 31) << 11) |
    ((d.getMinutes() & 63) << 5) |
    (Math.floor(d.getSeconds() / 2) & 31);
  const date =
    (((d.getFullYear() - 1980) & 127) << 9) |
    (((d.getMonth() + 1) & 15) << 5) |
    (d.getDate() & 31);
  return { time, date };
}

// files = [{ name: "xxx.txt", text: "..." }] → Blob (ZIP)
export function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = enc.encode("\uFEFF" + f.text);
    const crc = crc32(dataBytes);

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 flag for Thai filenames
    lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, dataBytes.length, true);
    lh.setUint32(22, dataBytes.length, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    chunks.push(lh.buffer, nameBytes, dataBytes);

    central.push({ nameBytes, crc, size: dataBytes.length, offset });
    offset += 30 + nameBytes.length + dataBytes.length;
  }

  const cdStart = offset;
  for (const e of central) {
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, e.crc, true);
    cd.setUint32(20, e.size, true);
    cd.setUint32(24, e.size, true);
    cd.setUint16(28, e.nameBytes.length, true);
    cd.setUint32(42, e.offset, true);
    chunks.push(cd.buffer, e.nameBytes);
    offset += 46 + e.nameBytes.length;
  }

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, central.length, true);
  eocd.setUint16(10, central.length, true);
  eocd.setUint32(12, offset - cdStart, true);
  eocd.setUint32(16, cdStart, true);
  chunks.push(eocd.buffer);

  return new Blob(chunks, { type: "application/zip" });
}
