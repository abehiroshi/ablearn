import { useEffect, useMemo, useState } from "react";
import type { ContentIndex, LessonStep, Question, SetMeta } from "./types";
import { buildSetLookup, loadAllSets, loadIndex, loadSet } from "./lib/content";
import {
  ContentCounts,
  Milestone,
  answeredMilestones,
  buildContentCounts,
} from "./lib/milestones";
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
import { applyAnswer, buildAdaptiveItems, emptyMastery } from "./lib/mastery";
import { shuffle } from "./lib/quiz";
import HomeScreen from "./screens/HomeScreen";
import LibraryScreen from "./screens/LibraryScreen";
import ReviewScreen from "./screens/ReviewScreen";
import StatsScreen from "./screens/StatsScreen";
import QuizScreen from "./screens/QuizScreen";
import TestSetupScreen from "./screens/TestSetupScreen";
import MockTestScreen from "./screens/MockTestScreen";
import LessonScreen from "./screens/LessonScreen";
import FooterNav from "./components/FooterNav";

export type Tab = "home" | "library" | "mock" | "review" | "stats";

export interface QuizItem {
  question: Question;
  setId: string;
  /**
   * answers を持つ choice 問題を input（自力入力）形式で出すフラグ。
   * 出し分けの判断は習熟度エンジン（計画12）が行う
   */
  asInput?: boolean;
}

export interface Session {
  title: string;
  items: QuizItem[];
  /** 通常セッション（単一セット）のときだけセットIDを持つ */
  setId: string | null;
}

export interface LessonSession {
  title: string;
  setId: string;
  steps: LessonStep[];
}

const REVIEW_SESSION_MAX = 20;

export default function App() {
  const [index, setIndex] = useState<ContentIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<AppState>(loadState);
  const [tab, setTab] = useState<Tab>("home");
  const [session, setSession] = useState<Session | null>(null);
  const [lesson, setLesson] = useState<LessonSession | null>(null);
  const [editingTest, setEditingTest] = useState(false);
  // ホームの教科一覧から Library を開いたとき、その教科を最初から表示する
  const [libraryFocus, setLibraryFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 達成度の分母（全セットの問題数）。読み込み完了まで達成度系は出さない
  const [counts, setCounts] = useState<ContentCounts | null>(null);

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e) => setLoadError(String(e)));
  }, []);
  useEffect(() => {
    if (!index) return;
    let cancelled = false;
    const load = () =>
      loadAllSets(index).then((sets) => {
        if (!cancelled) setCounts(buildContentCounts(index, sets));
      });
    // 失敗すると達成度の節目を逃す（単調増加で再到達できない）ため1回だけリトライ
    load().catch(() => {
      setTimeout(() => void load().catch(() => {}), 5000);
    });
    return () => {
      cancelled = true;
    };
  }, [index]);

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
      if (set.kind === "lesson") {
        const steps = set.steps ?? [];
        if (steps.length === 0) {
          alert("レッスンの中身がありません");
          return;
        }
        setLesson({ title: set.title, setId: meta.id, steps });
        return;
      }
      setSession({
        title: set.title,
        setId: meta.id,
        // 概念ラダーは習熟度の段に合わせた変種に絞る（concept 無しは従来どおり）
        items: buildAdaptiveItems(set.questions, meta.id, state),
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
        for (const q of set.questions ?? []) {
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
    timeMs: number,
    hintsUsed: number,
    dontKnow = false,
    concept?: string,
    hintsTotal = 0
  ): { promotedTo: number | null; milestones: Milestone[] } {
    const signal = {
      correct,
      dontKnow,
      hintsUsed,
      hintsTotal,
      today: todayKey(),
    };
    // 昇格したか・跨いだ節目を呼び出し元（フィードバック/結果表示）に返す
    let promotedTo: number | null = null;
    if (concept) {
      const cur = state.mastery[concept] ?? emptyMastery();
      const next = applyAnswer(cur, signal);
      if (next.level > cur.level) promotedTo = next.level;
    }
    const milestones = answeredMilestones(state, {
      setId,
      questionId,
      correct,
      counts,
    });
    setState((prev) => {
      // 「わからない」も復習対象には不正解として入れる（履歴では区別する）
      let s = recordStat
        ? recordQuestion(prev, setId, questionId, correct)
        : prev;
      s = recordHistory(
        s,
        setId,
        questionId,
        dontKnow ? "dontKnow" : correct,
        timeMs,
        hintsUsed
      );
      s = addDailyLog(s, { answered: 1, correct: correct ? 1 : 0, xp });
      s = { ...s, xp: s.xp + xp };
      if (concept) {
        const cur = prev.mastery[concept] ?? emptyMastery();
        s = {
          ...s,
          mastery: {
            ...s.mastery,
            [concept]: { ...applyAnswer(cur, signal), setId },
          },
        };
      }
      if (milestones.length > 0) {
        // 祝福は一度だけ: 跨いだ節目を祝福済みとして記録
        const ids = milestones
          .map((m) => m.id)
          .filter((id) => !prev.celebrated.includes(id));
        s = { ...s, celebrated: [...s.celebrated, ...ids] };
      }
      return touchStreak(s);
    });
    return { promotedTo, milestones };
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
          onOpenSubject={(id) => {
            setLibraryFocus(id);
            setTab("library");
          }}
          counts={counts}
        />
      )}
      {tab === "library" && (
        <LibraryScreen
          key={libraryFocus ?? "none"}
          index={index}
          state={state}
          onStartSet={startSet}
          onToggleUnit={toggleUnit}
          focusSubjectId={libraryFocus}
          counts={counts}
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
        <StatsScreen
          index={index}
          state={state}
          counts={counts}
          onImport={(s) => setState(s)}
        />
      )}
      {tab === "mock" && (
        <MockTestScreen
          asTab
          index={index}
          state={state}
          onAnswer={handleAnswer}
          onFinishMock={finishMock}
          onClose={() => setTab("home")}
        />
      )}

      <FooterNav
        active={tab}
        reviewCount={wrongKeys.length}
        onSelect={(id) => {
          setLibraryFocus(null); // タブから開くときは教科一覧から
          setTab(id);
        }}
      />

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

      {lesson && (
        <LessonScreen
          title={lesson.title}
          setId={lesson.setId}
          steps={lesson.steps}
          onAnswer={handleAnswer}
          onFinish={(score) =>
            setState((prev) => recordSetResult(prev, lesson.setId, score))
          }
          onClose={() => setLesson(null)}
        />
      )}
    </>
  );
}
