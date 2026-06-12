import { describe, expect, it } from "vitest";
import type { QuizItem } from "../App";
import {
  REMATCH_GAP_DAYS,
  REMATCH_PER_DAY,
  RematchCandidate,
  pickRematches,
  rematchReady,
  rematchTag,
  tagRematchItems,
} from "./rematch";
import { emptyState, QuestionStat } from "./storage";
import { emptyMastery } from "./mastery";

const TODAY = "2026-06-12";

function stat(overrides: Partial<QuestionStat>): QuestionStat {
  return {
    setId: "s1",
    correct: 0,
    wrong: 1,
    lastCorrect: false,
    updatedAt: "2026-06-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("再戦ゲート（受け入れ条件2）", () => {
  it("concept あり: ラダーが押し上がる（失敗後のヒントなし正解）まで出ない", () => {
    const s = emptyState();
    const c: RematchCandidate = {
      qkey: "s1/q1",
      failedAt: "2026-06-08",
      concept: "c1",
    };
    // 進展なし → 出ない
    expect(rematchReady(c, s, TODAY)).toBe(false);
    // 失敗より前の正解 → 出ない
    s.mastery["c1"] = { ...emptyMastery(), lastCorrectDate: "2026-06-07" };
    expect(rematchReady(c, s, TODAY)).toBe(false);
    // 失敗後のヒントなし正解（別の変種で段が押し上がっている証拠） → 出る
    s.mastery["c1"] = { ...emptyMastery(), lastCorrectDate: "2026-06-10" };
    expect(rematchReady(c, s, TODAY)).toBe(true);
  });

  it("concept あり: 失敗後に関連演習・レッスンを挟んでいれば出る", () => {
    const s = emptyState();
    const c: RematchCandidate = {
      qkey: "s1/q1",
      failedAt: "2026-06-08",
      concept: "c1",
      relatedDoneAt: ["2026-06-10T09:00:00.000Z"],
    };
    expect(rematchReady(c, s, TODAY)).toBe(true);
    // 失敗と同日以前の完走は証拠にならない
    c.relatedDoneAt = ["2026-06-08T09:00:00.000Z"];
    expect(rematchReady(c, s, TODAY)).toBe(false);
  });

  it("concept なし: 日数経過（中3日以上）のみで代替", () => {
    const s = emptyState();
    const c: RematchCandidate = { qkey: "s1/q1", failedAt: "2026-06-09" };
    expect(rematchReady(c, s, TODAY)).toBe(false); // 3日後はまだ
    c.failedAt = "2026-06-08";
    expect(rematchReady(c, s, TODAY)).toBe(true); // 4日後（中3日）
    expect(REMATCH_GAP_DAYS).toBe(4);
  });

  it("同日中の失敗は再提示の領分（再戦に出ない）", () => {
    const s = emptyState();
    s.mastery["c1"] = { ...emptyMastery(), lastCorrectDate: TODAY };
    const c: RematchCandidate = {
      qkey: "s1/q1",
      failedAt: TODAY,
      concept: "c1",
    };
    expect(rematchReady(c, s, TODAY)).toBe(false);
  });
});

describe("再戦カードの選定", () => {
  it("古い失敗から少数（REMATCH_PER_DAY）に絞る＝借金返済化しない", () => {
    const s = emptyState();
    const cands: RematchCandidate[] = ["06-01", "06-04", "06-02", "06-03"].map(
      (d, i) => ({ qkey: `s1/q${i}`, failedAt: `2026-${d}` })
    );
    const picked = pickRematches(cands, s, TODAY);
    expect(picked).toHaveLength(REMATCH_PER_DAY);
    expect(picked.map((c) => c.failedAt)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
  });

  it("ゲートを満たさない候補は選ばれない", () => {
    const s = emptyState();
    const cands: RematchCandidate[] = [
      { qkey: "s1/q1", failedAt: "2026-06-01" }, // 日数OK
      { qkey: "s1/q2", failedAt: "2026-06-10", concept: "c1" }, // 進展なし
    ];
    expect(pickRematches(cands, s, TODAY).map((c) => c.qkey)).toEqual([
      "s1/q1",
    ]);
  });
});

describe("再戦フレーム（受け入れ条件1）", () => {
  it("翌日以降の過去不正解問題にだけ付く（同日中の再提示・正解済みは対象外）", () => {
    expect(
      rematchTag(stat({ updatedAt: "2026-06-08T10:00:00.000Z" }), TODAY)
    ).toEqual({ daysAgo: 4 });
    // 同日中 → 再提示の領分
    expect(
      rematchTag(stat({ updatedAt: `${TODAY}T10:00:00.000Z` }), TODAY)
    ).toBeNull();
    // 正解済み → 対象外
    expect(rematchTag(stat({ lastCorrect: true }), TODAY)).toBeNull();
    // 未解答 → 対象外
    expect(rematchTag(undefined, TODAY)).toBeNull();
  });

  it("出題リストのどの経路でも同じタグが付く（二重出題の仕組みを作らない）", () => {
    const items: QuizItem[] = [
      { question: { id: "q1", type: "input", question: "", answers: ["a"] }, setId: "s1" },
      { question: { id: "q2", type: "input", question: "", answers: ["a"] }, setId: "s1" },
    ];
    const stats = {
      "s1/q1": stat({}),
      "s1/q2": stat({ lastCorrect: true }),
    };
    const tagged = tagRematchItems(items, stats, TODAY);
    expect(tagged[0].rematch).toEqual({ daysAgo: 4 });
    expect(tagged[1].rematch).toBeUndefined();
  });
});
