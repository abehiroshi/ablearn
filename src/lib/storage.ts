// localStorage への永続化。1人で使う前提なのでユーザー管理はしない。

export interface DayLog {
  answered: number;
  correct: number;
  xp: number;
}

export interface QuestionStat {
  setId: string;
  correct: number;
  wrong: number;
  /** 直近の解答が正解だったか。false のものが「復習対象」 */
  lastCorrect: boolean;
  updatedAt: string;
}

export interface QuestionDayStat {
  correct: number;
  wrong: number;
  /** 「わからない」を選んだ回数。当て推量の誤答と区別する（計画17） */
  dontKnow: number;
  /** ヒント使用数（計画07で記録開始） */
  hints: number;
  /** 問題表示から解答確定までの合計（ms） */
  timeMs: number;
}

export interface SetRecord {
  attempts: number;
  /** ベストスコア（正答率 0-100） */
  best: number;
  lastScore: number;
  lastAt: string;
}

/** テストの1日分: 日付とその日に受ける教科の並び */
export interface TestDay {
  date: string; // "YYYY-MM-DD"
  subjects: string[]; // subjectId の並び
}

/** 次のテスト（1件のみ）。最終日を過ぎたらクリアして日常モードへ戻る */
export interface TestPlan {
  name: string;
  days: TestDay[];
  /** subjectId → テスト範囲のセットID群 */
  range: Record<string, string[]>;
}

/** 模擬テスト1回分の結果 */
export interface MockResult {
  at: string; // ISO 日時
  score: number; // 100点換算
  correct: number;
  total: number;
  rangeLabel: string;
  durationMin: number;
}

export interface AppState {
  xp: number;
  streak: { count: number; lastDate: string };
  /** "YYYY-MM-DD" → その日の記録 */
  dailyLog: Record<string, DayLog>;
  /** "setId/questionId" → 成績 */
  questionStats: Record<string, QuestionStat>;
  setRecords: Record<string, SetRecord>;
  /** "YYYY-MM-DD" → "setId/questionId" → 日次集計（成長グラフの元データ） */
  history: Record<string, Record<string, QuestionDayStat>>;
  /** subjectId → いま授業でやっている単元ID群 */
  currentUnits: Record<string, string[]>;
  test: TestPlan | null;
  mockResults: MockResult[];
}

const KEY = "ablearn:v1";

export function emptyState(): AppState {
  return {
    xp: 0,
    streak: { count: 0, lastDate: "" },
    dailyLog: {},
    questionStats: {},
    setRecords: {},
    history: {},
    currentUnits: {},
    test: null,
    mockResults: [],
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return { ...emptyState(), ...(JSON.parse(raw) as AppState) };
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function todayKey(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000
  );
}

/** 学習した日として streak を更新した新しい state を返す */
export function touchStreak(state: AppState): AppState {
  const today = todayKey();
  const { count, lastDate } = state.streak;
  if (lastDate === today) return state;
  const next =
    lastDate && daysBetween(lastDate, today) === 1 ? count + 1 : 1;
  return { ...state, streak: { count: next, lastDate: today } };
}

/** 表示用: 今日学習していなくても昨日まで続いていれば streak は生きている */
export function currentStreak(state: AppState): number {
  const { count, lastDate } = state.streak;
  if (!lastDate) return 0;
  const diff = daysBetween(lastDate, todayKey());
  return diff <= 1 ? count : 0;
}

export function addDailyLog(
  state: AppState,
  delta: Partial<DayLog>
): AppState {
  const key = todayKey();
  const cur = state.dailyLog[key] ?? { answered: 0, correct: 0, xp: 0 };
  return {
    ...state,
    dailyLog: {
      ...state.dailyLog,
      [key]: {
        answered: cur.answered + (delta.answered ?? 0),
        correct: cur.correct + (delta.correct ?? 0),
        xp: cur.xp + (delta.xp ?? 0),
      },
    },
  };
}

export function recordQuestion(
  state: AppState,
  setId: string,
  questionId: string,
  isCorrect: boolean
): AppState {
  const key = `${setId}/${questionId}`;
  const cur = state.questionStats[key] ?? {
    setId,
    correct: 0,
    wrong: 0,
    lastCorrect: true,
    updatedAt: "",
  };
  return {
    ...state,
    questionStats: {
      ...state.questionStats,
      [key]: {
        ...cur,
        setId,
        correct: cur.correct + (isCorrect ? 1 : 0),
        wrong: cur.wrong + (isCorrect ? 0 : 1),
        lastCorrect: isCorrect,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export function recordSetResult(
  state: AppState,
  setId: string,
  score: number
): AppState {
  const cur = state.setRecords[setId] ?? {
    attempts: 0,
    best: 0,
    lastScore: 0,
    lastAt: "",
  };
  return {
    ...state,
    setRecords: {
      ...state.setRecords,
      [setId]: {
        attempts: cur.attempts + 1,
        best: Math.max(cur.best, score),
        lastScore: score,
        lastAt: new Date().toISOString(),
      },
    },
  };
}

// ===== バックアップ（エクスポート/インポート） =====
// AppState の中身には立ち入らず、全体を不透明に入出力する。

const SCHEMA_VERSION = 1;

export interface BackupFile {
  app: "ablearn";
  schemaVersion: number;
  exportedAt: string;
  state: AppState;
}

export function makeBackup(state: AppState): BackupFile {
  return {
    app: "ablearn",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
}

/** バックアップ JSON を検証して返す。不正なら日本語メッセージで throw */
export function parseBackup(json: string): BackupFile {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error("JSONファイルとして読み込めませんでした");
  }
  const b = obj as Partial<BackupFile>;
  if (!b || b.app !== "ablearn" || typeof b.state !== "object" || !b.state) {
    throw new Error("Ablearn のバックアップファイルではありません");
  }
  if (typeof b.schemaVersion !== "number" || b.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      "このバックアップは新しいバージョンのアプリで作られています"
    );
  }
  const s = b.state as Partial<AppState>;
  if (typeof s.xp !== "number" || typeof s.dailyLog !== "object") {
    throw new Error("バックアップの中身が壊れています");
  }
  // 旧バージョンのバックアップでも欠けたフィールドを補う
  return { ...(b as BackupFile), state: { ...emptyState(), ...b.state } };
}

/**
 * 当日の問題別履歴に1解答分を加算する（リトライも含めすべての解答が対象）。
 * result: true=正解 / false=不正解 / "dontKnow"=わからない（不正解と区別して記録）
 */
export function recordHistory(
  state: AppState,
  setId: string,
  questionId: string,
  result: boolean | "dontKnow",
  timeMs: number,
  hints = 0
): AppState {
  const day = todayKey();
  const key = `${setId}/${questionId}`;
  const dayStats = state.history[day] ?? {};
  const cur = dayStats[key] ?? {
    correct: 0,
    wrong: 0,
    dontKnow: 0,
    hints: 0,
    timeMs: 0,
  };
  return {
    ...state,
    history: {
      ...state.history,
      [day]: {
        ...dayStats,
        [key]: {
          correct: cur.correct + (result === true ? 1 : 0),
          wrong: cur.wrong + (result === false ? 1 : 0),
          // 計画17より前の記録には dontKnow が無い
          dontKnow: (cur.dontKnow ?? 0) + (result === "dontKnow" ? 1 : 0),
          hints: cur.hints + hints,
          timeMs: cur.timeMs + Math.max(0, Math.round(timeMs)),
        },
      },
    },
  };
}

/** 直近の解答が不正解の問題キー（"setId/questionId"）一覧 */
export function wrongQuestionKeys(state: AppState): string[] {
  return Object.entries(state.questionStats)
    .filter(([, s]) => !s.lastCorrect)
    .map(([key]) => key);
}
