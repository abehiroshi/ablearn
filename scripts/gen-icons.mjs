// PWA アイコン (PNG) を依存ライブラリなしで生成する。
// 使い方: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BLUE = [79, 124, 255];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
  );
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = size * 0.22; // 角丸半径
  const stroke = size * 0.055;
  // 文字 "A" の骨格
  const apex = [size * 0.5, size * 0.24];
  const bl = [size * 0.27, size * 0.76];
  const br = [size * 0.73, size * 0.76];
  const barY = size * 0.6;
  const tBar = (barY - apex[1]) / (bl[1] - apex[1]);
  const barL = [apex[0] + tBar * (bl[0] - apex[0]), barY];
  const barR = [apex[0] + tBar * (br[0] - apex[0]), barY];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // 角丸の外は透明
      const qx = Math.max(0, Math.max(r - x, x - (size - 1 - r)));
      const qy = Math.max(0, Math.max(r - y, y - (size - 1 - r)));
      if (Math.hypot(qx, qy) > r) {
        rgba[i + 3] = 0;
        continue;
      }
      const onA =
        distToSegment(x, y, ...apex, ...bl) < stroke ||
        distToSegment(x, y, ...apex, ...br) < stroke ||
        distToSegment(x, y, ...barL, ...barR) < stroke * 0.9;
      const [cr, cg, cb] = onA ? WHITE : BLUE;
      rgba[i] = cr;
      rgba[i + 1] = cg;
      rgba[i + 2] = cb;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

// コレクション別アイコン（chugaku-*.png / kanken-*.png）はオーナー納品物
// （assets/icons/）からの展開なので、ここでは生成しない
mkdirSync("public/icons", { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, makeIcon(size));
  console.log(`generated public/icons/icon-${size}.png`);
}
