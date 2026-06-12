import { describe, expect, it } from "vitest";
import type { ChoiceQuestion, FlashcardQuestion, InputQuestion, Question } from "../types";
import { emptyState } from "./storage";
import { V1_AFTER_12 } from "./__fixtures__/appstate";
import {
  TRACE_LEVEL,
  applyAnswer,
  buildAdaptiveItems,
  deriveInitialMastery,
  dueSetIds,
  emptyMastery,
  rankCounts,
  recommendHintStyle,
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
    // level 0 からは1回の不正解では下がらない
    expect(
      applyAnswer(emptyMastery(), { ...ok("2026-06-01"), correct: false }).level
    ).toBe(0);
  });

  it("choice 段の連続不正解で写経段へ降格する（計画25 受け入れ条件2）", () => {
    const wrong = { ...ok("2026-06-01"), correct: false };
    let m = applyAnswer(emptyMastery(), wrong);
    expect(m.level).toBe(0); // 1回では落ちない
    m = applyAnswer(m, wrong);
    expect(m.level).toBe(TRACE_LEVEL); // 2回連続で写経段へ
    // 写経段より下には落ちない
    m = applyAnswer(m, wrong);
    expect(m.level).toBe(TRACE_LEVEL);
  });

  it("間に正解を挟むと不正解の連続は切れる（写経に落ちない）", () => {
    const wrong = { ...ok("2026-06-01"), correct: false };
    let m = applyAnswer(emptyMastery(), wrong);
    m = applyAnswer(m, ok("2026-06-02"));
    m = applyAnswer(m, wrong);
    expect(m.level).toBe(0);
  });

  it("写経の完了で choice 段へ進む（計画25 受け入れ条件1）", () => {
    const atTrace = { ...emptyMastery(), level: TRACE_LEVEL, wrongStreak: 2 };
    const m = applyAnswer(atTrace, { ...ok("2026-06-01"), trace: true });
    expect(m.level).toBe(0);
    expect(m.streak).toBe(0); // 正解の連続には数えない
    expect(m.wrongStreak).toBe(0);
    expect(m.dueDate).toBe("2026-06-02"); // 翌日に再確認
    // すでに choice 段以上なら維持（写経で段は下がらない）
    const atInput = { ...emptyMastery(), level: 1 };
    expect(applyAnswer(atInput, { ...ok("2026-06-01"), trace: true }).level).toBe(1);
  });

  it("計画25より前の保存データ（wrongStreak なし）でも昇降格が壊れない", () => {
    const old = V1_AFTER_12.mastery["shiki-doruiko"]; // wrongStreak フィールドが無い
    const wrong = { ...ok("2026-06-13"), correct: false };
    let m = applyAnswer(old, wrong);
    expect(m.level).toBe(0); // 1回目では落ちない（?? 0 から数え始める）
    m = applyAnswer(m, wrong);
    expect(m.level).toBe(TRACE_LEVEL);
    // 写経段での正解（復習経由など）も dueDate が壊れない
    const correct = applyAnswer({ ...m }, ok("2026-06-14"));
    expect(correct.dueDate).toBe("2026-06-17"); // 写経段は choice 段と同じ +3日
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

  it("実績が全くない初見は写経段から（計画25）", () => {
    expect(deriveInitialMastery(["s1/q1"], {}).level).toBe(TRACE_LEVEL);
  });

  it("実績が一部でもあれば（直近不正解など）choice 段から", () => {
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

  it("初見（実績・習熟度なし）は最も易しい変種が写経モードで出る（計画25 受け入れ条件1）", () => {
    const items = buildAdaptiveItems(questions, "s1", emptyState());
    expect(items[0].asTrace).toBe(true);
    expect(items[0].question.id).toBe("q1"); // difficulty 1 の先頭
    expect(items[0].asInput).toBe(true); // choice 変種は input に変換して写経する
    // concept 無しの問題は従来どおり
    expect(items[1].question.id).toBe("q2");
    expect(items[1].asTrace).toBeUndefined();
  });

  it("写経段（level -1）の保存データでも写経モードで出る（降格後・受け入れ条件2）", () => {
    const items = buildAdaptiveItems(questions, "s1", stateAtLevel(-1));
    expect(items[0].asTrace).toBe(true);
  });

  it("写経にできる変種が無い概念は choice 段へフォールバックする", () => {
    const flashQ: FlashcardQuestion = {
      id: "f1",
      type: "flashcard",
      front: "おもて",
      back: "うら",
      concept: "c2",
    };
    const noAnswersChoice: ChoiceQuestion = {
      id: "c1q",
      type: "choice",
      question: "どれ？",
      choices: ["あ", "い"],
      answer: 0,
      concept: "c2",
      difficulty: 1,
    };
    const items = buildAdaptiveItems([flashQ, noAnswersChoice], "s1", emptyState());
    expect(items[0].asTrace).toBeUndefined();
    expect(items[0].question.id).toBe("c1q"); // stage0 の choice にフォールバック
  });

  it("既存の保存データ（level 0）は写経に落ちず choice のまま（後方互換）", () => {
    const items = buildAdaptiveItems(questions, "s1", stateAtLevel(0));
    expect(items[0].asTrace).toBeUndefined();
    expect(items[0].question.id).toBe("q1");
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

  it("rankCounts は段位ごとの概念数（index 0 = 写経段）", () => {
    const s = emptyState();
    s.mastery = {
      a: { level: 0, streak: 0, lastCorrectDate: "", dueDate: "", setId: "" },
      b: { level: 1, streak: 0, lastCorrectDate: "", dueDate: "", setId: "" },
      c: { level: 1, streak: 0, lastCorrectDate: "", dueDate: "", setId: "" },
      d: { level: -1, streak: 0, lastCorrectDate: "", dueDate: "", setId: "" },
    };
    expect(rankCounts(s)).toEqual([1, 1, 2, 0]);
  });
});

describe("ヒント開示方法のおすすめ（計画31）", () => {
  it("初見・低い段は「ぜんぶ見る」、input 段以上は「すこしずつ」を推す", () => {
    expect(recommendHintStyle(undefined)).toBe("full");
    expect(recommendHintStyle({ ...emptyMastery(), level: -1 })).toBe("full");
    expect(recommendHintStyle({ ...emptyMastery(), level: 0 })).toBe("full");
    expect(recommendHintStyle({ ...emptyMastery(), level: 1 })).toBe("step");
    expect(recommendHintStyle({ ...emptyMastery(), level: 2 })).toBe("step");
  });
});

describe("解答形式ベースの昇降格（計画34）", () => {
  const inputOk = (today: string) => ({ ...ok(today), form: "input" as const });
  const choiceOk = (today: string) => ({ ...ok(today), form: "choice" as const });

  it("input 段の問題を choice に切り替えて正解 → 昇格の連続に数えない・降格もしない", () => {
    const m = { ...emptyMastery(), level: 1, streak: 1 };
    const next = applyAnswer(m, choiceOk("2026-06-10"));
    expect(next.level).toBe(1); // 降格しない
    expect(next.streak).toBe(1); // 連続も進まない（choice 段の証拠どまり）
    expect(next.dueDate).not.toBe(""); // 定着確認は先送りされる
  });

  it("input で解いた正解は input 段以上の昇格の証拠になる", () => {
    let m = { ...emptyMastery(), level: 1 };
    m = applyAnswer(m, inputOk("2026-06-01"));
    expect(m.streak).toBe(1);
    m = applyAnswer(m, inputOk("2026-06-04"));
    expect(m.level).toBe(2); // 応用段へ昇格
  });

  it("choice 段では choice の正解が従来どおり証拠になる（デフォルト進行を壊さない）", () => {
    let m = applyAnswer(emptyMastery(), choiceOk("2026-06-01"));
    expect(m.streak).toBe(1);
    m = applyAnswer(m, choiceOk("2026-06-04"));
    expect(m.level).toBe(1);
  });

  it("form 未指定は従来動作（後方互換: 模擬テスト・レッスン経由）", () => {
    let m = { ...emptyMastery(), level: 1 };
    m = applyAnswer(m, ok("2026-06-01"));
    expect(m.streak).toBe(1);
  });

  it("下の形式でも不正解は従来どおり降格する（ズルにも罰にもならない＝失敗は失敗）", () => {
    const m = { ...emptyMastery(), level: 1 };
    const next = applyAnswer(m, {
      correct: false,
      dontKnow: false,
      hintsUsed: 0,
      hintsTotal: 0,
      form: "choice",
      today: "2026-06-10",
    });
    expect(next.level).toBe(0);
  });
});
