// Generate the 16/48/128 PNG icons for the extension.
// Pure Node — no npm dependencies. Uses the built-in zlib module.
// Run once before loading the extension:
//   node scripts/make-icons.mjs
//
// Produces a purple rounded square with a white "S" glyph.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, "..", "icons");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const BG = [124, 58, 237, 255];    // #7c3aed
const BG_DARK = [79, 70, 229, 255]; // gradient end
const FG = [255, 255, 255, 255];    // white S

const SIZES = [16, 48, 128];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

for (const size of SIZES) {
  const pixels = renderIcon(size);
  const png = encodePNG(size, size, pixels);
  const outPath = resolve(OUT_DIR, `${size}.png`);
  writeFileSync(outPath, png);
  console.log("wrote", outPath, png.length, "bytes");
}

// ---------- Renderer ----------

function renderIcon(size) {
  const data = new Uint8Array(size * size * 4);
  const radius = Math.max(2, Math.round(size * 0.18));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (!insideRounded(x, y, size, radius)) {
        data[idx + 3] = 0;
        continue;
      }
      // Gradient top-left → bottom-right
      const t = (x + y) / (size * 2);
      const col = lerp(BG, BG_DARK, t);
      data[idx] = col[0];
      data[idx + 1] = col[1];
      data[idx + 2] = col[2];
      data[idx + 3] = 255;
    }
  }

  drawLetterS(data, size);
  return data;
}

function insideRounded(x, y, size, r) {
  if (x >= r && x < size - r) return true;
  if (y >= r && y < size - r) return true;
  // corners
  const corners = [
    [r, r],
    [size - 1 - r, r],
    [r, size - 1 - r],
    [size - 1 - r, size - 1 - r],
  ];
  for (const [cx, cy] of corners) {
    const dx = x - cx, dy = y - cy;
    if (Math.hypot(dx, dy) <= r) return true;
  }
  return false;
}

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255,
  ];
}

// Draw a stylised "S" using three horizontal bars + two diagonals.
// Not pixel-perfect typography — just recognisable at 16/48/128 px.
function drawLetterS(data, size) {
  const pad = Math.round(size * 0.22);
  const w = size - pad * 2;
  const h = size - pad * 2;
  const thickness = Math.max(1, Math.round(size * 0.12));
  const x0 = pad;
  const y0 = pad;

  const midY = y0 + Math.round(h / 2) - Math.floor(thickness / 2);
  const topY = y0;
  const botY = y0 + h - thickness;

  // three horizontal bars
  fillRect(data, size, x0, topY, w, thickness, FG);
  fillRect(data, size, x0, midY, w, thickness, FG);
  fillRect(data, size, x0, botY, w, thickness, FG);
  // left vertical (top half) + right vertical (bottom half)
  fillRect(data, size, x0, topY, thickness, Math.round(h / 2), FG);
  fillRect(data, size, x0 + w - thickness, midY, thickness, Math.ceil(h / 2), FG);
}

function fillRect(data, size, x, y, w, h, col) {
  for (let j = y; j < y + h && j < size; j++) {
    if (j < 0) continue;
    for (let i = x; i < x + w && i < size; i++) {
      if (i < 0) continue;
      const idx = (j * size + i) * 4;
      data[idx] = col[0];
      data[idx + 1] = col[1];
      data[idx + 2] = col[2];
      data[idx + 3] = col[3];
    }
  }
}

// ---------- PNG encoder ----------
// Minimal RGBA PNG writer (filter type 0 / none on every row), IHDR + IDAT + IEND.

function encodePNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Build raw with filter byte per scanline
  const rowSize = width * 4;
  const raw = Buffer.alloc((rowSize + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowSize + 1)] = 0; // filter none
    pixels.subarray(y * rowSize, (y + 1) * rowSize).forEach((b, i) => {
      raw[y * (rowSize + 1) + 1 + i] = b;
    });
  }

  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
