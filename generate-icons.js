const zlib = require("zlib");
const fs = require("fs");

// Minimal PNG encoder (no deps) — draws a solid background with a centered broom-style "✓" glyph.
function crc32(buf) {
  let c, crcTable = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// 7x7 bitmap checkmark
const GLYPH = [
  "0000001",
  "0000010",
  "0000100",
  "1001000",
  "0110000",
  "0100000",
  "1000000"
];

function buildPng(size) {
  const bg = [15, 23, 42];     // #0f172a
  const fg = [34, 197, 94];    // #22c55e
  const px = new Uint8Array(size * size * 4);

  // background, rounded-ish corners
  const radius = Math.floor(size * 0.18);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = true;
      const corners = [[radius, radius], [size - radius, radius], [radius, size - radius], [size - radius, size - radius]];
      for (const [cx, cy] of corners) {
        const nearX = (x < radius && cx === radius) || (x > size - radius && cx === size - radius);
        const nearY = (y < radius && cy === radius) || (y > size - radius && cy === size - radius);
        if (nearX && nearY) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy > radius * radius) inside = false;
        }
      }
      const i = (y * size + x) * 4;
      const [r, g, b] = inside ? bg : [0, 0, 0];
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = inside ? 255 : 0;
    }
  }

  // draw glyph scaled to ~55% of icon, centered
  const glyphW = GLYPH[0].length, glyphH = GLYPH.length;
  const scale = Math.floor(size * 0.55 / glyphW);
  const drawW = scale * glyphW, drawH = scale * glyphH;
  const offX = Math.floor((size - drawW) / 2), offY = Math.floor((size - drawH) / 2);

  for (let gy = 0; gy < glyphH; gy++) {
    for (let gx = 0; gx < glyphW; gx++) {
      if (GLYPH[gy][gx] === "1") {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const x = offX + gx * scale + sx;
            const y = offY + gy * scale + sy;
            if (x >= 0 && x < size && y >= 0 && y < size) {
              const i = (y * size + x) * 4;
              px[i] = fg[0]; px[i + 1] = fg[1]; px[i + 2] = fg[2]; px[i + 3] = 255;
            }
          }
        }
      }
    }
  }

  // build raw scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size * 4; x++) {
      raw[y * (size * 4 + 1) + 1 + x] = px[y * size * 4 + x];
    }
  }

  const idat = zlib.deflateSync(raw);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdrData),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

fs.writeFileSync("icon-192.png", buildPng(192));
fs.writeFileSync("icon-512.png", buildPng(512));
console.log("icons generated");
