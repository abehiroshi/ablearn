// 前提概念への遡り（計画26）。
// つまずき検知（計画13）の誘導先に「前提概念の復習」を加えるための選定ロジック。
// v1 はコレクション内限定・直接の前提のみ（孫への連鎖は、前提側でつまずいたときに
// あらためてその前提が提示されることで自然につながる）。

import type { ConceptMeta } from "../types";

/** concepts.json の配列を id 引きの Map にする */
export function buildConceptMap(
  concepts: ConceptMeta[]
): Map<string, ConceptMeta> {
  const map = new Map<string, ConceptMeta>();
  for (const c of concepts) map.set(c.id, c);
  return map;
}

/**
 * 「習熟が低い」の判定: 一度も練習していない、または自力（level 1）未満。
 * 写経段（-1）・choice段（0）はまだ手前に戻る価値がある段とみなす
 */
function isLowMastery(m: { level: number } | undefined): boolean {
  return !m || m.level < 1;
}

/**
 * つまずいた概念の前提のうち、誘導すべきものを1つ返す。
 * - 宣言順に先頭から見て、最初の「コレクション内（set あり）・習熟が低い」前提を選ぶ
 * - set が無い宣言（中1範囲などコレクション外）は誘導に使わない（受け入れ条件2）
 * - いま解いているセット自身への誘導はしない（同じ場所に戻すだけになる）
 */
export function pickPrereq(
  conceptId: string,
  concepts: Map<string, ConceptMeta>,
  mastery: Record<string, { level: number }>,
  opts: { currentSetId: string; setExists: (setId: string) => boolean }
): ConceptMeta | null {
  const meta = concepts.get(conceptId);
  if (!meta) return null;
  for (const pid of meta.prerequisites ?? []) {
    const p = concepts.get(pid);
    if (!p || !p.set) continue; // 未宣言・コレクション外は使わない
    if (p.set === opts.currentSetId) continue;
    if (!opts.setExists(p.set)) continue; // コンテンツ更新で消えたセットは無視
    if (isLowMastery(mastery[p.id])) return p;
  }
  return null;
}
