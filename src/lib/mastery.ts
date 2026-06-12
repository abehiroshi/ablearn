// 習熟度エンジン（計画12・25）
// 概念（concept）ごとに「写経段 → choice段 → input段 → 応用段」の階段を実績で昇降格する。
// 写経段は level -1（計画25）。保存済みデータの level 0〜2 の意味は変えない（後方互換）。
// 統計モデルは使わない（1人用・この問題数では単純な階段で足りる）。

import type { Question } from "../types";
import type { QuizItem } from "../App";
import type { AppState, QuestionStat } from "./storage";

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) /
      86400000
  );
}

export const MAX_LEVEL = 2;
/** 写経段（計画25）。choice 段より下の「答えを見ながら打つ」段 */
export const TRACE_LEVEL = -1;
/** choice 段での連続不正解がこの回数に達したら写経段へ降格 */
export const DEMOTE_TO_TRACE_WRONGS = 2;
/** 昇格に必要なヒントなし正解の連続回数 */
export const PROMOTE_STREAK = 2;
/** 「中2日以上空ける」= 前回のヒントなし正解から3日以上後（調整可能な定数） */
export const PROMOTE_GAP_DAYS = 3;
/** 段ごとの定着確認の間隔（日）。正解するたびに次の確認日を先送りする */
export const REVIEW_INTERVALS = [3, 7, 14];

/** 本人向けの段位ラベル（level 0/1/2） */
export const RANK_LABELS = ["4択でできる", "自力で解ける", "応用もできる"];
/** 写経段（level -1）のラベル */
export const TRACE_LABEL = "見ながら書ける";

export interface ConceptMastery {
  /** -1=写経段 / 0=choice段 / 1=input段 / 2=応用段 */
  level: number;
  /** 現在段でのヒントなし正解の連続数 */
  streak: number;
  /**
   * 連続不正解数（写経段への降格判定用。計画25）。
   * 計画25より前の保存データには無いので利用側は ?? 0 で読む
   */
  wrongStreak?: number;
  /** 最後にヒントなし正解した日 "YYYY-MM-DD" */
  lastCorrectDate: string;
  /** 定着確認の時期（間隔反復）。この日以降はおすすめで優先される */
  dueDate: string;
  /** この概念を最後に解いたセット（おすすめの導線用） */
  setId: string;
}

export function emptyMastery(): ConceptMastery {
  return { level: 0, streak: 0, lastCorrectDate: "", dueDate: "", setId: "" };
}

/** 定着確認の間隔。写経段（負の level）は choice 段と同じ扱い */
function reviewInterval(level: number): number {
  return REVIEW_INTERVALS[Math.max(0, level)];
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface AnswerSignal {
  correct: boolean;
  dontKnow: boolean;
  hintsUsed: number;
  /** その問題が持つヒントの総数（「最後まで使った」判定用） */
  hintsTotal: number;
  /** 写経の完了（計画25）。覚えた証明ではないので正解の連続には数えない */
  trace?: boolean;
  /**
   * 実際に解答した形式（計画34）。choice⇔input の手動切替で提示形式と
   * 食い違うことがある。未指定は提示形式どおり＝従来動作
   */
  form?: "choice" | "input";
  today: string; // "YYYY-MM-DD"
}

/** 段が要求する形式の強さ（level 0 以下 = choice系 0 / level 1 以上 = input系 1） */
function stageForm(level: number): number {
  return level >= 1 ? 1 : 0;
}

/**
 * 1解答を習熟度に反映する。
 * - 写経完了: choice 段へ進む（すでに choice 段以上なら維持）。翌日に再確認
 * - 降格: 不正解 / わからない / ヒントを最後まで使った正解。
 *   choice 段で連続 DEMOTE_TO_TRACE_WRONGS 回なら写経段へ
 * - 昇格: ヒントなし正解が PROMOTE_STREAK 回連続、かつ前回正解から間隔が空いている
 * - ヒント途中までの正解: 段は維持、連続は切れる
 * 解答時間は使わない（速さを評価すると雑に答える誘因になる）
 */
export function applyAnswer(
  m: ConceptMastery,
  sig: AnswerSignal
): ConceptMastery {
  if (sig.trace) {
    return {
      ...m,
      level: Math.max(0, m.level),
      streak: 0,
      wrongStreak: 0,
      dueDate: addDays(sig.today, 1), // 見ながら打っただけなので早めに確認
    };
  }
  const usedAllHints = sig.hintsTotal > 0 && sig.hintsUsed >= sig.hintsTotal;
  if (!sig.correct || sig.dontKnow || usedAllHints) {
    const wrongStreak = (m.wrongStreak ?? 0) + 1;
    const level =
      m.level > 0
        ? m.level - 1
        : m.level === 0 && wrongStreak >= DEMOTE_TO_TRACE_WRONGS
          ? TRACE_LEVEL
          : m.level;
    return {
      ...m,
      level,
      streak: 0,
      wrongStreak,
      dueDate: addDays(sig.today, 1), // 早めに再確認
    };
  }
  if (sig.hintsUsed > 0) {
    return {
      ...m,
      streak: 0,
      wrongStreak: 0,
      dueDate: addDays(sig.today, reviewInterval(m.level)),
    };
  }
  // 解答形式ベースの証拠（計画34）: 現在の段が要求する形式より下の形式で解いた正解は
  // その段の証拠にならない（昇格の連続を進めない・降格もしない＝ズルにも罰にもならない）。
  // 例: input 段の問題を choice に切り替えて正解 → choice 段の証拠どまり
  if (sig.form && (sig.form === "input" ? 1 : 0) < stageForm(m.level)) {
    return {
      ...m,
      wrongStreak: 0,
      dueDate: addDays(sig.today, reviewInterval(m.level)),
    };
  }
  // ヒントなし正解
  const streak = m.streak + 1;
  const gapOk =
    m.lastCorrectDate === "" ||
    daysBetween(m.lastCorrectDate, sig.today) >= PROMOTE_GAP_DAYS;
  if (streak >= PROMOTE_STREAK && gapOk && m.level < MAX_LEVEL) {
    const level = m.level + 1;
    return {
      ...m,
      level,
      streak: 0,
      wrongStreak: 0,
      lastCorrectDate: sig.today,
      dueDate: addDays(sig.today, reviewInterval(level)),
    };
  }
  return {
    ...m,
    streak,
    wrongStreak: 0,
    lastCorrectDate: sig.today,
    dueDate: addDays(sig.today, reviewInterval(m.level)),
  };
}

/**
 * まだ習熟度が保存されていない概念の初期値を既存の成績から推定する。
 * - 全変種が直近正解で合計2回以上正解していれば input 段から始める
 * - どの変種にも解答実績が無い完全な初見は写経段から始める（計画25）
 */
export function deriveInitialMastery(
  questionKeys: string[],
  stats: Record<string, QuestionStat>
): ConceptMastery {
  let total = 0;
  let anyStat = false;
  let allLastCorrect = questionKeys.length > 0;
  let lastDate = "";
  for (const key of questionKeys) {
    const s = stats[key];
    if (!s || !s.lastCorrect) allLastCorrect = false;
    if (s) {
      anyStat = true;
      total += s.correct;
      const day = s.updatedAt.slice(0, 10);
      if (day > lastDate) lastDate = day;
    }
  }
  if (allLastCorrect && total >= 2) {
    return { ...emptyMastery(), level: 1, lastCorrectDate: lastDate };
  }
  if (!anyStat) {
    return { ...emptyMastery(), level: TRACE_LEVEL };
  }
  return emptyMastery();
}

/** 変種がどの段の出題に向くか */
function stageOf(q: Question): number {
  if ((q.difficulty ?? 2) >= 3) return 2; // 応用
  if (q.type === "choice") return 0;
  return 1; // input / order / flashcard = 自力系
}

/** 写経（答えを見ながら打つ）として出せる変種か（計画25） */
function traceable(q: Question): boolean {
  if ((q.difficulty ?? 2) >= 3) return false; // 応用は写経にしない
  if (q.type === "input") return q.answers.length > 0;
  if (q.type === "choice") return !!q.answers && q.answers.length > 0;
  return false; // flashcard / order は対象外
}

/** 現在段に合った変種を1つ選ぶ。無ければ下の段へフォールバック */
function pickVariant(
  variants: Question[],
  level: number,
  setId: string
): QuizItem {
  if (level < 0) {
    // 写経段: answers を持つ最も易しい変種を写経モードで出す。
    // 写経にできる変種が無い概念は choice 段の出題へフォールバック
    const cands = variants
      .filter(traceable)
      .sort((a, b) => (a.difficulty ?? 2) - (b.difficulty ?? 2));
    if (cands.length > 0) {
      return {
        question: cands[0],
        setId,
        asTrace: true,
        asInput: cands[0].type === "choice" ? true : undefined,
      };
    }
  }
  for (let l = Math.max(0, level); l >= 0; l--) {
    if (l === 1) {
      const inputs = variants.filter((v) => stageOf(v) === 1);
      if (inputs.length > 0) return { question: inputs[0], setId };
      // input 変種が無くても answers つき choice なら自力入力で出せる
      const convertible = variants.find(
        (v) => v.type === "choice" && v.answers && v.answers.length > 0
      );
      if (convertible) return { question: convertible, setId, asInput: true };
      continue;
    }
    const vs = variants.filter((v) => stageOf(v) === l);
    if (vs.length > 0) return { question: vs[0], setId };
  }
  return { question: variants[0], setId };
}

/**
 * セットの問題列から出題リストを作る。
 * concept を持つ問題群（ラダー）は現在段に合った変種1問に絞り、
 * concept 未設定の問題は従来どおりそのまま出す（後方互換）。
 */
export function buildAdaptiveItems(
  questions: Question[],
  setId: string,
  state: AppState
): QuizItem[] {
  const groups = new Map<string, Question[]>();
  for (const q of questions) {
    if (!q.concept) continue;
    if (!groups.has(q.concept)) groups.set(q.concept, []);
    groups.get(q.concept)!.push(q);
  }

  const items: QuizItem[] = [];
  const used = new Set<string>();
  for (const q of questions) {
    if (!q.concept) {
      items.push({ question: q, setId });
      continue;
    }
    if (used.has(q.concept)) continue;
    used.add(q.concept);
    const variants = groups.get(q.concept)!;
    const m =
      state.mastery[q.concept] ??
      deriveInitialMastery(
        variants.map((v) => `${setId}/${v.id}`),
        state.questionStats
      );
    items.push(pickVariant(variants, m.level, setId));
  }
  return items;
}

/** 定着確認の時期が来た概念が属するセットID群（おすすめの優先度に使う） */
export function dueSetIds(state: AppState, today: string): Set<string> {
  const ids = new Set<string>();
  for (const m of Object.values(state.mastery)) {
    if (m.dueDate && m.dueDate <= today && m.setId) ids.add(m.setId);
  }
  return ids;
}

/**
 * ヒント開示方法のおすすめ（計画31。さりげない強調＝デフォルトフォーカス用）。
 * 初見・低い段は worked-example 的に「全部見る」、段が上がったら探究の「少しずつ」を推す。
 * 2択自体は常に出し、選ぶのは本人
 */
export function recommendHintStyle(
  m: ConceptMastery | undefined
): "step" | "full" {
  return m && m.level >= 1 ? "step" : "full";
}

/** 段位ごとの概念数（Stats の簡素な表示用）。index 0 = 写経段、以降 level+1 */
export function rankCounts(state: AppState): number[] {
  const counts = [0, 0, 0, 0];
  for (const m of Object.values(state.mastery)) {
    const level = Math.max(TRACE_LEVEL, Math.min(m.level, MAX_LEVEL));
    counts[level + 1]++;
  }
  return counts;
}
