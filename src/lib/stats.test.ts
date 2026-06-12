import { describe, expect, it } from "vitest";
import type { ContentIndex } from "../types";
import { AppState, emptyState } from "./storage";
import { subjectAccuracy, unitAccuracy, unitGrowth } from "./stats";

const INDEX: ContentIndex = {
  subjects: [
    {
      id: "math",
      name: "数学",
      color: "#4f7cff",
      icon: "📐",
      units: [
        { id: "u1", name: "式の計算", sets: [{ id: "m1", name: "s", file: "f" }] },
        { id: "u2", name: "連立", sets: [{ id: "m2", name: "s", file: "f" }] },
      ],
    },
    {
      id: "eng",
      name: "英語",
      color: "#ff9500",
      icon: "🔤",
      units: [
        { id: "e1", name: "Unit1", sets: [{ id: "en1", name: "s", file: "f" }] },
      ],
    },
  ],
};

function stateWithStats(): AppState {
  return {
    ...emptyState(),
    questionStats: {
      "m1/q1": { setId: "m1", correct: 3, wrong: 1, lastCorrect: true, updatedAt: "" },
      "m2/q1": { setId: "m2", correct: 1, wrong: 3, lastCorrect: false, updatedAt: "" },
      "en1/q1": { setId: "en1", correct: 2, wrong: 0, lastCorrect: true, updatedAt: "" },
      // コンテンツ更新で消えたセットは無視される
      "gone/q1": { setId: "gone", correct: 5, wrong: 5, lastCorrect: true, updatedAt: "" },
    },
  };
}

describe("subjectAccuracy / unitAccuracy", () => {
  it("教科別の正答率を解答があった教科だけ返す", () => {
    const items = subjectAccuracy(INDEX, stateWithStats());
    expect(items.map((i) => [i.id, i.accuracy])).toEqual([
      ["math", 50], // (3+1)正解 / 8解答
      ["eng", 100],
    ]);
  });

  it("単元別は正答率の低い順（苦手な順）", () => {
    const items = unitAccuracy(INDEX, stateWithStats());
    expect(items.map((i) => [i.label, i.accuracy])).toEqual([
      ["連立", 25],
      ["式の計算", 75],
      ["Unit1", 100],
    ]);
  });
});

describe("unitGrowth（累積正答率の時系列）", () => {
  it("単元別に日をまたいで累積し、データ前の日は null", () => {
    const state: AppState = {
      ...emptyState(),
      history: {
        "2026-06-10": { "m1/q1": { correct: 1, wrong: 1, dontKnow: 0, hints: 0, timeMs: 0 } },
        "2026-06-11": { "m1/q1": { correct: 1, wrong: 0, dontKnow: 0, hints: 0, timeMs: 0 } },
        "2026-06-12": {
          "m2/q1": { correct: 1, wrong: 0, dontKnow: 0, hints: 0, timeMs: 0 },
        },
      },
    };
    const { dates, series } = unitGrowth(INDEX, state);
    expect(dates).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
    const m1 = series.find((s) => s.label === "式の計算")!;
    // 6/10: 1/2=50% → 6/11: 2/3=67% → 6/12: 変化なしで67%維持
    expect(m1.values).toEqual([50, 67, 67]);
    const m2 = series.find((s) => s.label === "連立")!;
    // 6/12 までデータなし → null、6/12 に 1/1=100%
    expect(m2.values).toEqual([null, null, 100]);
  });

  it("履歴が空なら空を返す（初期状態で破綻しない）", () => {
    const { dates, series } = unitGrowth(INDEX, emptyState());
    expect(dates).toEqual([]);
    expect(series).toEqual([]);
  });
});
