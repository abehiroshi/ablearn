// コンテンツ JSON の整合性チェック。
// 使い方: node scripts/validate-content.mjs
// AI でコンテンツを生成・追加したあと、push 前に必ず実行する。
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "public/content";
const errors = [];
const err = (msg) => errors.push(msg);

const index = JSON.parse(readFileSync(join(ROOT, "index.json"), "utf8"));

const seenSetIds = new Set();
for (const subject of index.subjects) {
  for (const key of ["id", "name", "color", "icon"]) {
    if (!subject[key]) err(`subject ${subject.id ?? "?"}: ${key} がない`);
  }
  for (const unit of subject.units ?? []) {
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
      if (!Array.isArray(set.questions) || set.questions.length === 0) {
        err(`${label}: questions が空`);
        continue;
      }
      const seenQ = new Set();
      for (const q of set.questions) {
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
          default:
            err(`${ql}: 未知の type (${q.type})`);
        }
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
