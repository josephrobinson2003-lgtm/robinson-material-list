/** JPEG EXIF dates only. GPS directories in the file are ignored. */

export function readJpegCaptureTime(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    if (marker === 0xda || marker === 0xd9) return null;
    const size = (data[offset + 2] << 8) + data[offset + 3];
    if (size < 2 || offset + 2 + size > data.length) return null;
    if (marker === 0xe1) {
      const found = exifDate(data.subarray(offset + 4, offset + 2 + size));
      if (found) return found;
    }
    offset += 2 + size;
  }
  return null;
}

export function filenameDateFromCapture(raw) {
  const match = /^(\d{4}):(\d{2}):(\d{2}) /.exec(raw || "");
  if (!match) return null;
  return match[1] + "-" + match[2] + "-" + match[3];
}

function exifDate(payload) {
  const sig = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  if (payload.length < 16) return null;
  for (let i = 0; i < sig.length; i += 1) if (payload[i] !== sig[i]) return null;
  return tiffDate(payload.subarray(6));
}

function tiffDate(tiff) {
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return null;
  const read16 = (offset) => (little ? tiff[offset] + (tiff[offset + 1] << 8) : (tiff[offset] << 8) + tiff[offset + 1]);
  const read32 = (offset) => (little
    ? tiff[offset] + (tiff[offset + 1] << 8) + (tiff[offset + 2] << 16) + (tiff[offset + 3] * 0x1000000)
    : (tiff[offset] * 0x1000000) + (tiff[offset + 1] << 16) + (tiff[offset + 2] << 8) + tiff[offset + 3]);
  const ifd0 = read32(4);
  const root = readIfd(tiff, ifd0, read16, read32);
  const exifPointer = root.pointers[0x8769];
  const exif = exifPointer == null ? { text: {}, pointers: {} } : readIfd(tiff, exifPointer, read16, read32);
  return exif.text[0x9003] || root.text[0x0132] || null;
}

function readIfd(tiff, offset, read16, read32) {
  const text = {};
  const pointers = {};
  if (offset + 2 > tiff.length) return { text, pointers };
  const count = read16(offset);
  for (let i = 0; i < count; i += 1) {
    const entry = offset + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    const tag = read16(entry);
    const type = read16(entry + 2);
    const values = read32(entry + 4);
    if (tag === 0x8825) continue;
    if (tag === 0x8769) {
      pointers[tag] = read32(entry + 8);
      continue;
    }
    if ((tag === 0x9003 || tag === 0x0132) && type === 2) {
      const start = values > 4 ? read32(entry + 8) : entry + 8;
      text[tag] = ascii(tiff, start, values);
    }
  }
  return { text, pointers };
}

function ascii(tiff, start, length) {
  let out = "";
  const end = Math.min(tiff.length, start + length);
  for (let i = start; i < end; i += 1) {
    if (tiff[i] === 0) break;
    out += String.fromCharCode(tiff[i]);
  }
  return out || null;
}
