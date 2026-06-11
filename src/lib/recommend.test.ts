import { describe, expect, it } from "vitest";
import type { ContentIndex } from "../types";
import { AppState, TestPlan, emptyState } from "./storage";
import {
  daysBetweenISO,
  isTestActive,
  isTestOver,
  recommend,
  subjectDaysLeft,
  testLastDay,
} from "./recommend";

const INDEX: ContentIndex = {
  subjects: [
    {
      id: "math",
      name: "数学",
      color: "#4f7cff",
      icon: "📐",
      units: [
        {
          id: "u1",
          name: "式の計算",
          sets: [
            { id: "m1", name: "セット1", file: "f" },
            { id: "m2", name: "セット2", file: "f" },
          ],
        },
        {
          id: "u2",
          name: "連立方程式",
          sets: [{ id: "m3", name: "セット3", file: "f" }],
        },
      ],
    },
    {
      id: "eng",
      name: "英語",
      color: "#ff9500",
      icon: "🔤",
      units: [
        { id: "e1", name: "Unit1", sets: [{ id: "en1", name: "英1", file: "f" }] },
      ],
    },
  ],
};

const TODAY = "2026-06-12";

function withRecords(
  state: AppState,
  records: Record<string, number>
): AppState {
  const setRecords = Object.fromEntries(
    Object.entries(records).map(([id, best]) => [
      id,
      { attempts: 1, best, lastScore: best, lastAt: "2026-06-01" },
    ])
  );
  return { ...state, setRecords };
}

describe("テストモードの導出（spec の不変条件）", () => {
  const test: TestPlan = {
    name: "期末",
    days: [
      { date: "2026-06-12", subjects: ["math"] },
      { date: "2026-06-13", subjects: ["eng"] },
    ],
    range: { math: ["m1"], eng: ["en1"] },
  };

  it("登録があり最終日を過ぎていなければテストモード", () => {
    expect(testLastDay(test)).toBe("2026-06-13");
    expect(isTestActive(test, "2026-06-13")).toBe(true); // 最終日当日はまだテストモード
    expect(isTestActive(test, "2026-06-14")).toBe(false);
    expect(isTestActive(null, TODAY)).toBe(false);
  });

  it("最終日を過ぎたら労い表示の対象", () => {
    expect(isTestOver(test, "2026-06-14")).toBe(true);
    expect(isTestOver(test, "2026-06-13")).toBe(false);
  });

  it("教科ごとの残り日数は最も近い未消化の試験日。終わった教科は含まない", () => {
    const left = subjectDaysLeft(test, "2026-06-13");
    expect(left.get("eng")).toBe(0);
    expect(left.has("math")).toBe(false); // 6/12 は過ぎた
  });

  it("daysBetweenISO は日付文字列の差を日数で返す", () => {
    expect(daysBetweenISO("2026-06-12", "2026-06-13")).toBe(1);
    expect(daysBetweenISO("2026-06-12", "2026-06-12")).toBe(0);
  });
});

describe("recommend: 日常モード", () => {
  it("進行中単元のセットを 未挑戦 → ベスト低い順 で出す", () => {
    let state: AppState = { ...emptyState(), currentUnits: { math: ["u1"] } };
    state = withRecords(state, { m1: 90 }); // m2 は未挑戦
    const recs = recommend(INDEX, state, TODAY);
    expect(recs.map((r) => r.meta.id)).toEqual(["m2", "m1"]);
    expect(recs[0].reason).toContain("式の計算");
  });

  it("進行中単元がなければ全体から1つフォールバック", () => {
    const recs = recommend(INDEX, emptyState(), TODAY);
    expect(recs).toHaveLength(1);
  });
});

describe("recommend: テストモード", () => {
  const test: TestPlan = {
    name: "期末",
    days: [
      { date: "2026-06-13", subjects: ["eng"] },
      { date: "2026-06-14", subjects: ["math"] },
    ],
    range: { math: ["m1", "m3"], eng: ["en1"] },
  };

  it("試験日が近い教科を優先し、範囲内だけを出す", () => {
    const state = { ...emptyState(), test };
    const recs = recommend(INDEX, state, "2026-06-12");
    // eng（あと1日）が math（あと2日）より先
    expect(recs[0].meta.id).toBe("en1");
    expect(recs.map((r) => r.meta.id)).toEqual(["en1", "m1", "m3"]);
    // m2 は範囲外なので出ない
    expect(recs.some((r) => r.meta.id === "m2")).toBe(false);
  });

  it("試験が終わった日の教科は提案されない", () => {
    const state = { ...emptyState(), test };
    const recs = recommend(INDEX, state, "2026-06-14"); // eng は 6/13 で終了
    expect(recs.every((r) => r.subject.id === "math")).toBe(true);
  });

  it("最終日経過後は日常モードの提案に自動で戻る", () => {
    const state = {
      ...emptyState(),
      test,
      currentUnits: { math: ["u2"] },
    };
    const recs = recommend(INDEX, state, "2026-06-15");
    expect(recs.map((r) => r.meta.id)).toEqual(["m3"]);
    expect(recs[0].reason).toContain("連立方程式");
  });
});

describe("予習フロー（計画13）", () => {
  const INDEX13: ContentIndex = {
    subjects: [
      {
        id: "math",
        name: "数学",
        color: "#4f7cff",
        icon: "📐",
        units: [
          {
            id: "u1",
            name: "連立方程式",
            sets: [
              { id: "lesson1", name: "レッスン", file: "f", kind: "lesson" },
              { id: "m1", name: "演習1", file: "f" },
            ],
          },
          {
            id: "u2",
            name: "式の計算",
            sets: [{ id: "m2", name: "演習2", file: "f" }],
            links: [{ label: "授業動画", url: "https://example.com" }],
          },
        ],
      },
    ],
  };

  it("新しい単元（演習実績なし）ではおすすめの先頭がレッスンになる", () => {
    const state: AppState = {
      ...emptyState(),
      currentUnits: { math: ["u1"] },
    };
    const recs = recommend(INDEX13, state, TODAY);
    expect(recs[0].meta.id).toBe("lesson1");
    expect(recs[0].reason).toContain("レッスン");
  });

  it("演習実績が貯まる/レッスン完了後は通常の並びに戻る", () => {
    const practiced: AppState = {
      ...emptyState(),
      currentUnits: { math: ["u1"] },
      questionStats: Object.fromEntries(
        ["q1", "q2", "q3"].map((q) => [
          `m1/${q}`,
          { setId: "m1", correct: 1, wrong: 0, lastCorrect: true, updatedAt: "" },
        ])
      ),
    };
    const recs = recommend(INDEX13, practiced, TODAY);
    expect(recs[0].reason).not.toContain("まずはレッスン");

    const done: AppState = {
      ...emptyState(),
      currentUnits: { math: ["u1"] },
      setRecords: {
        lesson1: { attempts: 1, best: 100, lastScore: 100, lastAt: "" },
      },
    };
    expect(recommend(INDEX13, done, TODAY)[0].reason).not.toContain(
      "まずはレッスン"
    );
  });

  it("レッスンが無い新しい単元では単元の links を添える", () => {
    const state: AppState = {
      ...emptyState(),
      currentUnits: { math: ["u2"] },
    };
    const recs = recommend(INDEX13, state, TODAY);
    expect(recs[0].links?.[0].label).toBe("授業動画");
  });
});
