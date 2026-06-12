// 週間目標と今日の課題（計画28）。
// 本人が選んだ週単位の目標（最大3つ）から「今日の課題」を自動生成する。
// 進捗はすべて既存の記録（dailyLog / history / setRecords / questionStats / mockResults）
// から計算し、新しい記録は持たない。週は月曜始まり。未達の週は静かに流す。

import type { AppState } from "./storage";
import type { Milestone } from "./milestones";
import { achievedCount, achievementPct } from "./milestones";

export const MAX_GOALS = 3;

/** 選択状態（AppState.goals）。変更はいつでも可・適用は翌週から */
export interface GoalsState {
  /** 今週適用中の目標ID */
  active: string[];
  /** 来週から適用する選択（null = 変更予約なし） */
  next: string[] | null;
  /** active を適用した週の月曜 "YYYY-MM-DD"（空 = 未選択） */
  weekStart: string;
  /** 「目標を選ぶと今日の課題が出るよ」案内を消したか */
  introDismissed: boolean;
}

export function emptyGoals(): GoalsState {
  return { active: [], next: null, weekStart: "", introDismissed: false };
}

// ===== 週ヘルパ（月曜始まり） =====

export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const dow = d.getDay(); // 0=日
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function weekDaysOf(monday: string): string[] {
  const days: string[] = [];
  const d = new Date(`${monday}T00:00:00`);
  for (let i = 0; i < 7; i++) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    days.push(`${d.getFullYear()}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// ===== 目標カタログ（プリセットのみ。自由入力は持たない） =====

export interface GoalDef {
  id: string;
  mode: "daily" | "test";
  label: string;
  target: number;
}

export const GOAL_CATALOG: GoalDef[] = [
  // 日常モード用
  { id: "days-3", mode: "daily", label: "週に3日学習する", target: 3 },
  { id: "days-5", mode: "daily", label: "週に5日学習する", target: 5 },
  { id: "count-35", mode: "daily", label: "週に35問とく", target: 35 },
  { id: "count-70", mode: "daily", label: "週に70問とく", target: 70 },
  { id: "count-105", mode: "daily", label: "週に105問とく", target: 105 },
  { id: "review-10", mode: "daily", label: "にがてを10問やっつける", target: 10 },
  { id: "review-20", mode: "daily", label: "にがてを20問やっつける", target: 20 },
  { id: "subjects-3", mode: "daily", label: "3教科以上にさわる", target: 3 },
  { id: "lesson-1", mode: "daily", label: "レッスンを1本すすめる", target: 1 },
  { id: "lesson-2", mode: "daily", label: "レッスンを2本すすめる", target: 2 },
  // テストモード用（テスト登録中だけ提案される。常設の週目標の上に乗る）
  { id: "range-50", mode: "test", label: "範囲の達成度を50%にする", target: 50 },
  { id: "range-80", mode: "test", label: "範囲の達成度を80%にする", target: 80 },
  { id: "range-100", mode: "test", label: "範囲の達成度を100%にする", target: 100 },
  { id: "mock-1", mode: "test", label: "模擬テストを1回うける", target: 1 },
  { id: "mock-2", mode: "test", label: "模擬テストを2回うける", target: 2 },
  { id: "range-review-0", mode: "test", label: "範囲のにがてをゼロにする", target: 0 },
];

const defById = new Map(GOAL_CATALOG.map((d) => [d.id, d]));

export interface GoalContext {
  state: AppState;
  today: string; // "YYYY-MM-DD"
  /** setId → subjectId（教科の幅の計算用。無ければ幅系は 0 扱い） */
  setSubject?: (setId: string) => string | undefined;
  /** setId がレッスンか */
  isLesson?: (setId: string) => boolean;
  /** テスト範囲のセットID（テストモードでなければ null） */
  rangeSetIds?: string[] | null;
  /** setId → 問題総数（達成度系。counts 未ロード時は null） */
  setTotals?: Record<string, number> | null;
}

/** いま選べる目標（テスト登録中はテスト用が加わり、終了で日常用だけに戻る） */
export function availableGoals(ctx: GoalContext): GoalDef[] {
  const testMode = !!ctx.rangeSetIds && ctx.rangeSetIds.length > 0;
  return GOAL_CATALOG.filter((d) => d.mode === "daily" || testMode);
}

// ===== 進捗計算 =====

/**
 * 週内に「復習対象を解消した」問題数。
 * 日単位の履歴しか無いので「直前に活動した日が正解ゼロ（=要復習で終えた）問題を、
 * その後の日に正解した」を解消とみなす
 */
function resolvedInWeek(
  state: AppState,
  weekDays: string[],
  inSets?: (setId: string) => boolean
): number {
  const days = Object.keys(state.history).sort();
  const week = new Set(weekDays);
  // 問題ごとの「前日までの最終結果」（true=正解で終えた）
  const lastOutcome = new Map<string, boolean>();
  const resolved = new Set<string>();
  for (const day of days) {
    for (const [qkey, s] of Object.entries(state.history[day])) {
      if (inSets && !inSets(qkey.slice(0, qkey.indexOf("/")))) continue;
      const correct = s.correct > 0;
      if (week.has(day) && correct && lastOutcome.get(qkey) === false) {
        resolved.add(qkey);
      }
      lastOutcome.set(qkey, correct);
    }
  }
  return resolved.size;
}

export interface GoalProgress {
  def: GoalDef;
  current: number;
  target: number;
  /** 進捗バー用 0-100 */
  pct: number;
  achieved: boolean;
  /** 今日の課題（残量÷残り日数で動的に再計算）。達成済みなら null */
  todayTask: string | null;
}

/** 今日を含む週の残り日数（最低1） */
function daysLeft(weekDays: string[], today: string): number {
  return Math.max(1, weekDays.filter((d) => d >= today).length);
}

export function goalProgress(
  def: GoalDef,
  ctx: GoalContext
): GoalProgress | null {
  const weekDays = weekDaysOf(mondayOf(ctx.today));
  const left = daysLeft(weekDays, ctx.today);
  const { state } = ctx;
  let current = 0;
  let todayTask: string | null = null;
  let achieved: boolean;
  let pct: number;

  const perDay = (remaining: number) => Math.ceil(remaining / left);

  switch (def.id.split("-")[0]) {
    case "days": {
      current = weekDays.filter((d) => (state.dailyLog[d]?.answered ?? 0) > 0)
        .length;
      const todayDone = (state.dailyLog[ctx.today]?.answered ?? 0) > 0;
      todayTask = todayDone
        ? "きょうのぶんはクリア！"
        : "きょう1問でも学習する";
      break;
    }
    case "count": {
      current = weekDays.reduce(
        (n, d) => n + (state.dailyLog[d]?.answered ?? 0),
        0
      );
      todayTask = `きょうは ${perDay(def.target - current)} 問とこう`;
      break;
    }
    case "review": {
      current = resolvedInWeek(state, weekDays);
      todayTask = `きょうは にがてを ${perDay(def.target - current)} 問やっつけよう`;
      break;
    }
    case "subjects": {
      const subjects = new Set<string>();
      for (const d of weekDays) {
        for (const qkey of Object.keys(state.history[d] ?? {})) {
          const sub = ctx.setSubject?.(qkey.slice(0, qkey.indexOf("/")));
          if (sub) subjects.add(sub);
        }
      }
      current = subjects.size;
      todayTask = "きょうは別の教科にさわってみよう";
      break;
    }
    case "lesson": {
      let n = 0;
      for (const [setId, rec] of Object.entries(state.setRecords)) {
        if (!ctx.isLesson?.(setId)) continue;
        if (weekDays.includes(rec.lastAt.slice(0, 10))) n++;
      }
      current = n;
      todayTask = "きょうレッスンを1本すすめよう";
      break;
    }
    case "range": {
      if (!ctx.rangeSetIds || !ctx.setTotals) return null;
      const range = new Set(ctx.rangeSetIds);
      if (def.id === "range-review-0") {
        // 範囲内の復習対象（直近不正解）の残り
        const remaining = Object.values(state.questionStats).filter(
          (s) => !s.lastCorrect && range.has(s.setId)
        ).length;
        current = remaining;
        const solved = resolvedInWeek(state, weekDays, (sid) => range.has(sid));
        achieved = remaining === 0;
        pct =
          remaining === 0
            ? 100
            : Math.floor((solved / (solved + remaining)) * 100);
        todayTask = achieved
          ? null
          : `きょうは ${perDay(remaining)} 問やっつけよう（のこり${remaining}問）`;
        return { def, current, target: 0, pct, achieved, todayTask };
      }
      let total = 0;
      for (const id of range) total += ctx.setTotals[id] ?? 0;
      const achievedQ = achievedCount(state, (sid) => range.has(sid));
      const p = achievementPct(achievedQ, total);
      if (p === null) return null;
      current = p;
      const remainingQ = Math.ceil((total * def.target) / 100) - achievedQ;
      todayTask =
        remainingQ > 0
          ? `きょうは新しく ${perDay(remainingQ)} 問正解しよう`
          : null;
      break;
    }
    case "mock": {
      current = state.mockResults.filter((r) =>
        weekDays.includes(r.at.slice(0, 10))
      ).length;
      todayTask = "模擬テストを1回うけてみよう";
      break;
    }
    default:
      return null;
  }

  achieved = current >= def.target;
  pct = Math.min(100, Math.floor((current / Math.max(1, def.target)) * 100));
  return {
    def,
    current,
    target: def.target,
    pct,
    achieved,
    todayTask: achieved ? null : todayTask,
  };
}

/** 選択中の目標の進捗一覧（提供できないもの＝終了したテスト用などは除く） */
export function activeGoalProgress(
  goals: GoalsState,
  ctx: GoalContext
): GoalProgress[] {
  const available = new Set(availableGoals(ctx).map((d) => d.id));
  const result: GoalProgress[] = [];
  for (const id of goals.active) {
    const def = defById.get(id);
    if (!def || !available.has(id)) continue;
    const p = goalProgress(def, ctx);
    if (p) result.push(p);
  }
  return result;
}

// ===== 選択と週替わり =====

/**
 * 目標を選び直す。未選択からの初回はすぐ適用、
 * すでに走っている週は翌週から適用（途中で下げて達成扱いにさせない）
 */
export function selectGoals(
  goals: GoalsState,
  ids: string[],
  today: string
): GoalsState {
  const picked = ids.filter((id) => defById.has(id)).slice(0, MAX_GOALS);
  if (goals.active.length === 0) {
    return {
      ...goals,
      active: picked,
      next: null,
      weekStart: mondayOf(today),
      introDismissed: true,
    };
  }
  const same =
    picked.length === goals.active.length &&
    picked.every((id) => goals.active.includes(id));
  return { ...goals, next: same ? null : picked };
}

/** 週が替わっていたら予約（next）を適用する。変化が無ければ同じ参照を返す */
export function rolloverGoals(goals: GoalsState, today: string): GoalsState {
  const monday = mondayOf(today);
  if (goals.weekStart === "" || goals.weekStart >= monday) return goals;
  return {
    ...goals,
    active: goals.next ?? goals.active,
    next: null,
    weekStart: monday,
  };
}

// ===== 祝福（計画18の節目システムに乗せる） =====

/**
 * 達成した週目標の節目を列挙する（祝福済みは除外）。
 * ID に週の月曜を含めるので、同じ週の再祝福は起きず、翌週はまた祝福できる
 */
export function goalMilestones(
  goals: GoalsState,
  ctx: GoalContext,
  celebrated: string[]
): Milestone[] {
  const monday = mondayOf(ctx.today);
  const result: Milestone[] = [];
  for (const p of activeGoalProgress(goals, ctx)) {
    if (!p.achieved) continue;
    const id = `goal:${p.def.id}:${monday}`;
    if (celebrated.includes(id)) continue;
    result.push({
      id,
      emoji: "🎯",
      label: `週の目標「${p.def.label}」たっせい！`,
      big: true,
    });
  }
  return result;
}

/** バッジ棚用: goal:<defId>:<週> の表示を復元する */
export function describeGoalMilestone(id: string): Milestone | null {
  const [kind, defId] = id.split(":");
  if (kind !== "goal") return null;
  const def = defById.get(defId);
  if (!def) return null;
  return { id, emoji: "🎯", label: `週目標: ${def.label}`, big: false };
}
