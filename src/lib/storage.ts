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

export interface SetRecord {
  attempts: number;
  /** ベストスコア（正答率 0-100） */
  best: number;
  lastScore: number;
  lastAt: string;
}

export interface AppState {
  xp: number;
  streak: { count: number; lastDate: string };
  /** "YYYY-MM-DD" → その日の記録 */
  dailyLog: Record<string, DayLog>;
  /** "setId/questionId" → 成績 */
  questionStats: Record<string, QuestionStat>;
  setRecords: Record<string, SetRecord>;
}

const KEY = "ablearn:v1";

export function emptyState(): AppState {
  return {
    xp: 0,
    streak: { count: 0, lastDate: "" },
    dailyLog: {},
    questionStats: {},
    setRecords: {},
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

/** 直近の解答が不正解の問題キー（"setId/questionId"）一覧 */
export function wrongQuestionKeys(state: AppState): string[] {
  return Object.entries(state.questionStats)
    .filter(([, s]) => !s.lastCorrect)
    .map(([key]) => key);
}
