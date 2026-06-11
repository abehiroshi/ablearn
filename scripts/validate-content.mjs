// コンテンツ JSON の整合性チェック。要 Node 18+（fetch・トップレベル await）。
// 使い方: node scripts/validate-content.mjs [--links]
//   --links: links の URL の死活チェックも行う（ネットワーク必須。CIでは実行しない）
// AI でコンテンツを生成・追加したあと、push 前に必ず実行する。
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CHECK_LINKS = process.argv.includes("--links");
const CONTENT = "public/content";
const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const allUrls = new Map(); // url → 出どころラベル

// コレクション一覧（計画22）。各コレクションの index.json を検証する
const { collections } = JSON.parse(
  readFileSync(join(CONTENT, "collections.json"), "utf8")
);
if (!Array.isArray(collections) || collections.length === 0) {
  console.error("NG: collections.json にコレクションがない");
  process.exit(1);
}

let totalSubjects = 0;
let totalSets = 0;
for (const collection of collections) {
  if (!collection.id || !collection.name)
    err(`collections.json: id/name がない (${JSON.stringify(collection)})`);
  const ROOT = join(CONTENT, collection.id);
  if (!existsSync(join(ROOT, "index.json"))) {
    err(`${collection.id}: index.json がない`);
    continue;
  }
  // HTML エントリが無いとランディングのリンクが 404 になる
  if (!existsSync(join(collection.id, "index.html")))
    err(`${collection.id}: ${collection.id}/index.html（アプリのエントリ）がない`);
  if (!existsSync(`public/manifest-${collection.id}.webmanifest`))
    err(`${collection.id}: public/manifest-${collection.id}.webmanifest がない`);
  validateCollection(ROOT, collection.id);
}

function validateCollection(ROOT, collectionId) {
const index = JSON.parse(readFileSync(join(ROOT, "index.json"), "utf8"));

function checkLinks(label, links) {
  if (!Array.isArray(links)) return err(`${label}: links が配列でない`);
  for (const l of links) {
    if (!l.label || !l.url) err(`${label}: links に label/url がない`);
    else if (!/^https?:\/\//.test(l.url))
      err(`${label}: links.url が http(s) でない (${l.url})`);
    else if (!allUrls.has(l.url)) allUrls.set(l.url, label);
  }
}

/** CJK漢字を含むか（answers の別表記網羅チェック用） */
const hasKanji = (s) => /[一-鿿]/.test(s);

const seenSetIds = new Set();
const seenColors = new Map();
const seenIcons = new Map();
for (const subject of index.subjects) {
  for (const key of ["id", "name", "color", "icon"]) {
    if (!subject[key]) err(`subject ${subject.id ?? "?"}: ${key} がない`);
  }
  if (seenColors.has(subject.color))
    err(`subject ${subject.id}: color が ${seenColors.get(subject.color)} と重複`);
  seenColors.set(subject.color, subject.id);
  if (seenIcons.has(subject.icon))
    err(`subject ${subject.id}: icon が ${seenIcons.get(subject.icon)} と重複`);
  seenIcons.set(subject.icon, subject.id);
  for (const unit of subject.units ?? []) {
    if (unit.links) checkLinks(`${subject.id}/${unit.id}`, unit.links);
    for (const meta of unit.sets ?? []) {
      const label = `${subject.id}/${unit.id}/${meta.id}`;
      if (seenSetIds.has(meta.id)) err(`${label}: セットID重複`);
      seenSetIds.add(meta.id);
      // 出典（計画21）: 文字列・表示が崩れない長さ
      if (meta.origin !== undefined) {
        if (typeof meta.origin !== "string" || meta.origin.length === 0)
          err(`${label}: origin が文字列でない`);
        else if (meta.origin.length > 40)
          err(`${label}: origin が長すぎる（40文字以内。"${meta.origin.slice(0, 20)}…"）`);
      }

      const path = join(ROOT, meta.file);
      if (!existsSync(path)) {
        err(`${label}: ファイルがない (${meta.file})`);
        continue;
      }
      let set;
      try {
        set = JSON.parse(readFileSync(path, "utf8"));
      } catch (e) {
        err(`${label}: JSON パース失敗 (${e.message})`);
        continue;
      }
      if (set.id !== meta.id)
        err(`${label}: index の id と set.id が不一致 (${set.id})`);
      if (!set.title) err(`${label}: title がない`);
      // レッスンは steps（解説カード＋問題）、演習は questions
      const items =
        set.kind === "lesson" ? (set.steps ?? []) : (set.questions ?? []);
      if (set.kind === "lesson" && meta.kind !== "lesson")
        err(`${label}: set は lesson だが index 側に kind がない`);
      if (meta.kind === "lesson" && set.kind !== "lesson")
        err(`${label}: index 側は lesson だが set に kind がない`);
      if (!Array.isArray(items) || items.length === 0) {
        err(`${label}: ${set.kind === "lesson" ? "steps" : "questions"} が空`);
        continue;
      }
      const seenQ = new Set();
      for (const q of items) {
        const ql = `${meta.id}/${q.id ?? "?"}`;
        if (!q.id) err(`${ql}: id がない`);
        if (seenQ.has(q.id)) err(`${ql}: 問題ID重複`);
        seenQ.add(q.id);
        switch (q.type) {
          case "choice":
            if (!q.question) err(`${ql}: question がない`);
            if (!Array.isArray(q.choices) || q.choices.length < 2)
              err(`${ql}: choices が2つ未満`);
            else if (
              !Number.isInteger(q.answer) ||
              q.answer < 0 ||
              q.answer >= q.choices.length
            )
              err(`${ql}: answer が choices の範囲外 (${q.answer})`);
            break;
          case "input":
            if (!q.question) err(`${ql}: question がない`);
            if (!Array.isArray(q.answers) || q.answers.length === 0)
              err(`${ql}: answers が空`);
            // 形式チェック: 漢字を含む正解1つだけだと、ひらがな解答が不正解になりやすい
            else if (
              q.answers.every((a) => hasKanji(a)) &&
              q.answers.length === 1
            )
              warn(
                `${ql}: answers が漢字表記1つだけ（ひらがな等の別表記の網羅を検討）`
              );
            break;
          case "flashcard":
            if (!q.front || !q.back) err(`${ql}: front/back がない`);
            break;
          case "order":
            if (!q.question) err(`${ql}: question がない`);
            if (!Array.isArray(q.tokens) || q.tokens.length < 2)
              err(`${ql}: tokens が2つ未満`);
            // 並びの一意性は自動証明できない。重複トークンは別解を生みやすいので注意を出す
            else if (new Set(q.tokens).size !== q.tokens.length)
              warn(
                `${ql}: tokens に重複がある（「別の正しい並べ方」が無いか確認。チャンク化で一意にできる）`
              );
            break;
          case "card": // レッスンの解説カード
            if (!q.body) err(`${ql}: body がない`);
            break;
          default:
            err(`${ql}: 未知の type (${q.type})`);
        }
        // 任意フィールドの型チェック
        if (q.difficulty !== undefined && ![1, 2, 3].includes(q.difficulty))
          err(`${ql}: difficulty は 1|2|3 (${q.difficulty})`);
        if (
          q.hints !== undefined &&
          (!Array.isArray(q.hints) || q.hints.some((h) => typeof h !== "string"))
        )
          err(`${ql}: hints が文字列配列でない`);
        if (
          q.type === "choice" &&
          q.answers !== undefined &&
          (!Array.isArray(q.answers) ||
            q.answers.length === 0 ||
            q.answers.some((a) => typeof a !== "string"))
        )
          err(`${ql}: answers（受理表記）が不正`);
        if (q.concept !== undefined && typeof q.concept !== "string")
          err(`${ql}: concept が文字列でない`);
        if (q.links !== undefined) checkLinks(ql, q.links);
      }
    }
  }
}
totalSubjects += index.subjects.length;
totalSets += seenSetIds.size;
}

// links の死活チェック（--links 指定時のみ。ネットワーク必須なので CI ゲートには含めない）
if (CHECK_LINKS) {
  for (const [url, label] of allUrls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, {
        redirect: "follow",
        signal: ctrl.signal,
        // bot 判定での 403 誤検出を減らす
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ablearn-validate)" },
      });
      clearTimeout(timer);
      if ([403, 405, 429].includes(res.status))
        // bot 対策の可能性があるため死リンク断定はしない
        warn(`${label}: リンクの確認が必要 ${url} (${res.status}。ブラウザで開いて確認)`);
      else if (res.status >= 400)
        err(`${label}: 死リンク ${url} (${res.status})`);
      else console.log(`link ok: ${url} (${res.status})`);
    } catch (e) {
      err(`${label}: リンクに到達できない ${url} (${e.message ?? e})`);
    }
  }
}

for (const w of warnings) console.warn("注意: " + w);
if (errors.length) {
  console.error(`NG: ${errors.length} 件`);
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}
console.log(
  `OK: ${collections.length} コレクション / ${totalSubjects} 教科 / ${totalSets} セット` +
    (warnings.length ? `（注意 ${warnings.length} 件）` : "")
);
