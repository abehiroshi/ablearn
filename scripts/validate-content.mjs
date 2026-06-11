// コンテンツ JSON の整合性チェック。
// 使い方: node scripts/validate-content.mjs
// AI でコンテンツを生成・追加したあと、push 前に必ず実行する。
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "public/content";
const errors = [];
const err = (msg) => errors.push(msg);

const index = JSON.parse(readFileSync(join(ROOT, "index.json"), "utf8"));

function checkLinks(label, links) {
  if (!Array.isArray(links)) return err(`${label}: links が配列でない`);
  for (const l of links) {
    if (!l.label || !l.url) err(`${label}: links に label/url がない`);
    else if (!/^https?:\/\//.test(l.url))
      err(`${label}: links.url が http(s) でない (${l.url})`);
  }
}

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
            break;
          case "flashcard":
            if (!q.front || !q.back) err(`${ql}: front/back がない`);
            break;
          case "order":
            if (!q.question) err(`${ql}: question がない`);
            if (!Array.isArray(q.tokens) || q.tokens.length < 2)
              err(`${ql}: tokens が2つ未満`);
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

if (errors.length) {
  console.error(`NG: ${errors.length} 件`);
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}
const setCount = seenSetIds.size;
console.log(`OK: ${index.subjects.length} 教科 / ${setCount} セット`);
