import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const outDir = path.join(process.cwd(), "public", "notifications");
const size = 512;

const assets = [
  ["wood-classic.png", drawClassic],
  ["wood-mail.png", drawMail],
  ["wood-alert.png", drawAlert],
  ["wood-long.png", drawLong],
  ["wood-summon.png", drawSummon],
  ["wood-badge.png", drawBadge, 96],
];

await fs.mkdir(outDir, { recursive: true });
for (const [filename, draw, assetSize = size] of assets) {
  const canvas = createCanvas(assetSize, assetSize);
  draw(canvas);
  await fs.writeFile(path.join(outDir, filename), encodePng(canvas));
}

function drawClassic(canvas) {
  background(canvas, "#315f3a");
  ring(canvas, 256, 256, 188, "#f5f0df");
  log(canvas, 112, 200, 288, 112, "#a86432");
  cutEnd(canvas, 126, 256, 68);
  cutEnd(canvas, 396, 256, 68);
  sprig(canvas, 318, 136);
}

function drawMail(canvas) {
  background(canvas, "#f0ead8");
  roundedRect(canvas, 72, 126, 368, 260, 32, "#fffaf1");
  strokeRoundedRect(canvas, 72, 126, 368, 260, 32, "#2f4932", 12);
  line(canvas, 88, 146, 256, 280, "#2f4932", 10);
  line(canvas, 424, 146, 256, 280, "#2f4932", 10);
  line(canvas, 92, 370, 218, 248, "#2f4932", 8);
  line(canvas, 420, 370, 294, 248, "#2f4932", 8);
  log(canvas, 174, 222, 166, 70, "#9d622f");
  cutEnd(canvas, 180, 257, 38);
  cutEnd(canvas, 338, 257, 38);
}

function drawAlert(canvas) {
  background(canvas, "#8b312b");
  circle(canvas, 256, 256, 202, "#f8d76c");
  circle(canvas, 256, 256, 158, "#fff3bc");
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
    const x1 = 256 + Math.cos(angle) * 178;
    const y1 = 256 + Math.sin(angle) * 178;
    const x2 = 256 + Math.cos(angle) * 228;
    const y2 = 256 + Math.sin(angle) * 228;
    line(canvas, x1, y1, x2, y2, "#f8d76c", 18);
  }
  log(canvas, 124, 222, 264, 92, "#95572b");
  cutEnd(canvas, 132, 268, 54);
  cutEnd(canvas, 382, 268, 54);
}

function drawLong(canvas) {
  background(canvas, "#264d36");
  roundedRect(canvas, 52, 214, 408, 112, 56, "#8f5529");
  roundedRect(canvas, 84, 232, 344, 30, 15, "#b9773a");
  cutEnd(canvas, 70, 270, 64);
  cutEnd(canvas, 442, 270, 64);
  line(canvas, 156, 300, 310, 300, "#5f351f", 10);
  line(canvas, 204, 244, 374, 244, "#d79951", 8);
}

function drawSummon(canvas) {
  background(canvas, "#24333a");
  circle(canvas, 256, 258, 188, "#d7ead2");
  circle(canvas, 256, 258, 150, "#24333a");
  line(canvas, 130, 132, 382, 384, "#d7ead2", 12);
  line(canvas, 382, 132, 130, 384, "#d7ead2", 12);
  log(canvas, 146, 214, 220, 94, "#a76532");
  cutEnd(canvas, 154, 261, 54);
  cutEnd(canvas, 360, 261, 54);
}

function drawBadge(canvas) {
  background(canvas, "#000000");
  circle(canvas, 48, 48, 42, "#ffffff");
  roundedRect(canvas, 18, 38, 60, 22, 11, "#000000");
  circle(canvas, 21, 49, 13, "#000000");
  circle(canvas, 75, 49, 13, "#000000");
}

function createCanvas(width, height) {
  return {
    width,
    height,
    pixels: new Uint8Array(width * height * 4).fill(0),
  };
}

function background(canvas, color) {
  rect(canvas, 0, 0, canvas.width, canvas.height, color);
}

function rect(canvas, x, y, width, height, color) {
  const rgba = hex(color);
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(canvas.width, Math.ceil(x + width));
  const y1 = Math.min(canvas.height, Math.ceil(y + height));
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) setPixel(canvas, xx, yy, rgba);
  }
}

function roundedRect(canvas, x, y, width, height, radius, color) {
  const rgba = hex(color);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + width);
  const y1 = Math.ceil(y + height);
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      const cx = clamp(xx, x + radius, x + width - radius);
      const cy = clamp(yy, y + radius, y + height - radius);
      if ((xx - cx) ** 2 + (yy - cy) ** 2 <= radius ** 2) setPixel(canvas, xx, yy, rgba);
    }
  }
}

function strokeRoundedRect(canvas, x, y, width, height, radius, color, thickness) {
  roundedRect(canvas, x, y, width, height, radius, color);
  roundedRect(
    canvas,
    x + thickness,
    y + thickness,
    width - thickness * 2,
    height - thickness * 2,
    Math.max(0, radius - thickness),
    "#fffaf1",
  );
}

function circle(canvas, cx, cy, radius, color) {
  const rgba = hex(color);
  const x0 = Math.floor(cx - radius);
  const y0 = Math.floor(cy - radius);
  const x1 = Math.ceil(cx + radius);
  const y1 = Math.ceil(cy + radius);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) setPixel(canvas, x, y, rgba);
    }
  }
}

function ring(canvas, cx, cy, radius, color) {
  circle(canvas, cx, cy, radius, color);
  circle(canvas, cx, cy, radius - 20, "#315f3a");
}

function line(canvas, x0, y0, x1, y1, color, width) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    circle(
      canvas,
      x0 + (x1 - x0) * t,
      y0 + (y1 - y0) * t,
      width / 2,
      color,
    );
  }
}

function log(canvas, x, y, width, height, color) {
  roundedRect(canvas, x, y, width, height, height / 2, color);
  line(canvas, x + 48, y + height * 0.3, x + width - 52, y + height * 0.3, "#c88444", 8);
  line(canvas, x + 70, y + height * 0.68, x + width - 42, y + height * 0.68, "#684021", 8);
}

function cutEnd(canvas, cx, cy, radius) {
  circle(canvas, cx, cy, radius, "#f3d59c");
  circle(canvas, cx, cy, radius - 16, "#dfb36d");
  circle(canvas, cx, cy, radius - 33, "#f3d59c");
  line(canvas, cx - 8, cy - radius + 8, cx + 18, cy + radius - 12, "#8a5528", 6);
}

function sprig(canvas, x, y) {
  line(canvas, x, y + 52, x + 48, y, "#d9e8c2", 8);
  circle(canvas, x + 54, y - 2, 18, "#d9e8c2");
  circle(canvas, x + 28, y + 20, 14, "#d9e8c2");
}

function setPixel(canvas, x, y, rgba) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const index = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
  canvas.pixels[index] = rgba[0];
  canvas.pixels[index + 1] = rgba[1];
  canvas.pixels[index + 2] = rgba[2];
  canvas.pixels[index + 3] = rgba[3];
}

function encodePng(canvas) {
  const stride = canvas.width * 4 + 1;
  const raw = Buffer.alloc(stride * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    canvas.pixels.copyWithin;
    raw.set(
      canvas.pixels.subarray(y * canvas.width * 4, (y + 1) * canvas.width * 4),
      rowStart + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr(canvas.width, canvas.height)),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ihdr(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  return buffer;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function hex(value) {
  const clean = value.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
    255,
  ];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
