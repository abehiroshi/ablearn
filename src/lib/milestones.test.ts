import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppState, emptyState, todayKey } from "./storage";
import {
  ContentCounts,
  achievementPct,
  achievedCount,
  answeredMilestones,
  describeMilestone,
  totalAnswers,
} from "./milestones";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-12T12:00:00"));
});
afterEach(() => vi.useRealTimers());

const COUNTS: ContentCounts = {
  unitTotals: { "math/u1": 4 },
  subjectTotals: { math: 4 },
  unitNames: { "math/u1": "式の計算" },
  subjectNames: { math: "数学" },
  setToUnit: { s1: "math/u1" },
  setTotals: { s1: 4 },
};

function withHistoryAnswers(n: number): AppState {
  // 累計 n 解答ぶんの履歴を作る
  const s = emptyState();
  s.history = {
    "2026-06-10": {
      "s1/q0": { correct: n, wrong: 0, dontKnow: 0, hints: 0, timeMs: 0 },
    },
  };
  return s;
}

describe("answeredMilestones: 累積型の境界値", () => {
  it("ちょうど100問目で answers:100 を跨ぐ（99問目では出ない）", () => {
    const at98 = withHistoryAnswers(98);
    expect(
      answeredMilestones(at98, { setId: "s1", questionId: "q1", correct: true, counts: null })
        .map((m) => m.id)
    ).not.toContain("answers:100");
    const at99 = withHistoryAnswers(99);
    expect(
      answeredMilestones(at99, { setId: "s1", questionId: "q1", correct: true, counts: null })
        .map((m) => m.id)
    ).toContain("answers:100");
  });

  it("祝福済みの節目は二度出ない", () => {
    const s = withHistoryAnswers(99);
    s.celebrated = ["answers:100"];
    expect(
      answeredMilestones(s, { setId: "s1", questionId: "q1", correct: true, counts: null })
    ).toEqual([]);
  });

  it("streak の節目は今日はじめての解答で跨ぐ", () => {
    const s = emptyState();
    s.streak = { count: 2, lastDate: "2026-06-11" }; // 昨日まで2日連続
    const ids = answeredMilestones(s, {
      setId: "s1", questionId: "q1", correct: false, counts: null,
    }).map((m) => m.id);
    expect(ids).toContain("streak:3");
    // 同日2回目（lastDate=今日）は出ない
    s.streak = { count: 3, lastDate: todayKey() };
    expect(
      answeredMilestones(s, { setId: "s1", questionId: "q1", correct: false, counts: null })
    ).toEqual([]);
  });
});

describe("answeredMilestones: 達成度型", () => {
  it("25%ちょうどを初正解で跨ぐ（4問中1問目 = 25%）", () => {
    const s = emptyState();
    const ids = answeredMilestones(s, {
      setId: "s1", questionId: "q1", correct: true, counts: COUNTS,
    }).map((m) => m.id);
    expect(ids).toContain("unit:math/u1:25");
    expect(ids).toContain("subject:math:25");
  });

  it("正解済みの問題をもう一度正解しても達成度は動かない", () => {
    const s = emptyState();
    s.questionStats = {
      "s1/q1": { setId: "s1", correct: 1, wrong: 0, lastCorrect: true, updatedAt: "" },
    };
    const ids = answeredMilestones(s, {
      setId: "s1", questionId: "q1", correct: true, counts: COUNTS,
    }).map((m) => m.id);
    expect(ids.filter((id) => id.startsWith("unit:"))).toEqual([]);
  });

  it("不正解では達成度の節目は出ない（％は下がらない）", () => {
    const s = emptyState();
    const ids = answeredMilestones(s, {
      setId: "s1", questionId: "q1", correct: false, counts: COUNTS,
    }).map((m) => m.id);
    expect(ids.filter((id) => id.startsWith("unit:"))).toEqual([]);
  });

  it("最後の1問で100%を跨ぐ", () => {
    const s = emptyState();
    s.questionStats = Object.fromEntries(
      ["q1", "q2", "q3"].map((q) => [
        `s1/${q}`,
        { setId: "s1", correct: 1, wrong: 2, lastCorrect: true, updatedAt: "" },
      ])
    );
    const ids = answeredMilestones(s, {
      setId: "s1", questionId: "q4", correct: true, counts: COUNTS,
    }).map((m) => m.id);
    expect(ids).toContain("unit:math/u1:100");
    expect(ids).toContain("subject:math:100");
  });
});

describe("達成度は単調増加", () => {
  it("不正解を重ねても一度正解した問題の数は減らない", () => {
    const s = emptyState();
    s.questionStats = {
      "s1/q1": { setId: "s1", correct: 1, wrong: 5, lastCorrect: false, updatedAt: "" },
    };
    expect(achievedCount(s, (sid) => sid === "s1")).toBe(1);
    expect(achievementPct(1, 4)).toBe(25);
  });
});

describe("describeMilestone / totalAnswers", () => {
  it("祝福済みIDからバッジ表示を復元できる", () => {
    expect(describeMilestone("answers:100", null)?.label).toContain("100");
    expect(describeMilestone("unit:math/u1:50", COUNTS)?.label).toContain("式の計算");
    expect(describeMilestone("skin:skin1", null)?.label).toContain("きせかえ");
    expect(describeMilestone("unknown:1", null)).toBeNull();
  });

  it("totalAnswers はリトライ・わからない込み", () => {
    const s = emptyState();
    s.history = {
      "2026-06-10": {
        "s1/q1": { correct: 1, wrong: 2, dontKnow: 1, hints: 0, timeMs: 0 },
      },
    };
    expect(totalAnswers(s)).toBe(4);
  });
});
