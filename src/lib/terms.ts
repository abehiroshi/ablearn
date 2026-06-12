// テスト範囲のプリセット（計画35）。
// 単元の terms タグから「1学期期末」等の定期テストの範囲を導出し、
// テスト登録の範囲選択に一括チェック（union）/一括解除のトグルを提供する。
// プリセットは推奨デフォルトであり、適用後の個別チェックが常に勝つ。

import type { ContentIndex, TermTest } from "../types";

/** term の範囲: subjectId → セットID群（タグの無い単元は含まれない） */
export function termRange(
  index: ContentIndex,
  term: TermTest
): Record<string, string[]> {
  const range: Record<string, string[]> = {};
  for (const subject of index.subjects) {
    const ids = subject.units
      .filter((u) => u.terms?.includes(term))
      .flatMap((u) => u.sets.map((m) => m.id));
    if (ids.length > 0) range[subject.id] = ids;
  }
  return range;
}

/** その term の範囲が現在の選択にすべて入っているか（ボタンのトグル判定） */
export function termAllChecked(
  range: Record<string, string[]>,
  term: Record<string, string[]>
): boolean {
  const ids = Object.values(term).flat();
  if (ids.length === 0) return false;
  const checked = new Set(Object.values(range).flat());
  return ids.every((id) => checked.has(id));
}

/** term の範囲を選択に追加する（union。既存の個別チェックは保持） */
export function addTermRange(
  range: Record<string, string[]>,
  term: Record<string, string[]>
): Record<string, string[]> {
  const next = { ...range };
  for (const [subjectId, ids] of Object.entries(term)) {
    next[subjectId] = [...new Set([...(next[subjectId] ?? []), ...ids])];
  }
  return next;
}

/** term の範囲を選択から外す（範囲外の個別チェックは保持） */
export function removeTermRange(
  range: Record<string, string[]>,
  term: Record<string, string[]>
): Record<string, string[]> {
  const next = { ...range };
  for (const [subjectId, ids] of Object.entries(term)) {
    const drop = new Set(ids);
    next[subjectId] = (next[subjectId] ?? []).filter((id) => !drop.has(id));
  }
  return next;
}
