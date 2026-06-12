import { describe, expect, it } from "vitest";
import type { ChoiceQuestion, LessonStep } from "../types";
import {
  XP_FIRST_CORRECT,
  XP_FLASHCARD,
  XP_LESSON,
  XP_RETRY_CORRECT,
  checkInputAnswer,
  checkOrder,
  choiceAsInput,
  emptyStruggle,
  isStruggling,
  nextStruggle,
  normalizeAnswer,
  peekQuestion,
  shuffle,
} from "./quiz";

describe("XP の不変条件（docs/spec.md）", () => {
  it("1発正解+10 / リトライ・ヒント後+5 / フラッシュカード+5 / レッスン+2", () => {
    expect(XP_FIRST_CORRECT).toBe(10);
    expect(XP_RETRY_CORRECT).toBe(5);
    expect(XP_FLASHCARD).toBe(5);
    expect(XP_LESSON).toBe(2);
  });
});

describe("normalizeAnswer / checkInputAnswer", () => {
  it("全角・空白・大文字小文字・句読点のゆれを吸収する", () => {
    expect(normalizeAnswer("２ｘ＋６ｙ")).toBe(normalizeAnswer("2x+6y"));
    expect(normalizeAnswer("2x + 6y")).toBe("2x+6y");
    expect(normalizeAnswer("ABC")).toBe("abc");
    expect(normalizeAnswer("a、b。")).toBe(normalizeAnswer("a，b．"));
  });

  it("受理リストのどれかに一致すれば正解", () => {
    expect(checkInputAnswer("2x + 6y", ["2x+6y", "6y+2x"])).toBe(true);
    expect(checkInputAnswer("6Y+2X", ["2x+6y", "6y+2x"])).toBe(true);
    expect(checkInputAnswer("3x+6y", ["2x+6y", "6y+2x"])).toBe(false);
    expect(checkInputAnswer("   ", ["2x+6y"])).toBe(false);
  });

  it("カタカナ/ひらがなのゆれを吸収する（計画39）", () => {
    // ひらがな指定の読み問題にカタカナで答えても受理
    expect(checkInputAnswer("ゼンジ", ["ぜんじ"])).toBe(true);
    // カタカナ表記が正解の用語にひらがなで答えても受理（既存の手動別表記と同じ意図）
    expect(checkInputAnswer("あみらーぜ", ["アミラーゼ"])).toBe(true);
    // 長音符は変換対象外（ー はそのまま比較される）
    expect(normalizeAnswer("ペリー")).toBe("ぺりー");
    // 漢字はそのまま
    expect(checkInputAnswer("把握", ["把握"])).toBe(true);
    // 半角カタカナも NFKC で全角に正規化されてから折りたたまれる
    expect(checkInputAnswer("ｾﾞﾝｼﾞ", ["ぜんじ"])).toBe(true);
  });
});

describe("checkOrder", () => {
  it("順序の完全一致のみ正解", () => {
    expect(checkOrder(["I", "like", "math"], ["I", "like", "math"])).toBe(true);
    expect(checkOrder(["like", "I", "math"], ["I", "like", "math"])).toBe(false);
    expect(checkOrder(["I", "like"], ["I", "like", "math"])).toBe(false);
  });
});

describe("shuffle", () => {
  it("要素を保ったまま並べ替える（元配列は不変）", () => {
    const arr = [1, 2, 3, 4, 5];
    const out = shuffle(arr);
    expect([...out].sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("choiceAsInput（概念ラダー: choice/input 両用）", () => {
  const base: ChoiceQuestion = {
    id: "q1",
    type: "choice",
    question: "3x + 2y − x + 4y を計算すると？",
    choices: ["2x + 6y", "2x + 2y", "4x + 6y", "3x + 6y"],
    answer: 0,
    explanation: "解説",
    difficulty: 1,
    hints: ["h1"],
    concept: "shiki-doruiko",
  };

  it("answers があれば input 形式に変換し、メタデータを引き継ぐ", () => {
    const q = { ...base, answers: ["2x+6y", "6y+2x"] };
    const converted = choiceAsInput(q);
    expect(converted).not.toBeNull();
    expect(converted!.type).toBe("input");
    expect(converted!.id).toBe(q.id); // 進捗キーが変わらない
    expect(converted!.answers).toEqual(q.answers);
    expect(converted!.hints).toEqual(q.hints);
    expect(converted!.concept).toBe(q.concept);
    // 変換後の答えが既存の判定でそのまま使える
    expect(checkInputAnswer("2x + 6y", converted!.answers)).toBe(true);
  });

  it("answers が無い・空なら null（choice のまま出す）", () => {
    expect(choiceAsInput(base)).toBeNull();
    expect(choiceAsInput({ ...base, answers: [] })).toBeNull();
  });
});

describe("つまずき検知（計画13）", () => {
  it("3回連続不正解で誘導（途中で正解すれば連続が切れる）", () => {
    let c = emptyStruggle();
    c = nextStruggle(c, { correct: false, usedAllHints: false });
    c = nextStruggle(c, { correct: false, usedAllHints: false });
    expect(isStruggling(c)).toBe(false);
    c = nextStruggle(c, { correct: false, usedAllHints: false });
    expect(isStruggling(c)).toBe(true);

    let d = emptyStruggle();
    d = nextStruggle(d, { correct: false, usedAllHints: false });
    d = nextStruggle(d, { correct: false, usedAllHints: false });
    d = nextStruggle(d, { correct: true, usedAllHints: false });
    d = nextStruggle(d, { correct: false, usedAllHints: false });
    expect(isStruggling(d)).toBe(false);
  });

  it("ヒントを使い切った不正解2回でも誘導（連続でなくてよい）", () => {
    let c = emptyStruggle();
    c = nextStruggle(c, { correct: false, usedAllHints: true });
    c = nextStruggle(c, { correct: true, usedAllHints: false });
    c = nextStruggle(c, { correct: false, usedAllHints: true });
    expect(isStruggling(c)).toBe(true);
  });
});

describe("レッスン冒頭のチラ見問題（計画32）", () => {
  it("ステップ列の最初の問題を流用する（専用作問はしない）", () => {
    const steps: LessonStep[] = [
      { id: "c1", type: "card", body: "解説" },
      { id: "q1", type: "choice", question: "?", choices: ["a"], answer: 0 },
      { id: "q2", type: "input", question: "?", answers: ["a"] },
    ];
    expect(peekQuestion(steps)?.id).toBe("q1");
  });

  it("流用できる問題が無いレッスンでは null = 選択肢自体を出さない", () => {
    const steps: LessonStep[] = [
      { id: "c1", type: "card", body: "解説" },
      { id: "c2", type: "card", body: "解説2" },
    ];
    expect(peekQuestion(steps)).toBeNull();
    expect(peekQuestion([])).toBeNull();
  });
});
