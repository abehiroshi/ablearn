import { describe, expect, it } from "vitest";
import type { ChoiceQuestion, InputQuestion, Question } from "../types";
import { emptyState } from "./storage";
import {
  applyAnswer,
  buildAdaptiveItems,
  deriveInitialMastery,
  dueSetIds,
  emptyMastery,
  rankCounts,
} from "./mastery";

const ok = (today: string) => ({
  correct: true,
  dontKnow: false,
  hintsUsed: 0,
  hintsTotal: 2,
  today,
});

describe("applyAnswer: 昇降格ルール（spec の不変条件）", () => {
  it("ヒントなし正解2回連続＋中2日以上で昇格する（受け入れ条件1）", () => {
    let m = applyAnswer(emptyMastery(), ok("2026-06-01"));
    expect(m.level).toBe(0);
    expect(m.streak).toBe(1);
    // 中2日以上空けた2回目 → input 段へ昇格
    m = applyAnswer(m, ok("2026-06-04"));
    expect(m.level).toBe(1);
    expect(m.streak).toBe(0);
  });

  it("間隔が足りない連続正解では昇格しない（短期記憶を定着と区別）", () => {
    let m = applyAnswer(emptyMastery(), ok("2026-06-01"));
    m = applyAnswer(m, ok("2026-06-01")); // 同日
    expect(m.level).toBe(0);
    expect(m.streak).toBe(2);
    m = applyAnswer(m, ok("2026-06-02")); // 翌日（中2日未満）
    expect(m.level).toBe(0);
    // その後間隔をあければ昇格
    m = applyAnswer(m, ok("2026-06-05"));
    expect(m.level).toBe(1);
  });

  it("不正解・わからない・ヒント使い切り正解で降格する（受け入れ条件2）", () => {
    const atLevel1 = { ...emptyMastery(), level: 1 };
    expect(
      applyAnswer(atLevel1, { ...ok("2026-06-01"), correct: false }).level
    ).toBe(0);
    expect(
      applyAnswer(atLevel1, { ...ok("2026-06-01"), correct: false, dontKnow: true })
        .level
    ).toBe(0);
    expect(
      applyAnswer(atLevel1, { ...ok("2026-06-01"), hintsUsed: 2 }).level
    ).toBe(0); // ヒント2/2 = 最後まで使った正解
    // level 0 からは下がらない
    expect(
      applyAnswer(emptyMastery(), { ...ok("2026-06-01"), correct: false }).level
    ).toBe(0);
  });

  it("ヒント途中までの正解は段を維持し、連続だけ切れる", () => {
    const m = { ...emptyMastery(), level: 1, streak: 1 };
    const next = applyAnswer(m, { ...ok("2026-06-01"), hintsUsed: 1 });
    expect(next.level).toBe(1);
    expect(next.streak).toBe(0);
  });

  it("最上段からはそれ以上昇格しない", () => {
    let m = { ...emptyMastery(), level: 2, streak: 1, lastCorrectDate: "2026-06-01" };
    m = applyAnswer(m, ok("2026-06-05"));
    expect(m.level).toBe(2);
  });

  it("正解すると定着確認日（dueDate）が段に応じて先送りされる", () => {
    const m = applyAnswer(emptyMastery(), ok("2026-06-01"));
    expect(m.dueDate).toBe("2026-06-04"); // level0 = +3日
    const wrong = applyAnswer(m, { ...ok("2026-06-04"), correct: false });
    expect(wrong.dueDate).toBe("2026-06-05"); // 間違えたら翌日に再確認
  });
});

describe("deriveInitialMastery: 既存データからの初期習熟度（受け入れ条件3）", () => {
  it("全変種が直近正解で合計2回以上なら input 段から始まる", () => {
    const stats = {
      "s1/q1": { setId: "s1", correct: 2, wrong: 1, lastCorrect: true, updatedAt: "2026-06-01T00:00:00Z" },
      "s1/q3": { setId: "s1", correct: 1, wrong: 0, lastCorrect: true, updatedAt: "2026-06-02T00:00:00Z" },
    };
    const m = deriveInitialMastery(["s1/q1", "s1/q3"], stats);
    expect(m.level).toBe(1);
    expect(m.lastCorrectDate).toBe("2026-06-02");
  });

  it("実績がない・直近不正解があれば choice 段から", () => {
    expect(deriveInitialMastery(["s1/q1"], {}).level).toBe(0);
    const stats = {
      "s1/q1": { setId: "s1", correct: 5, wrong: 1, lastCorrect: false, updatedAt: "" },
    };
    expect(deriveInitialMastery(["s1/q1"], stats).level).toBe(0);
  });
});

describe("buildAdaptiveItems: 段に応じた出題", () => {
  const choiceQ: ChoiceQuestion = {
    id: "q1",
    type: "choice",
    question: "3x+2y−x+4y は？",
    choices: ["2x+6y", "2x+2y", "4x+6y", "3x+6y"],
    answer: 0,
    answers: ["2x+6y"],
    concept: "c1",
    difficulty: 1,
  };
  const inputQ: InputQuestion = {
    id: "q3",
    type: "input",
    question: "4a+7b−2a−3b は？",
    answers: ["2a+4b"],
    concept: "c1",
    difficulty: 1,
  };
  const advQ: ChoiceQuestion = {
    id: "q10",
    type: "choice",
    question: "2(3a−b)−3(a−2b) は？",
    choices: ["3a+4b", "3a−8b", "9a−4b", "3a−4b"],
    answer: 0,
    concept: "c1",
    difficulty: 3,
  };
  const plainQ: Question = {
    id: "q2",
    type: "choice",
    question: "次数は？",
    choices: ["3", "2"],
    answer: 0,
  } as ChoiceQuestion;
  const questions = [choiceQ, plainQ, inputQ, advQ];

  function stateAtLevel(level: number) {
    const s = emptyState();
    s.mastery = { c1: { level, streak: 0, lastCorrectDate: "", dueDate: "", setId: "s1" } };
    return s;
  }

  it("level 0 では choice 変種、concept 無しは従来どおり", () => {
    const items = buildAdaptiveItems(questions, "s1", stateAtLevel(0));
    expect(items.map((i) => i.question.id)).toEqual(["q1", "q2"]);
    expect(items[0].asInput).toBeUndefined();
  });

  it("level 1 では input 変種が出る（より難しい形式・受け入れ条件1）", () => {
    const items = buildAdaptiveItems(questions, "s1", stateAtLevel(1));
    expect(items[0].question.id).toBe("q3");
  });

  it("input 変種が無ければ answers つき choice を asInput で出す", () => {
    const items = buildAdaptiveItems([choiceQ, advQ], "s1", stateAtLevel(1));
    expect(items[0].question.id).toBe("q1");
    expect(items[0].asInput).toBe(true);
  });

  it("level 2 では応用（difficulty 3）の変種が出る", () => {
    const items = buildAdaptiveItems(questions, "s1", stateAtLevel(2));
    expect(items[0].question.id).toBe("q10");
  });

  it("習熟度が無い概念は questionStats から初期段を導出する", () => {
    const s = emptyState();
    s.questionStats = {
      "s1/q1": { setId: "s1", correct: 2, wrong: 0, lastCorrect: true, updatedAt: "2026-06-01T00:00:00Z" },
      "s1/q3": { setId: "s1", correct: 1, wrong: 0, lastCorrect: true, updatedAt: "2026-06-01T00:00:00Z" },
      "s1/q10": { setId: "s1", correct: 1, wrong: 0, lastCorrect: true, updatedAt: "2026-06-01T00:00:00Z" },
    };
    const items = buildAdaptiveItems(questions, "s1", s);
    expect(items[0].question.id).toBe("q3"); // 初期から input 段
  });
});

describe("dueSetIds / rankCounts", () => {
  it("定着確認の時期が来た概念のセットだけを返す", () => {
    const s = emptyState();
    s.mastery = {
      c1: { level: 1, streak: 0, lastCorrectDate: "", dueDate: "2026-06-10", setId: "s1" },
      c2: { level: 0, streak: 0, lastCorrectDate: "", dueDate: "2026-06-20", setId: "s2" },
    };
    expect([...dueSetIds(s, "2026-06-12")]).toEqual(["s1"]);
  });

  it("rankCounts は段位ごとの概念数", () => {
    const s = emptyState();
    s.mastery = {
      a: { level: 0, streak: 0, lastCorrectDate: "", dueDate: "", setId: "" },
      b: { level: 1, streak: 0, lastCorrectDate: "", dueDate: "", setId: "" },
      c: { level: 1, streak: 0, lastCorrectDate: "", dueDate: "", setId: "" },
    };
    expect(rankCounts(s)).toEqual([1, 2, 0]);
  });
});
