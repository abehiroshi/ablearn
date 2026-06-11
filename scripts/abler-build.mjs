// マスコット Abler の設定画シート (assets/image.png) から
// 各ポーズ・表情を切り出して public/abler/ と PWA アイコンを生成する。
// 使い方: node scripts/abler-build.mjs
import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// ===== PNG デコード（8bit RGBA / 非インターレースのみ対応） =====

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

function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("PNGではない");
  let pos = 8;
  let w = 0;
  let h = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0)
        throw new Error("8bit RGBA 非インターレースのみ対応");
    } else if (type === "IDAT") {
      idat.push(data);
    }
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev ? prev[x] : 0;
      const c = x >= 4 && prev ? prev[x - 4] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[x] = v & 0xff;
    }
  }
  return { w, h, rgba: out };
}

// ===== 画像処理 =====

function cropImg(img, x0, y0, x1, y1) {
  const w = x1 - x0;
  const h = y1 - y0;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    img.rgba.copy(
      rgba,
      y * w * 4,
      ((y0 + y) * img.w + x0) * 4,
      ((y0 + y) * img.w + x1) * 4
    );
  }
  return { w, h, rgba };
}

/** 縁から背景色をたどって透明化（透過済みシートなら何もしない） */
function removeBackground(img) {
  const { w, h, rgba } = img;
  let transparent = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) transparent++;
  if (transparent > (w * h) / 100) return; // 既に透過済み

  const bg = [rgba[0], rgba[1], rgba[2]];
  const TOL = 36;
  const near = (i) =>
    Math.abs(rgba[i] - bg[0]) < TOL &&
    Math.abs(rgba[i + 1] - bg[1]) < TOL &&
    Math.abs(rgba[i + 2] - bg[2]) < TOL;
  const visited = new Uint8Array(w * h);
  const queue = [];
  for (let x = 0; x < w; x++) queue.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) queue.push(y * w, y * w + w - 1);
  while (queue.length) {
    const p = queue.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    if (!near(p * 4)) continue;
    rgba[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) queue.push(p - 1);
    if (x < w - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - w);
    if (y < h - 1) queue.push(p + w);
  }
}

/** 最大の連結成分だけ残す（隣のキャラの切れ端や記号を除去） */
function keepLargestComponent(img) {
  const { w, h, rgba } = img;
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || rgba[start * 4 + 3] < 16) continue;
    const id = sizes.length;
    let size = 0;
    const queue = [start];
    label[start] = id;
    while (queue.length) {
      const p = queue.pop();
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue;
        if (x === 0 && q === p - 1) continue;
        if (x === w - 1 && q === p + 1) continue;
        if (label[q] !== -1 || rgba[q * 4 + 3] < 16) continue;
        label[q] = id;
        queue.push(q);
      }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return;
  const keep = sizes.indexOf(Math.max(...sizes));
  for (let p = 0; p < w * h; p++) {
    if (rgba[p * 4 + 3] >= 16 && label[p] !== keep) rgba[p * 4 + 3] = 0;
  }
}

/** 透明部分を切り落として余白 pad px を残す */
function trim(img, pad = 6) {
  const { w, h, rgba } = img;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] >= 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x0 > x1) return img;
  return cropImg(
    img,
    Math.max(0, x0 - pad),
    Math.max(0, y0 - pad),
    Math.min(w, x1 + 1 + pad),
    Math.min(h, y1 + 1 + pad)
  );
}

/** バイリニア縮小・拡大 */
function resize(img, dw, dh) {
  const { w, h, rgba } = img;
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = ((y + 0.5) * h) / dh - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dw; x++) {
      const sx = ((x + 0.5) * w) / dw - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const v =
          rgba[(y0 * w + x0) * 4 + c] * (1 - fx) * (1 - fy) +
          rgba[(y0 * w + x1) * 4 + c] * fx * (1 - fy) +
          rgba[(y1 * w + x0) * 4 + c] * (1 - fx) * fy +
          rgba[(y1 * w + x1) * 4 + c] * fx * fy;
        out[(y * dw + x) * 4 + c] = Math.round(v);
      }
    }
  }
  return { w: dw, h: dh, rgba: out };
}

// ===== 切り出し定義（シート 1536x1024 の座標） =====

const CROPS = {
  // メイン立ち絵・ポーズ
  main: [40, 80, 420, 690],
  benkyou: [455, 85, 740, 430],
  kangaechu: [740, 110, 1015, 430],
  dekita: [1000, 70, 1265, 430],
  mukatteru: [1265, 90, 1520, 430],
  // 表情（顔のみ）
  nikkori: [430, 480, 630, 680],
  uun: [630, 480, 805, 680],
  odoroki: [805, 480, 975, 680],
  hirameita: [975, 480, 1150, 680],
  iine: [1150, 480, 1330, 680],
  kuyashii: [1330, 480, 1510, 680],
  // 学習サポート
  fukushu: [545, 740, 760, 1000],
  ganbare: [730, 740, 950, 1000],
};

const sheet = decodePng(readFileSync("assets/image.png"));
console.log(`sheet: ${sheet.w}x${sheet.h}`);
mkdirSync("public/abler", { recursive: true });

const results = {};
for (const [name, [x0, y0, x1, y1]] of Object.entries(CROPS)) {
  let img = cropImg(sheet, x0, y0, Math.min(x1, sheet.w), Math.min(y1, sheet.h));
  removeBackground(img);
  keepLargestComponent(img);
  img = trim(img);
  results[name] = img;
  // 表示用は最大400pxに縮小して容量を抑える
  const MAX = 400;
  if (img.w > MAX || img.h > MAX) {
    const s = MAX / Math.max(img.w, img.h);
    img = resize(img, Math.round(img.w * s), Math.round(img.h * s));
  }
  writeFileSync(`public/abler/${name}.png`, encodePng(img.w, img.h, img.rgba));
  console.log(`abler/${name}.png ${img.w}x${img.h}`);
}

// ===== PWA アイコン: 顔アップを角丸背景に載せる =====

function makeIcon(size, face) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = size * 0.22;
  const BG = [234, 240, 255]; // やさしい水色
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const qx = Math.max(0, Math.max(r - x, x - (size - 1 - r)));
      const qy = Math.max(0, Math.max(r - y, y - (size - 1 - r)));
      if (Math.hypot(qx, qy) > r) continue; // 透明のまま
      rgba[i] = BG[0];
      rgba[i + 1] = BG[1];
      rgba[i + 2] = BG[2];
      rgba[i + 3] = 255;
    }
  }
  // 顔を中央に合成（maskable を考慮して 78% に収める）
  const target = Math.round(size * 0.78);
  const s = target / Math.max(face.w, face.h);
  const scaled = resize(face, Math.round(face.w * s), Math.round(face.h * s));
  const ox = Math.round((size - scaled.w) / 2);
  const oy = Math.round((size - scaled.h) / 2);
  for (let y = 0; y < scaled.h; y++) {
    for (let x = 0; x < scaled.w; x++) {
      const si = (y * scaled.w + x) * 4;
      const a = scaled.rgba[si + 3] / 255;
      if (a === 0) continue;
      const di = ((oy + y) * size + (ox + x)) * 4;
      for (let c = 0; c < 3; c++) {
        rgba[di + c] = Math.round(
          scaled.rgba[si + c] * a + rgba[di + c] * (1 - a)
        );
      }
      rgba[di + 3] = Math.max(rgba[di + 3], scaled.rgba[si + 3]);
    }
  }
  return encodePng(size, size, rgba);
}

const face = results.nikkori;
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, makeIcon(size, face));
  console.log(`icons/icon-${size}.png (Abler)`);
}
