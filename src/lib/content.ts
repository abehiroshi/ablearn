import type {
  ConceptIndex,
  ConceptMeta,
  ContentIndex,
  QuestionSet,
  SetMeta,
  Subject,
} from "../types";
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

/**
 * 概念メタ（前提宣言。計画26）を読み込む。
 * concepts.json はコレクション任意（無い・壊れているコレクションでは空 = 遡り誘導なし）
 */
export async function loadConcepts(): Promise<ConceptMeta[]> {
  try {
    const data = await fetchJson<ConceptIndex>(
      `content/${currentCollection()}/concepts.json`
    );
    return Array.isArray(data.concepts) ? data.concepts : [];
  } catch {
    return [];
  }
}

/** 全セットを読み込む（達成度の分母計算用。起動後にバックグラウンドで呼ぶ） */
export async function loadAllSets(
  index: ContentIndex
): Promise<Record<string, QuestionSet>> {
  const metas = index.subjects.flatMap((s) =>
    s.units.flatMap((u) => u.sets)
  );
  const sets: Record<string, QuestionSet> = {};
  await Promise.all(
    metas.map(async (meta) => {
      sets[meta.id] = await loadSet(meta);
    })
  );
  return sets;
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
