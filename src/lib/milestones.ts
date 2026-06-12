// 数字の体系と節目（チェックポイント・キリ番）の検出（計画18）。
// すべて単調増加の数字だけを扱う（絶対に下がらない＝達成感を壊さない）。
// 節目検出は「解答前の状態＋この解答」から新たに跨ぐ節目を列挙する純粋関数。

import type { ContentIndex, QuestionSet } from "../types";
import type { AppState } from "./storage";
import { todayKey } from "./storage";
import { skinById } from "./skins";

// 後ろほど間隔を広げる
export const ANSWER_STEPS = [100, 300, 500, 1000, 2000, 3000, 5000, 10000];
export const STREAK_STEPS = [3, 7, 14, 30, 60, 100];
export const DAYS_STEPS = [10, 30, 50, 100, 200, 365];
export const PCT_STEPS = [25, 50, 75, 100];

export interface Milestone {
  /** 祝福済み記録に使う安定ID（例: "answers:100" "unit:math/renritsu:50"） */
  id: string;
  emoji: string;
  label: string;
  /** 大きな祝福（結果画面で目立たせる） */
  big: boolean;
}

/** 達成度の分母（コンテンツの問題総数）。起動後にバックグラウンドで作る */
export interface ContentCounts {
  /** "subjectId/unitId" → 問題総数（レッスンは含めない） */
  unitTotals: Record<string, number>;
  subjectTotals: Record<string, number>;
  unitNames: Record<string, string>;
  subjectNames: Record<string, string>;
  /** setId → "subjectId/unitId"（レッスンセットは含めない） */
  setToUnit: Record<string, string>;
  /** setId → 問題数（テスト範囲の達成度計算用） */
  setTotals: Record<string, number>;
}

export function buildContentCounts(
  index: ContentIndex,
  sets: Record<string, QuestionSet>
): ContentCounts {
  const counts: ContentCounts = {
    unitTotals: {},
    subjectTotals: {},
    unitNames: {},
    subjectNames: {},
    setToUnit: {},
    setTotals: {},
  };
  for (const subject of index.subjects) {
    counts.subjectNames[subject.id] = subject.name;
    for (const unit of subject.units) {
      const unitKey = `${subject.id}/${unit.id}`;
      counts.unitNames[unitKey] = unit.name;
      for (const meta of unit.sets) {
        // レッスンは復習リストに入らない（達成できない）ため分母から除外
        if (meta.kind === "lesson") continue;
        const set = sets[meta.id];
        if (!set) continue;
        const n = set.questions?.length ?? 0;
        counts.unitTotals[unitKey] = (counts.unitTotals[unitKey] ?? 0) + n;
        counts.subjectTotals[subject.id] =
          (counts.subjectTotals[subject.id] ?? 0) + n;
        counts.setToUnit[meta.id] = unitKey;
        counts.setTotals[meta.id] = n;
      }
    }
  }
  return counts;
}

/** 一度でも正解した問題数（達成度の分子）。setIds を限定して数える */
export function achievedCount(
  state: AppState,
  setIds: (setId: string) => boolean
): number {
  let n = 0;
  for (const [, stat] of Object.entries(state.questionStats)) {
    if (stat.correct > 0 && setIds(stat.setId)) n++;
  }
  return n;
}

/** 達成度%（0-100・切り捨て）。分母0なら null */
export function achievementPct(achieved: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.floor((achieved / total) * 100);
}

function crossed(before: number, after: number, steps: number[]): number[] {
  return steps.filter((s) => before < s && after >= s);
}

/** 累計解答数（リトライ・わからない込み。historyの総和） */
export function totalAnswers(state: AppState): number {
  let n = 0;
  for (const day of Object.values(state.history)) {
    for (const q of Object.values(day)) {
      n += q.correct + q.wrong + (q.dontKnow ?? 0);
    }
  }
  return n;
}

/** 直近7日（今日を含む）の取組回数 */
export function weekAnswers(state: AppState): number {
  let n = 0;
  const today = new Date(`${todayKey()}T00:00:00`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const log = state.dailyLog[key];
    if (log) n += log.answered;
  }
  return n;
}

/** 取り組んだ（1問以上解答した）単元数・教科数 */
export function touchedCounts(
  state: AppState,
  counts: ContentCounts | null
): { units: number; subjects: number } {
  if (!counts) return { units: 0, subjects: 0 };
  const units = new Set<string>();
  for (const stat of Object.values(state.questionStats)) {
    const u = counts.setToUnit[stat.setId];
    if (u) units.add(u);
  }
  return {
    units: units.size,
    subjects: new Set([...units].map((u) => u.split("/")[0])).size,
  };
}

export interface AnswerContext {
  setId: string;
  questionId: string;
  correct: boolean;
  counts: ContentCounts | null;
}

/**
 * この解答で新たに跨ぐ節目を列挙する（祝福済みは除外）。
 * state は解答「前」の状態を渡すこと。
 */
export function answeredMilestones(
  state: AppState,
  ctx: AnswerContext
): Milestone[] {
  const result: Milestone[] = [];
  const today = todayKey();

  // 努力系: 累計解答数
  const before = totalAnswers(state);
  for (const s of crossed(before, before + 1, ANSWER_STEPS)) {
    result.push({
      id: `answers:${s}`,
      emoji: "✏️",
      label: `累計${s}問に到達！`,
      big: s >= 1000,
    });
  }

  // 努力系: streak（今日はじめての解答で更新される）
  const { count, lastDate } = state.streak;
  if (lastDate !== today) {
    const gap =
      lastDate === ""
        ? Infinity
        : Math.round(
            (new Date(`${today}T00:00:00`).getTime() -
              new Date(`${lastDate}T00:00:00`).getTime()) /
              86400000
          );
    const after = gap === 1 ? count + 1 : 1;
    const beforeStreak = gap === 1 ? count : 0;
    for (const s of crossed(beforeStreak, after, STREAK_STEPS)) {
      result.push({
        id: `streak:${s}`,
        emoji: "🔥",
        label: `${s}日連続で学習！`,
        big: s >= 30,
      });
    }
  }

  // 努力系: 累計学習日数
  const daysBefore = Object.keys(state.dailyLog).length;
  const daysAfter = state.dailyLog[today] ? daysBefore : daysBefore + 1;
  for (const s of crossed(daysBefore, daysAfter, DAYS_STEPS)) {
    result.push({
      id: `days:${s}`,
      emoji: "📅",
      label: `学習${s}日目！`,
      big: s >= 100,
    });
  }

  // 達成度系: 単元・教科の25/50/75/100%（初めて正解した問題だけが分子を動かす）
  const key = `${ctx.setId}/${ctx.questionId}`;
  const firstCorrect =
    ctx.correct && !(state.questionStats[key]?.correct > 0);
  if (firstCorrect && ctx.counts) {
    const unitKey = ctx.counts.setToUnit[ctx.setId];
    if (unitKey) {
      const subjectId = unitKey.split("/")[0];
      const inUnit = (sid: string) => ctx.counts!.setToUnit[sid] === unitKey;
      const inSubject = (sid: string) =>
        ctx.counts!.setToUnit[sid]?.startsWith(`${subjectId}/`) ?? false;

      const uBefore = achievementPct(
        achievedCount(state, inUnit),
        ctx.counts.unitTotals[unitKey] ?? 0
      );
      const uAfter = achievementPct(
        achievedCount(state, inUnit) + 1,
        ctx.counts.unitTotals[unitKey] ?? 0
      );
      if (uBefore !== null && uAfter !== null) {
        for (const s of crossed(uBefore, uAfter, PCT_STEPS)) {
          result.push({
            id: `unit:${unitKey}:${s}`,
            emoji: s === 100 ? "🏆" : "⭐",
            label: `「${ctx.counts.unitNames[unitKey]}」達成度${s}%！`,
            big: s === 100,
          });
        }
      }

      const sBefore = achievementPct(
        achievedCount(state, inSubject),
        ctx.counts.subjectTotals[subjectId] ?? 0
      );
      const sAfter = achievementPct(
        achievedCount(state, inSubject) + 1,
        ctx.counts.subjectTotals[subjectId] ?? 0
      );
      if (sBefore !== null && sAfter !== null) {
        for (const s of crossed(sBefore, sAfter, PCT_STEPS)) {
          result.push({
            id: `subject:${subjectId}:${s}`,
            emoji: s === 100 ? "👑" : "🌟",
            label: `${ctx.counts.subjectNames[subjectId]}の達成度${s}%！`,
            big: s >= 75,
          });
        }
      }
    }
  }

  // 祝福は跨いだ瞬間に一度だけ
  return result.filter((m) => !state.celebrated.includes(m.id));
}

/** 祝福済みIDからバッジ表示を復元する（Stats のバッジ棚用） */
export function describeMilestone(
  id: string,
  counts: ContentCounts | null
): Milestone | null {
  const [kind, a, b] = id.split(":");
  const n = Number(kind === "unit" || kind === "subject" ? b : a);
  switch (kind) {
    case "answers":
      return { id, emoji: "✏️", label: `累計${n}問`, big: n >= 1000 };
    case "streak":
      return { id, emoji: "🔥", label: `${n}日連続`, big: n >= 30 };
    case "days":
      return { id, emoji: "📅", label: `学習${n}日`, big: n >= 100 };
    case "unit": {
      const name = counts?.unitNames[a] ?? a;
      return {
        id,
        emoji: n === 100 ? "🏆" : "⭐",
        label: `${name} ${n}%`,
        big: n === 100,
      };
    }
    case "subject": {
      const name = counts?.subjectNames[a] ?? a;
      return {
        id,
        emoji: n === 100 ? "👑" : "🌟",
        label: `${name} ${n}%`,
        big: n >= 75,
      };
    }
    case "skin": {
      // スキン解放の祝福（計画19）もバッジ棚に残す
      return {
        id,
        emoji: "🎁",
        label: `きせかえ「${skinById(a).name}」`,
        big: true,
      };
    }
    case "sugoroku": {
      // 単元すごろくの全マスクリア（計画33）
      const name = counts?.unitNames[a] ?? a;
      return { id, emoji: "🎲", label: `すごろく踏破: ${name}`, big: true };
    }
    default:
      return null;
  }
}
