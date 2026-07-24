// Generates PWA PNG icons (accent square + white checkmark) with no dependencies,
// using zlib for PNG encoding. Run: `node scripts/gen-icons.mjs`.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

// --- CRC32 + PNG chunk helpers ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // rest zero (compression/filter/interlace)
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Drawing ---
const ACCENT = [79, 70, 229]; // #4f46e5
const WHITE = [255, 255, 255];

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function drawIcon(size, { fullBleed }) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = fullBleed ? 0 : size * 0.22;
  // Checkmark polyline (fraction of size). Kept central for maskable safe zone.
  const pts = [
    [0.3, 0.54],
    [0.44, 0.68],
    [0.72, 0.34],
  ].map(([fx, fy]) => [fx * size, fy * size]);
  const stroke = size * 0.09;

  const inRounded = (x, y) => {
    if (radius === 0) return true;
    const rx = Math.min(x, size - 1 - x);
    const ry = Math.min(y, size - 1 - y);
    if (rx >= radius || ry >= radius) return true;
    const dx = radius - rx;
    const dy = radius - ry;
    return dx * dx + dy * dy <= radius * radius;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRounded(x + 0.5, y + 0.5)) {
        rgba[i + 3] = 0; // transparent corner
        continue;
      }
      const d = Math.min(
        distToSeg(x, y, pts[0][0], pts[0][1], pts[1][0], pts[1][1]),
        distToSeg(x, y, pts[1][0], pts[1][1], pts[2][0], pts[2][1]),
      );
      const color = d <= stroke / 2 ? WHITE : ACCENT;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

const targets = [
  { name: "icon-192.png", size: 192, fullBleed: false },
  { name: "icon-512.png", size: 512, fullBleed: false },
  { name: "icon-maskable-512.png", size: 512, fullBleed: true },
  { name: "apple-touch-icon.png", size: 180, fullBleed: true },
];

for (const t of targets) {
  writeFileSync(join(OUT, t.name), drawIcon(t.size, t));
  console.log("wrote", t.name);
}
