import { describe, expect, it } from "vitest";
import type { Question } from "../types";
import { emptyState } from "./storage";
import {
  ChallengeCandidate,
  GOAL_CATALOG,
  GoalContext,
  availableGoals,
  buildChallengeItems,
  challengeQuota,
  emptyGoals,
  goalMilestones,
  goalProgress,
  isChallengeQuestion,
  mondayOf,
  recommendedBundle,
  rolloverGoals,
  selectGoals,
  weekDaysOf,
} from "./goals";

const def = (id: string) => {
  const d = GOAL_CATALOG.find((g) => g.id === id);
  if (!d) throw new Error(`unknown goal ${id}`);
  return d;
};

function ctx(overrides: Partial<GoalContext> = {}): GoalContext {
  return { state: emptyState(), today: "2026-06-10", ...overrides }; // 水曜
}

describe("週ヘルパ（月曜始まり）", () => {
  it("mondayOf は週の月曜を返す（日曜は前週扱いではなく同じ週の最終日）", () => {
    expect(mondayOf("2026-06-10")).toBe("2026-06-08"); // 水→月
    expect(mondayOf("2026-06-08")).toBe("2026-06-08"); // 月→月
    expect(mondayOf("2026-06-14")).toBe("2026-06-08"); // 日→同じ週の月
    expect(mondayOf("2026-06-15")).toBe("2026-06-15"); // 翌週の月
  });

  it("weekDaysOf は月〜日の7日", () => {
    const days = weekDaysOf("2026-06-08");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-06-08");
    expect(days[6]).toBe("2026-06-14");
  });
});

describe("今日の課題の動的再計算（受け入れ条件2）", () => {
  it("週70問目標で月火さぼると水曜は「14問」に組み直される", () => {
    // 月火は記録なし。水曜時点: 残り70問÷残り5日（水木金土日）= 14問
    const p = goalProgress(def("count-70"), ctx())!;
    expect(p.current).toBe(0);
    expect(p.todayTask).toContain("14 問");
  });

  it("進んでいれば今日のぶんは軽くなる", () => {
    const s = emptyState();
    s.dailyLog["2026-06-08"] = { answered: 30, correct: 20, xp: 100 };
    s.dailyLog["2026-06-09"] = { answered: 20, correct: 15, xp: 80 };
    const p = goalProgress(def("count-70"), ctx({ state: s }))!;
    expect(p.current).toBe(50);
    expect(p.todayTask).toContain("4 問"); // (70-50)/5 = 4
  });

  it("先週の記録は今週に数えない", () => {
    const s = emptyState();
    s.dailyLog["2026-06-05"] = { answered: 100, correct: 90, xp: 500 }; // 先週金曜
    const p = goalProgress(def("count-35"), ctx({ state: s }))!;
    expect(p.current).toBe(0);
  });
});

describe("目標カタログの進捗", () => {
  it("days: 学習した日数を数え、今日やったかで課題が変わる", () => {
    const s = emptyState();
    s.dailyLog["2026-06-08"] = { answered: 5, correct: 5, xp: 50 };
    s.dailyLog["2026-06-10"] = { answered: 1, correct: 1, xp: 10 };
    const p = goalProgress(def("days-3"), ctx({ state: s }))!;
    expect(p.current).toBe(2);
    expect(p.todayTask).toContain("クリア");
  });

  it("review: 要復習で終えた問題をあとの日に正解したら「解消」", () => {
    const s = emptyState();
    // 月曜: s1/q1 を間違えたまま終了 → 火曜: 正解（解消）
    s.history["2026-06-08"] = {
      "s1/q1": { correct: 0, wrong: 2, dontKnow: 0, hints: 0, timeMs: 0 },
      "s1/q2": { correct: 1, wrong: 1, dontKnow: 0, hints: 0, timeMs: 0 }, // 正解で終えた → 対象外
    };
    s.history["2026-06-09"] = {
      "s1/q1": { correct: 1, wrong: 0, dontKnow: 0, hints: 0, timeMs: 0 },
      "s1/q2": { correct: 1, wrong: 0, dontKnow: 0, hints: 0, timeMs: 0 },
    };
    const p = goalProgress(def("review-10"), ctx({ state: s }))!;
    expect(p.current).toBe(1);
  });

  it("review: 先週間違えた問題を今週解消した場合も数える", () => {
    const s = emptyState();
    s.history["2026-06-05"] = {
      "s1/q1": { correct: 0, wrong: 1, dontKnow: 1, hints: 0, timeMs: 0 },
    };
    s.history["2026-06-09"] = {
      "s1/q1": { correct: 1, wrong: 0, dontKnow: 0, hints: 0, timeMs: 0 },
    };
    const p = goalProgress(def("review-10"), ctx({ state: s }))!;
    expect(p.current).toBe(1);
  });

  it("subjects: 週内にさわった教科数", () => {
    const s = emptyState();
    s.history["2026-06-09"] = {
      "math-a/q1": { correct: 1, wrong: 0, dontKnow: 0, hints: 0, timeMs: 0 },
      "eng-a/q1": { correct: 1, wrong: 0, dontKnow: 0, hints: 0, timeMs: 0 },
    };
    const subjectOf: Record<string, string> = { "math-a": "math", "eng-a": "english" };
    const p = goalProgress(
      def("subjects-3"),
      ctx({ state: s, setSubject: (id) => subjectOf[id] })
    )!;
    expect(p.current).toBe(2);
    expect(p.achieved).toBe(false);
  });

  it("lesson: 今週完走したレッスン数（setRecords の lastAt で判定）", () => {
    const s = emptyState();
    s.setRecords["math-lesson-a"] = {
      attempts: 1,
      best: 100,
      lastScore: 100,
      lastAt: "2026-06-09T10:00:00.000Z",
    };
    s.setRecords["math-drill"] = {
      attempts: 1,
      best: 100,
      lastScore: 100,
      lastAt: "2026-06-09T10:00:00.000Z",
    };
    const p = goalProgress(
      def("lesson-1"),
      ctx({ state: s, isLesson: (id) => id.includes("lesson") })
    )!;
    expect(p.current).toBe(1);
    expect(p.achieved).toBe(true);
  });

  it("range: テスト範囲の達成度%と「新しく正解する数」の日割り", () => {
    const s = emptyState();
    s.questionStats["s1/q1"] = {
      setId: "s1", correct: 1, wrong: 0, lastCorrect: true, updatedAt: "",
    };
    const p = goalProgress(
      def("range-50"),
      ctx({ state: s, rangeSetIds: ["s1"], setTotals: { s1: 10 } })
    )!;
    expect(p.current).toBe(10); // 1/10 = 10%
    // 50%には5問必要 → あと4問 ÷ 残り5日 = 1問/日
    expect(p.todayTask).toContain("1 問");
  });

  it("range-review-0: 範囲内の直近不正解の残りで判定", () => {
    const s = emptyState();
    s.questionStats["s1/q1"] = {
      setId: "s1", correct: 0, wrong: 1, lastCorrect: false, updatedAt: "",
    };
    s.questionStats["s2/q1"] = {
      setId: "s2", correct: 0, wrong: 1, lastCorrect: false, updatedAt: "",
    };
    const p = goalProgress(
      def("range-review-0"),
      ctx({ state: s, rangeSetIds: ["s1"], setTotals: { s1: 10 } })
    )!;
    expect(p.current).toBe(1); // 範囲外の s2 は数えない
    expect(p.achieved).toBe(false);
  });

  it("mock: 今週うけた模擬テストの回数", () => {
    const s = emptyState();
    s.mockResults = [
      { at: "2026-06-09T18:00:00.000Z", score: 70, correct: 7, total: 10, rangeLabel: "", durationMin: 20 },
      { at: "2026-06-01T18:00:00.000Z", score: 60, correct: 6, total: 10, rangeLabel: "", durationMin: 20 }, // 先週
    ];
    const p = goalProgress(
      def("mock-1"),
      ctx({ state: s, rangeSetIds: ["s1"], setTotals: {} })
    )!;
    expect(p.current).toBe(1);
    expect(p.achieved).toBe(true);
  });

  it("テスト用目標はテスト登録中だけ提案され、終了で日常用に戻る（受け入れ条件4）", () => {
    const daily = availableGoals(ctx());
    expect(daily.every((d) => d.mode === "daily")).toBe(true);
    const test = availableGoals(ctx({ rangeSetIds: ["s1"] }));
    expect(test.some((d) => d.mode === "test")).toBe(true);
  });
});

describe("選択と週替わり", () => {
  it("初回の選択はすぐ適用・案内も消える", () => {
    const g = selectGoals(emptyGoals(), ["count-70"], "2026-06-10");
    expect(g.active).toEqual(["count-70"]);
    expect(g.weekStart).toBe("2026-06-08");
    expect(g.introDismissed).toBe(true);
  });

  it("週の途中の変更は翌週から適用（下げて達成扱いにさせない）", () => {
    let g = selectGoals(emptyGoals(), ["count-70"], "2026-06-08");
    g = selectGoals(g, ["count-35"], "2026-06-10");
    expect(g.active).toEqual(["count-70"]); // 今週は変わらない
    expect(g.next).toEqual(["count-35"]);
    // 翌週月曜に適用される
    g = rolloverGoals(g, "2026-06-15");
    expect(g.active).toEqual(["count-35"]);
    expect(g.next).toBeNull();
    expect(g.weekStart).toBe("2026-06-15");
  });

  it("同じ週のうちは rollover しない", () => {
    const g = selectGoals(emptyGoals(), ["count-70"], "2026-06-08");
    expect(rolloverGoals(g, "2026-06-14")).toBe(g); // 同一参照
  });

  it("最大3つまで・未知のIDは無視", () => {
    const g = selectGoals(
      emptyGoals(),
      ["count-70", "days-3", "subjects-3", "lesson-1", "unknown"],
      "2026-06-10"
    );
    expect(g.active).toHaveLength(3);
  });
});

describe("週目標の祝福（受け入れ条件3）", () => {
  it("達成で一度だけ祝福され、同じ週の再祝福はない", () => {
    const s = emptyState();
    s.dailyLog["2026-06-08"] = { answered: 5, correct: 5, xp: 50 };
    s.dailyLog["2026-06-09"] = { answered: 5, correct: 5, xp: 50 };
    s.dailyLog["2026-06-10"] = { answered: 5, correct: 5, xp: 50 };
    const goals = selectGoals(emptyGoals(), ["days-3"], "2026-06-08");
    const c = ctx({ state: s });
    const ms = goalMilestones(goals, c, []);
    expect(ms).toHaveLength(1);
    expect(ms[0].id).toBe("goal:days-3:2026-06-08");
    // 祝福済みなら出ない
    expect(goalMilestones(goals, c, [ms[0].id])).toHaveLength(0);
    // 翌週はIDが変わるのでまた祝福できる
    s.dailyLog["2026-06-15"] = { answered: 5, correct: 5, xp: 50 };
    s.dailyLog["2026-06-16"] = { answered: 5, correct: 5, xp: 50 };
    s.dailyLog["2026-06-17"] = { answered: 5, correct: 5, xp: 50 };
    const nextWeek = goalMilestones(
      goals,
      ctx({ state: s, today: "2026-06-17" }),
      [ms[0].id]
    );
    expect(nextWeek.map((m) => m.id)).toEqual(["goal:days-3:2026-06-15"]);
  });

  it("未達の週は何も出ない（静かに流す）", () => {
    const goals = selectGoals(emptyGoals(), ["days-3"], "2026-06-08");
    expect(goalMilestones(goals, ctx(), [])).toHaveLength(0);
  });
});

describe("挑戦束（計画29）", () => {
  const mathHard: Question = {
    id: "mh1",
    type: "choice",
    question: "応用",
    choices: ["a", "b"],
    answer: 0,
    difficulty: 3,
  };
  const mathEasy: Question = { ...mathHard, id: "me1", difficulty: 1 };
  const engInput: Question = {
    id: "ei1",
    type: "input",
    question: "英作文",
    answers: ["a cat"],
  };
  const engChoiceConv: Question = {
    id: "ec1",
    type: "choice",
    question: "選択だが answers つき",
    choices: ["a", "b"],
    answer: 0,
    answers: ["a"],
  };
  const engChoiceOnly: Question = {
    id: "ec2",
    type: "choice",
    question: "選択のみ",
    choices: ["a", "b"],
    answer: 0,
  };

  it("challengeQuota は量を圧縮する（10問→4問・最低1問）", () => {
    expect(challengeQuota(10)).toBe(4);
    expect(challengeQuota(5)).toBe(2);
    expect(challengeQuota(1)).toBe(1);
  });

  it("挑戦束の構成: 数学は応用のみ・他教科は自力入力系のみ（受け入れ条件3）", () => {
    expect(isChallengeQuestion(mathHard, true)).toBe(true);
    expect(isChallengeQuestion(mathEasy, true)).toBe(false);
    expect(isChallengeQuestion(engInput, false)).toBe(true);
    expect(isChallengeQuestion(engChoiceConv, false)).toBe(true);
    expect(isChallengeQuestion(engChoiceOnly, false)).toBe(false);
  });

  it("非数学の choice は input 形式（asInput）で出す", () => {
    const pool: ChallengeCandidate[] = [
      { question: engChoiceConv, setId: "eng-a", math: false },
    ];
    const items = buildChallengeItems(pool, 1)!;
    expect(items[0].asInput).toBe(true);
  });

  it("同じ概念の変種は重ねない・足りない日は null（挑戦束を出さない）", () => {
    const v1 = { ...engInput, id: "v1", concept: "c1" };
    const v2 = { ...engInput, id: "v2", concept: "c1" };
    const pool: ChallengeCandidate[] = [
      { question: v1, setId: "s", math: false },
      { question: v2, setId: "s", math: false },
    ];
    expect(buildChallengeItems(pool, 2)).toBeNull(); // 実質1概念しかない
    expect(buildChallengeItems(pool, 1)).toHaveLength(1);
  });

  it("完遂した挑戦束はふつう束と同じ寄与（受け入れ条件2）", () => {
    const s = emptyState();
    // 水曜: 挑戦束（ふつう10問→難問4問）を完走。実際の解答は4問
    s.dailyLog["2026-06-10"] = { answered: 4, correct: 4, xp: 40 };
    s.bundles["2026-06-10"] = {
      choice: "challenge",
      normalQuota: 10,
      challengeQuota: 4,
      completed: true,
    };
    const p = goalProgress(def("count-35"), ctx({ state: s }))!;
    expect(p.current).toBe(10); // 4問 + 差分6 = ふつう束10問と同等
  });

  it("未完遂の挑戦束・ふつう束の日はクレジットなし（28の動作に影響がない）", () => {
    const s = emptyState();
    s.dailyLog["2026-06-10"] = { answered: 4, correct: 4, xp: 40 };
    s.bundles["2026-06-10"] = {
      choice: "challenge",
      normalQuota: 10,
      challengeQuota: 4,
      completed: false,
    };
    expect(goalProgress(def("count-35"), ctx({ state: s }))!.current).toBe(4);
    s.bundles["2026-06-10"] = {
      choice: "normal",
      normalQuota: 10,
      challengeQuota: 4,
      completed: true,
    };
    expect(goalProgress(def("count-35"), ctx({ state: s }))!.current).toBe(4);
  });

  it("問数系の課題は todayQuota を持つ（束の生成元）", () => {
    const p = goalProgress(def("count-70"), ctx())!;
    expect(p.todayQuota).toBe(14); // 70 ÷ 残り5日
    const days = goalProgress(def("days-3"), ctx())!;
    expect(days.todayQuota).toBeUndefined();
  });

  it("推す束: 今週よく解けていれば挑戦・それ以外はふつう", () => {
    const s = emptyState();
    expect(recommendedBundle(s, "2026-06-10")).toBe("normal");
    s.dailyLog["2026-06-09"] = { answered: 12, correct: 10, xp: 100 };
    expect(recommendedBundle(s, "2026-06-10")).toBe("challenge");
  });
});
