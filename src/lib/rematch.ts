// 再戦イベント（計画30）
// 間違えた問題との再会を「弱点の消化」ではなく「成長確認イベント」にする。
// 再提示（同日中のリトライ・再出題）と再戦（翌日以降の再会）を分離し、
// 翌日以降の過去不正解問題にはどの経路（復習・通常セット）でも再戦フレームを付ける。
// ゲートが制御するのはホームの再戦カードの提示タイミングのみ
// （本人が Library・復習から自分で挑むことは妨げない）。

import type { QuizItem } from "../App";
import type { AppState, QuestionStat } from "./storage";

/** 1日の再戦カードに載せる最大数（消化ノルマ化＝「借金返済」を防ぐ） */
export const REMATCH_PER_DAY = 3;
/** concept 未設定の問題のゲート代替: 失敗から中3日以上（= 4日以上後） */
export const REMATCH_GAP_DAYS = 4;

export interface RematchInfo {
  /** 失敗から何日前か（「○日前はとけなかった問題」表示用） */
  daysAgo: number;
}

export interface RematchCandidate {
  /** "setId/questionId" */
  qkey: string;
  /** 失敗日 "YYYY-MM-DD"（直近の解答=不正解の日） */
  failedAt: string;
  concept?: string;
  /** 同セット・同単元レッスンの完走日時（ISO）。失敗後に演習を挟んだ証拠 */
  relatedDoneAt?: string[];
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) /
      86400000
  );
}

/**
 * 再戦ゲート: 「また負ける」体験を避け、解ける見込みが立ってから出す。
 * - concept あり: 失敗後にヒントなし正解がある（ラダーが押し上がっている証拠）、
 *   または失敗後に関連演習・レッスンを完走している
 * - concept なし: 日数経過のみで代替（中3日以上）
 * 同日中は再提示の領分なので対象外
 */
export function rematchReady(
  c: RematchCandidate,
  state: AppState,
  today: string
): boolean {
  if (c.failedAt >= today) return false;
  if (c.concept) {
    const m = state.mastery[c.concept];
    if (m && m.lastCorrectDate > c.failedAt) return true;
    return (c.relatedDoneAt ?? []).some((at) => at.slice(0, 10) > c.failedAt);
  }
  return daysBetween(c.failedAt, today) >= REMATCH_GAP_DAYS;
}

/** ホームの再戦カードに載せる問題（古い失敗から少数だけ） */
export function pickRematches(
  candidates: RematchCandidate[],
  state: AppState,
  today: string,
  max = REMATCH_PER_DAY
): RematchCandidate[] {
  return candidates
    .filter((c) => rematchReady(c, state, today))
    .sort((a, b) => a.failedAt.localeCompare(b.failedAt))
    .slice(0, max);
}

/**
 * 翌日以降に再会する過去不正解問題なら再戦情報を返す。
 * 同日中（再提示）と正解済みの問題は対象外
 */
export function rematchTag(
  stat: QuestionStat | undefined,
  today: string
): RematchInfo | null {
  if (!stat || stat.lastCorrect) return null;
  const failedAt = stat.updatedAt.slice(0, 10);
  if (!failedAt || failedAt >= today) return null;
  return { daysAgo: daysBetween(failedAt, today) };
}

/**
 * 出題リストの過去不正解問題に再戦フレームを付ける。
 * どの経路（復習・通常セット）で再会しても同じ扱い = 別の出題キューを作らない
 */
export function tagRematchItems(
  items: QuizItem[],
  stats: Record<string, QuestionStat>,
  today: string
): QuizItem[] {
  return items.map((it) => {
    const tag = rematchTag(stats[`${it.setId}/${it.question.id}`], today);
    return tag ? { ...it, rematch: tag } : it;
  });
}
