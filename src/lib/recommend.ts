// 「今日のおすすめ」エンジン。
// 日常モードは進行中単元、テストモードはテスト範囲を対象に、
// 同じ並べ替え（未挑戦 → ベストスコアが低い順)に教科の重みを掛ける。

import type { ContentIndex, ContentLink, SetMeta, Subject } from "../types";
import type { AppState, TestPlan } from "./storage";
import { dueSetIds } from "./mastery";

export interface Recommendation {
  meta: SetMeta;
  subject: Subject;
  /** 表示用: なぜおすすめか（例: 「数学まであと2日」） */
  reason: string;
  /** 予習用の外部導線（レッスンが無い新しい単元のとき。計画13） */
  links?: ContentLink[];
}

const MAX_RECOMMEND = 3;
/** 単元の解答実績がこの問数未満なら「新しい単元」として予習（レッスン）を先に出す */
export const PREVIEW_MIN_ANSWERS = 3;

/** テストの最終日（"YYYY-MM-DD"）。日程が空なら null */
export function testLastDay(test: TestPlan): string | null {
  const dates = test.days.map((d) => d.date).filter(Boolean);
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
}

/** テストモード判定: 登録があり最終日を過ぎていない */
export function isTestActive(test: TestPlan | null, today: string): boolean {
  if (!test) return false;
  const last = testLastDay(test);
  return last !== null && today <= last;
}

/** テストが終わった直後（労い表示とクリア促しの対象）か */
export function isTestOver(test: TestPlan | null, today: string): boolean {
  if (!test) return false;
  const last = testLastDay(test);
  return last !== null && today > last;
}

export function daysBetweenISO(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000
  );
}

/**
 * 教科ごとの「最も近い残り試験日」までの日数。
 * 全日程が終わった教科は含まない（＝おすすめから外れる）。
 */
export function subjectDaysLeft(
  test: TestPlan,
  today: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const day of test.days) {
    if (!day.date || day.date < today) continue;
    const left = daysBetweenISO(today, day.date);
    for (const sid of day.subjects) {
      const cur = map.get(sid);
      if (cur === undefined || left < cur) map.set(sid, left);
    }
  }
  return map;
}

export function recommend(
  index: ContentIndex,
  state: AppState,
  today: string
): Recommendation[] {
  // weight が小さいほど優先（テストモードでは試験日までの日数）
  const candidates: (Recommendation & { weight: number })[] = [];

  if (isTestActive(state.test, today)) {
    const test = state.test!;
    const daysLeft = subjectDaysLeft(test, today);
    for (const subject of index.subjects) {
      const left = daysLeft.get(subject.id);
      if (left === undefined) continue; // 試験が終わった（または日程にない）教科
      const rangeIds = new Set(test.range[subject.id] ?? []);
      const reason =
        left === 0
          ? `今日${subject.name}のテスト！`
          : `${subject.name}まであと${left}日`;
      for (const unit of subject.units) {
        for (const meta of unit.sets) {
          if (!rangeIds.has(meta.id)) continue;
          candidates.push({ meta, subject, weight: left, reason });
        }
      }
    }
  } else {
    for (const subject of index.subjects) {
      const unitIds = state.currentUnits[subject.id] ?? [];
      for (const unit of subject.units) {
        if (!unitIds.includes(unit.id)) continue;
        // 新しい単元（演習実績がほぼない）はレッスンを先に出す（予習フロー・計画13）
        const setIds = new Set(unit.sets.map((m) => m.id));
        const answered = Object.values(state.questionStats).filter((s) =>
          setIds.has(s.setId)
        ).length;
        const fresh = answered < PREVIEW_MIN_ANSWERS;
        const hasLesson = unit.sets.some((m) => m.kind === "lesson");
        for (const meta of unit.sets) {
          const previewLesson =
            fresh && meta.kind === "lesson" && !state.setRecords[meta.id];
          candidates.push({
            meta,
            subject,
            weight: previewLesson ? -2 : 0,
            reason: previewLesson
              ? "まずはレッスンから！"
              : `授業中: ${unit.name}`,
            // レッスンが無い新しい単元では授業動画などの導線を添える
            links:
              fresh && !hasLesson && unit.links && unit.links.length > 0
                ? unit.links
                : undefined,
          });
        }
      }
    }
    // 間隔反復: 定着確認の時期が来た概念のセットを最優先で混ぜる
    const due = dueSetIds(state, today);
    if (due.size > 0) {
      for (const subject of index.subjects) {
        for (const unit of subject.units) {
          for (const meta of unit.sets) {
            if (!due.has(meta.id)) continue;
            const existing = candidates.find((c) => c.meta.id === meta.id);
            if (existing) {
              existing.weight = -1;
              existing.reason = "定着チェックの時期だよ";
            } else {
              candidates.push({
                meta,
                subject,
                weight: -1,
                reason: "定着チェックの時期だよ",
              });
            }
          }
        }
      }
    }
  }

  // 未挑戦（-1）→ ベストスコアが低い順
  const rank = (m: SetMeta) => state.setRecords[m.id]?.best ?? -1;
  candidates.sort(
    (a, b) => a.weight - b.weight || rank(a.meta) - rank(b.meta)
  );

  if (candidates.length === 0) {
    // 進行中単元もテストもないときは従来どおり全体から1つ
    // （未挑戦 → 最後に解いたのが古い順）
    const all = index.subjects.flatMap((s) =>
      s.units.flatMap((u) => u.sets.map((meta) => ({ meta, subject: s })))
    );
    if (all.length === 0) return [];
    const pick =
      all.find(({ meta }) => !state.setRecords[meta.id]) ??
      [...all].sort((a, b) =>
        (state.setRecords[a.meta.id]?.lastAt ?? "").localeCompare(
          state.setRecords[b.meta.id]?.lastAt ?? ""
        )
      )[0];
    return [{ ...pick, reason: "今日のおすすめ" }];
  }

  return candidates.slice(0, MAX_RECOMMEND);
}
