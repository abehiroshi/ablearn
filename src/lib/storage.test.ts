import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppState,
  addDailyLog,
  currentStreak,
  emptyState,
  loadState,
  makeBackup,
  parseBackup,
  recordHistory,
  recordQuestion,
  recordSetResult,
  todayKey,
  touchStreak,
  wrongQuestionKeys,
} from "./storage";
import { ALL_FIXTURES, V1_INITIAL } from "./__fixtures__/appstate";

// Node 環境には localStorage がないので最小のスタブを置く
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("localStorage 後方互換（最重要）", () => {
  for (const [name, fixture] of Object.entries(ALL_FIXTURES)) {
    it(`旧形式 ${name} を読み込んでも壊れない`, () => {
      store.set("ablearn:v1", JSON.stringify(fixture));
      const state = loadState();
      // emptyState のキーがすべて揃う（スキーマを壊すとここで落ちる）
      for (const key of Object.keys(emptyState())) {
        expect(state, `missing key: ${key}`).toHaveProperty(key);
        expect((state as unknown as Record<string, unknown>)[key]).toBeDefined();
      }
      // 旧データの値が保持される
      expect(state.xp).toBe(120);
      expect(state.streak.count).toBe(3);
      expect(state.dailyLog["2026-06-01"].answered).toBe(10);
      expect(state.questionStats["math-shiki-keisan/q1"].correct).toBe(2);
      expect(state.setRecords["math-shiki-keisan"].best).toBe(80);
    });
  }

  it("空・壊れたJSON・未保存はすべて emptyState になる", () => {
    expect(loadState()).toEqual(emptyState());
    store.set("ablearn:v1", "{ broken");
    expect(loadState()).toEqual(emptyState());
  });
});

describe("streak", () => {
  it("連続した日の学習で増え、空くと1に戻る", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00"));
    let s = touchStreak(emptyState());
    expect(s.streak).toEqual({ count: 1, lastDate: "2026-06-10" });
    // 同日2回目は変化なし
    expect(touchStreak(s).streak.count).toBe(1);
    vi.setSystemTime(new Date("2026-06-11T12:00:00"));
    s = touchStreak(s);
    expect(s.streak.count).toBe(2);
    vi.setSystemTime(new Date("2026-06-14T12:00:00"));
    s = touchStreak(s);
    expect(s.streak.count).toBe(1);
  });

  it("表示用 streak は昨日までの連続なら生きている", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T08:00:00"));
    const s: AppState = {
      ...emptyState(),
      streak: { count: 5, lastDate: "2026-06-11" },
    };
    expect(currentStreak(s)).toBe(5);
    vi.setSystemTime(new Date("2026-06-13T08:00:00"));
    expect(currentStreak(s)).toBe(0);
  });
});

describe("日次ログと解答履歴", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T12:00:00"));
  });

  it("addDailyLog は当日に加算する", () => {
    let s = addDailyLog(emptyState(), { answered: 1, correct: 1, xp: 10 });
    s = addDailyLog(s, { answered: 1, xp: 5 });
    expect(s.dailyLog[todayKey()]).toEqual({ answered: 2, correct: 1, xp: 15 });
  });

  it("recordHistory はリトライ・ヒントも含め当日の問題別に集計する", () => {
    let s = recordHistory(emptyState(), "set1", "q1", false, 10000, 0);
    s = recordHistory(s, "set1", "q1", true, 5000, 2);
    expect(s.history[todayKey()]["set1/q1"]).toEqual({
      correct: 1,
      wrong: 1,
      hints: 2,
      timeMs: 15000,
    });
  });

  it("recordHistory は負の時間を 0 に丸める", () => {
    const s = recordHistory(emptyState(), "set1", "q1", true, -500, 0);
    expect(s.history[todayKey()]["set1/q1"].timeMs).toBe(0);
  });
});

describe("成績と復習対象", () => {
  it("recordQuestion で直近不正解の問題が復習対象になる", () => {
    let s = recordQuestion(emptyState(), "set1", "q1", false);
    s = recordQuestion(s, "set1", "q2", true);
    expect(wrongQuestionKeys(s)).toEqual(["set1/q1"]);
    s = recordQuestion(s, "set1", "q1", true);
    expect(wrongQuestionKeys(s)).toEqual([]);
  });

  it("recordSetResult はベストスコアを保持する", () => {
    let s = recordSetResult(emptyState(), "set1", 80);
    s = recordSetResult(s, "set1", 60);
    expect(s.setRecords["set1"].best).toBe(80);
    expect(s.setRecords["set1"].lastScore).toBe(60);
    expect(s.setRecords["set1"].attempts).toBe(2);
  });
});

describe("バックアップ", () => {
  it("makeBackup → parseBackup で往復できる", () => {
    const state: AppState = { ...emptyState(), xp: 999 };
    const backup = makeBackup(state);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.state.xp).toBe(999);
    expect(parsed.app).toBe("ablearn");
  });

  it("旧形式の state を含むバックアップも欠けたフィールドが補われる", () => {
    const backup = {
      app: "ablearn",
      schemaVersion: 1,
      exportedAt: "2026-06-01T00:00:00.000Z",
      state: V1_INITIAL,
    };
    const parsed = parseBackup(JSON.stringify(backup));
    for (const key of Object.keys(emptyState())) {
      expect(parsed.state).toHaveProperty(key);
    }
  });

  it("不正なファイルは日本語メッセージで弾く", () => {
    expect(() => parseBackup("{ broken")).toThrow("JSON");
    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow(
      "Ablearn"
    );
    expect(() =>
      parseBackup(
        JSON.stringify({ app: "ablearn", schemaVersion: 999, state: { xp: 0, dailyLog: {} } })
      )
    ).toThrow("新しいバージョン");
  });
});
