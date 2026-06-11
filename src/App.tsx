import { useEffect, useMemo, useState } from "react";
import type { ContentIndex, Question, SetMeta } from "./types";
import { buildSetLookup, loadIndex, loadSet } from "./lib/content";
import {
  AppState,
  MockResult,
  TestPlan,
  addDailyLog,
  currentStreak,
  loadState,
  recordHistory,
  recordQuestion,
  recordSetResult,
  saveState,
  todayKey,
  touchStreak,
  wrongQuestionKeys,
} from "./lib/storage";
import { recommend } from "./lib/recommend";
import { shuffle } from "./lib/quiz";
import HomeScreen from "./screens/HomeScreen";
import LibraryScreen from "./screens/LibraryScreen";
import ReviewScreen from "./screens/ReviewScreen";
import StatsScreen from "./screens/StatsScreen";
import QuizScreen from "./screens/QuizScreen";
import TestSetupScreen from "./screens/TestSetupScreen";
import MockTestScreen from "./screens/MockTestScreen";

export type Tab = "home" | "library" | "review" | "stats";

export interface QuizItem {
  question: Question;
  setId: string;
}

export interface Session {
  title: string;
  items: QuizItem[];
  /** 通常セッション（単一セット）のときだけセットIDを持つ */
  setId: string | null;
}

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "home", icon: "🏠", label: "ホーム" },
  { id: "library", icon: "📚", label: "学習" },
  { id: "review", icon: "🔁", label: "復習" },
  { id: "stats", icon: "📈", label: "記録" },
];

const REVIEW_SESSION_MAX = 20;

export default function App() {
  const [index, setIndex] = useState<ContentIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<AppState>(loadState);
  const [tab, setTab] = useState<Tab>("home");
  const [session, setSession] = useState<Session | null>(null);
  const [editingTest, setEditingTest] = useState(false);
  const [mockOpen, setMockOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e) => setLoadError(String(e)));
  }, []);

  const lookup = useMemo(
    () => (index ? buildSetLookup(index) : new Map()),
    [index]
  );
  const wrongKeys = useMemo(() => wrongQuestionKeys(state), [state]);

  /** 今日のおすすめ（日常: 進行中単元 / テストモード: 範囲×試験日が近い教科優先） */
  const recommendations = useMemo(
    () => (index ? recommend(index, state, todayKey()) : []),
    [index, state]
  );

  async function startSet(meta: SetMeta) {
    if (busy) return;
    setBusy(true);
    try {
      const set = await loadSet(meta);
      setSession({
        title: set.title,
        setId: meta.id,
        items: set.questions.map((q) => ({ question: q, setId: meta.id })),
      });
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startReview() {
    if (busy || wrongKeys.length === 0) return;
    setBusy(true);
    try {
      // setId ごとに不正解の問題IDをまとめる
      const bySet = new Map<string, Set<string>>();
      for (const key of wrongKeys) {
        const i = key.indexOf("/");
        const setId = key.slice(0, i);
        const qId = key.slice(i + 1);
        if (!bySet.has(setId)) bySet.set(setId, new Set());
        bySet.get(setId)!.add(qId);
      }
      const items: QuizItem[] = [];
      for (const [setId, qIds] of bySet) {
        const entry = lookup.get(setId);
        if (!entry) continue; // コンテンツ更新で消えたセットは無視
        const set = await loadSet(entry.meta);
        for (const q of set.questions) {
          if (qIds.has(q.id)) items.push({ question: q, setId });
        }
      }
      if (items.length === 0) {
        alert("復習できる問題が見つかりませんでした");
        return;
      }
      setSession({
        title: "復習",
        setId: null,
        items: shuffle(items).slice(0, REVIEW_SESSION_MAX),
      });
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleAnswer(
    setId: string,
    questionId: string,
    correct: boolean,
    xp: number,
    recordStat: boolean,
    timeMs: number
  ) {
    setState((prev) => {
      let s = recordStat
        ? recordQuestion(prev, setId, questionId, correct)
        : prev;
      s = recordHistory(s, setId, questionId, correct, timeMs);
      s = addDailyLog(s, { answered: 1, correct: correct ? 1 : 0, xp });
      s = { ...s, xp: s.xp + xp };
      return touchStreak(s);
    });
  }

  function handleFinish(score: number) {
    const setId = session?.setId;
    if (setId) setState((prev) => recordSetResult(prev, setId, score));
  }

  function toggleUnit(subjectId: string, unitId: string) {
    setState((prev) => {
      const cur = prev.currentUnits[subjectId] ?? [];
      const next = cur.includes(unitId)
        ? cur.filter((id) => id !== unitId)
        : [...cur, unitId];
      return {
        ...prev,
        currentUnits: { ...prev.currentUnits, [subjectId]: next },
      };
    });
  }

  function saveTest(test: TestPlan) {
    setState((prev) => ({ ...prev, test }));
    setEditingTest(false);
  }

  function clearTest() {
    setState((prev) => ({ ...prev, test: null }));
    setEditingTest(false);
  }

  function finishMock(result: MockResult) {
    setState((prev) => ({
      ...prev,
      mockResults: [...prev.mockResults, result],
    }));
  }

  if (loadError) {
    return (
      <div className="empty-note">
        <p>コンテンツを読み込めませんでした。</p>
        <p className="muted">{loadError}</p>
      </div>
    );
  }
  if (!index) return <div className="loading">読み込み中…</div>;

  const today = state.dailyLog[todayKey()];

  return (
    <>
      {tab === "home" && (
        <HomeScreen
          state={state}
          streak={currentStreak(state)}
          todayAnswered={today?.answered ?? 0}
          recommendations={recommendations}
          wrongCount={wrongKeys.length}
          subjects={index.subjects}
          onStartSet={startSet}
          onStartReview={startReview}
          onGoLibrary={() => setTab("library")}
          onEditTest={() => setEditingTest(true)}
          onClearTest={clearTest}
          onStartMock={() => setMockOpen(true)}
        />
      )}
      {tab === "library" && (
        <LibraryScreen
          index={index}
          state={state}
          onStartSet={startSet}
          onToggleUnit={toggleUnit}
        />
      )}
      {tab === "review" && (
        <ReviewScreen
          index={index}
          state={state}
          wrongKeys={wrongKeys}
          onStart={startReview}
        />
      )}
      {tab === "stats" && (
        <StatsScreen state={state} onImport={(s) => setState(s)} />
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
            {t.id === "review" && wrongKeys.length > 0 && (
              <span className="badge">{wrongKeys.length}</span>
            )}
          </button>
        ))}
      </nav>

      {mockOpen && (
        <MockTestScreen
          index={index}
          state={state}
          onAnswer={handleAnswer}
          onFinishMock={finishMock}
          onClose={() => setMockOpen(false)}
        />
      )}

      {editingTest && (
        <TestSetupScreen
          index={index}
          state={state}
          onSave={saveTest}
          onCancel={() => setEditingTest(false)}
          onDelete={clearTest}
        />
      )}

      {session && (
        <QuizScreen
          title={session.title}
          items={session.items}
          onAnswer={handleAnswer}
          onFinish={handleFinish}
          onClose={() => setSession(null)}
        />
      )}
    </>
  );
}
