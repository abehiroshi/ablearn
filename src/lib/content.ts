import type { ContentIndex, QuestionSet, SetMeta, Subject } from "../types";
import { currentCollection } from "./collection";

const BASE = import.meta.env.BASE_URL; // "/ablearn/" or "/"

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`コンテンツの読み込みに失敗しました: ${path} (${res.status})`);
  return (await res.json()) as T;
}

export function loadIndex(): Promise<ContentIndex> {
  return fetchJson<ContentIndex>(`content/${currentCollection()}/index.json`);
}

export function loadSet(meta: SetMeta): Promise<QuestionSet> {
  return fetchJson<QuestionSet>(`content/${currentCollection()}/${meta.file}`);
}

/** index 全体から setId → { meta, subject } の逆引きを作る */
export function buildSetLookup(
  index: ContentIndex
): Map<string, { meta: SetMeta; subject: Subject }> {
  const map = new Map<string, { meta: SetMeta; subject: Subject }>();
  for (const subject of index.subjects) {
    for (const unit of subject.units) {
      for (const meta of unit.sets) {
        map.set(meta.id, { meta, subject });
      }
    }
  }
  return map;
}
