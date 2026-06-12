// localStorage 後方互換テスト用フィクスチャ。
// 過去の各時点で実際に保存されていたデータ形式を保存する。
// スキーマを変えるたびに「変更前の形式」をここに追加すること（docs/spec.md 参照）。

/** v1 初期（xp / streak / dailyLog / questionStats / setRecords のみ） */
export const V1_INITIAL = {
  xp: 120,
  streak: { count: 3, lastDate: "2026-06-01" },
  dailyLog: { "2026-06-01": { answered: 10, correct: 8, xp: 90 } },
  questionStats: {
    "math-shiki-keisan/q1": {
      setId: "math-shiki-keisan",
      correct: 2,
      wrong: 1,
      lastCorrect: false,
      updatedAt: "2026-06-01T10:00:00.000Z",
    },
  },
  setRecords: {
    "math-shiki-keisan": {
      attempts: 2,
      best: 80,
      lastScore: 70,
      lastAt: "2026-06-01T10:00:00.000Z",
    },
  },
};

/** 計画04（解答履歴）追加後の形式 */
export const V1_AFTER_04 = {
  ...V1_INITIAL,
  history: {
    "2026-06-01": {
      "math-shiki-keisan/q1": { correct: 1, wrong: 1, hints: 0, timeMs: 30000 },
    },
  },
};

/** 計画01（モード・時間割）追加後の形式 */
export const V1_AFTER_01 = {
  ...V1_AFTER_04,
  currentUnits: { math: ["renritsu"] },
  test: {
    name: "期末テスト",
    days: [{ date: "2026-06-18", subjects: ["math"] }],
    range: { math: ["math-renritsu-basic"] },
  },
};

/** 計画06（模擬テスト）追加後の形式 */
export const V1_AFTER_06 = {
  ...V1_AFTER_01,
  mockResults: [
    {
      at: "2026-06-10T09:00:00.000Z",
      score: 60,
      correct: 6,
      total: 10,
      rangeLabel: "式の計算",
      durationMin: 20,
    },
  ],
};

/** 計画17（わからない）追加後・計画12（習熟度）より前の形式（mastery なし） */
export const V1_AFTER_17 = {
  ...V1_AFTER_06,
  history: {
    "2026-06-11": {
      "math-shiki-keisan/q1": {
        correct: 1,
        wrong: 0,
        dontKnow: 1,
        hints: 2,
        timeMs: 45000,
      },
    },
  },
};

/** 計画12（習熟度）追加後・計画25（写経）より前の形式（mastery に wrongStreak が無い） */
export const V1_AFTER_12 = {
  ...V1_AFTER_17,
  celebrated: ["answered:100"],
  selectedSkin: "main",
  mastery: {
    "shiki-doruiko": {
      level: 0,
      streak: 1,
      lastCorrectDate: "2026-06-10",
      dueDate: "2026-06-13",
      setId: "math-shiki-keisan",
    },
    "sci-kagaku-keisuu": {
      level: 1,
      streak: 0,
      lastCorrectDate: "2026-06-09",
      dueDate: "2026-06-16",
      setId: "sci-kagaku-hannoushiki",
    },
  },
};

/** 計画26（前提遡り）まで・計画27（効果音）より前の形式（muted なし・wrongStreak あり） */
export const V1_AFTER_26 = {
  ...V1_AFTER_12,
  mastery: {
    ...V1_AFTER_12.mastery,
    "math-shiki-touhen": {
      level: -1,
      streak: 0,
      wrongStreak: 2,
      lastCorrectDate: "",
      dueDate: "2026-06-13",
      setId: "math-shiki-touhen",
    },
  },
};

/** 計画27（効果音）まで・計画28（週間目標）より前の形式（muted あり・goals なし） */
export const V1_AFTER_27 = {
  ...V1_AFTER_26,
  muted: false,
};

/** 計画28（週間目標）まで・計画29-34（挑戦束・再戦・形式切替）より前の形式
 * （goals あり・bundles なし・history に rematch/fullHint/switchUp/switchDown が無い） */
export const V1_AFTER_28 = {
  ...V1_AFTER_27,
  goals: {
    active: ["count-35"],
    next: null,
    weekStart: "2026-06-08",
    introDismissed: true,
  },
};

export const ALL_FIXTURES: Record<string, unknown> = {
  "v1-initial": V1_INITIAL,
  "v1-after-04": V1_AFTER_04,
  "v1-after-01": V1_AFTER_01,
  "v1-after-06": V1_AFTER_06,
  "v1-after-17": V1_AFTER_17,
  "v1-after-12": V1_AFTER_12,
  "v1-after-26": V1_AFTER_26,
  "v1-after-27": V1_AFTER_27,
  "v1-after-28": V1_AFTER_28,
};
