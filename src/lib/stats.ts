// 可視化用の集計。questionStats / history を index と突き合わせて
// 教科別・単元別の正答率や時系列を作る。

import type { ContentIndex } from "../types";
import type { AppState } from "./storage";

export interface AccuracyItem {
  id: string;
  label: string;
  icon: string;
  color: string;
  answered: number;
  /** 正答率 0-100 */
  accuracy: number;
}

/** setId → 単元・教科の逆引き */
function setToUnit(index: ContentIndex) {
  const map = new Map<
    string,
    { unitId: string; unitName: string; subjectIcon: string; subjectColor: string }
  >();
  for (const subject of index.subjects) {
    for (const unit of subject.units) {
      for (const meta of unit.sets) {
        map.set(meta.id, {
          unitId: `${subject.id}/${unit.id}`,
          unitName: unit.name,
          subjectIcon: subject.icon,
          subjectColor: subject.color,
        });
      }
    }
  }
  return map;
}

/** 教科別の正答率（解答があった教科のみ） */
export function subjectAccuracy(
  index: ContentIndex,
  state: AppState
): AccuracyItem[] {
  const result: AccuracyItem[] = [];
  for (const subject of index.subjects) {
    const setIds = new Set(
      subject.units.flatMap((u) => u.sets.map((m) => m.id))
    );
    let correct = 0;
    let total = 0;
    for (const stat of Object.values(state.questionStats)) {
      if (!setIds.has(stat.setId)) continue;
      correct += stat.correct;
      total += stat.correct + stat.wrong;
    }
    if (total === 0) continue;
    result.push({
      id: subject.id,
      label: subject.name,
      icon: subject.icon,
      color: subject.color,
      answered: total,
      accuracy: Math.round((correct / total) * 100),
    });
  }
  return result;
}

/** 単元別の正答率（解答があった単元のみ、正答率の低い順） */
export function unitAccuracy(
  index: ContentIndex,
  state: AppState
): AccuracyItem[] {
  const byUnit = new Map<string, AccuracyItem & { correct: number }>();
  const lookup = setToUnit(index);
  for (const [key, stat] of Object.entries(state.questionStats)) {
    const setId = key.slice(0, key.indexOf("/"));
    const unit = lookup.get(setId);
    if (!unit) continue;
    const cur = byUnit.get(unit.unitId) ?? {
      id: unit.unitId,
      label: unit.unitName,
      icon: unit.subjectIcon,
      color: unit.subjectColor,
      answered: 0,
      correct: 0,
      accuracy: 0,
    };
    cur.answered += stat.correct + stat.wrong;
    cur.correct += stat.correct;
    byUnit.set(unit.unitId, cur);
  }
  return [...byUnit.values()]
    .map((u) => ({ ...u, accuracy: Math.round((u.correct / u.answered) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

export interface GrowthSeries {
  label: string;
  icon: string;
  color: string;
  /** dates と同じ長さ。データがまだない日は null */
  values: (number | null)[];
}

const GROWTH_MAX_UNITS = 5;
const GROWTH_MAX_DAYS = 30;
/** 折れ線の色。同教科の単元が同色で区別できなくなるのを避ける */
const LINE_COLORS = ["#4f7cff", "#ff9500", "#34c759", "#af52de", "#ff3b30"];

/**
 * 単元別の累積正答率の時系列（解答履歴 history から）。
 * 「不得意だった単元が上がっていく」を見るため、日次ではなく累積。
 */
export function unitGrowth(
  index: ContentIndex,
  state: AppState
): { dates: string[]; series: GrowthSeries[] } {
  const lookup = setToUnit(index);
  // unitId → 日付 → {correct, total}
  const perUnit = new Map<string, Map<string, { c: number; t: number }>>();
  const meta = new Map<string, { label: string; icon: string; color: string }>();

  for (const [day, stats] of Object.entries(state.history)) {
    for (const [key, s] of Object.entries(stats)) {
      const setId = key.slice(0, key.indexOf("/"));
      const unit = lookup.get(setId);
      if (!unit) continue;
      if (!perUnit.has(unit.unitId)) {
        perUnit.set(unit.unitId, new Map());
        meta.set(unit.unitId, {
          label: unit.unitName,
          icon: unit.subjectIcon,
          color: unit.subjectColor,
        });
      }
      const days = perUnit.get(unit.unitId)!;
      const cur = days.get(day) ?? { c: 0, t: 0 };
      cur.c += s.correct;
      cur.t += s.correct + s.wrong;
      days.set(day, cur);
    }
  }

  const allDates = [
    ...new Set(Object.keys(state.history).filter((d) => d)),
  ].sort();
  const dates = allDates.slice(-GROWTH_MAX_DAYS);
  if (dates.length === 0) return { dates: [], series: [] };

  // 解答数が多い単元を優先
  const unitIds = [...perUnit.keys()]
    .map((id) => ({
      id,
      total: [...perUnit.get(id)!.values()].reduce((n, v) => n + v.t, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, GROWTH_MAX_UNITS)
    .map((u) => u.id);

  const series: GrowthSeries[] = unitIds.map((id, idx) => {
    const days = perUnit.get(id)!;
    let c = 0;
    let t = 0;
    // 表示窓より前の分を累積の起点に含める
    for (const [day, v] of days) {
      if (day < dates[0]) {
        c += v.c;
        t += v.t;
      }
    }
    const values: (number | null)[] = dates.map((day) => {
      const v = days.get(day);
      if (v) {
        c += v.c;
        t += v.t;
      }
      return t > 0 ? Math.round((c / t) * 100) : null;
    });
    return {
      ...meta.get(id)!,
      color: LINE_COLORS[idx % LINE_COLORS.length],
      values,
    };
  });

  return { dates, series };
}
