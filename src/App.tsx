import { useEffect, useMemo, useState } from "react";
import type {
  ConceptMeta,
  ContentIndex,
  ContentLink,
  LessonStep,
  Question,
  QuestionSet,
  SetMeta,
  Unit,
} from "./types";
import {
  buildSetLookup,
  loadAllSets,
  loadConcepts,
  loadIndex,
  loadSet,
} from "./lib/content";
import { buildConceptMap, pickPrereq } from "./lib/prereq";
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
import { isTestActive, recommend } from "./lib/recommend";
import {
  ChallengeCandidate,
  buildChallengeItems,
  challengeQuota,
  goalMilestones,
  rolloverGoals,
  selectGoals,
} from "./lib/goals";
import {
  applyAnswer,
  buildAdaptiveItems,
  emptyMastery,
  recommendHintStyle,
} from "./lib/mastery";
import {
  RematchCandidate,
  pickRematches,
  tagRematchItems,
} from "./lib/rematch";
import { buildTrack, sugorokuMilestoneId } from "./lib/sugoroku";
import {
  BeforeInstallPromptEvent,
  dismissInstallGuide,
  installGuideFor,
  isAndroid,
  isInstallGuideDismissed,
  isIos,
  isStandalone,
} from "./lib/install";
import { shuffle } from "./lib/quiz";
import { playTap, setSoundMuted } from "./lib/sound";
import HomeScreen from "./screens/HomeScreen";
import LibraryScreen from "./screens/LibraryScreen";
import ReviewScreen from "./screens/ReviewScreen";
import StatsScreen from "./screens/StatsScreen";
import QuizScreen from "./screens/QuizScreen";
import TestSetupScreen from "./screens/TestSetupScreen";
import MockTestScreen from "./screens/MockTestScreen";
import LessonScreen from "./screens/LessonScreen";
import FooterNav from "./components/FooterNav";
import { SkinContext } from "./components/Abler";
import { skinUnlockedBy } from "./lib/skins";

export type Tab = "home" | "library" | "mock" | "review" | "stats";

export interface QuizItem {
  question: Question;
  setId: string;
  /**
   * answers を持つ choice 問題を input（自力入力）形式で出すフラグ。
   * 出し分けの判断は習熟度エンジン（計画12）が行う
   */
  asInput?: boolean;
  /**
   * 写経モード（計画25）: 正解をゴースト表示し、見ながら打てたら完了。
   * 写経段（level -1）の概念に習熟度エンジンが立てる
   */
  asTrace?: boolean;
  /** 再戦（計画30）: 翌日以降に再会する過去不正解問題。フレーム表示と勝敗演出に使う */
  rematch?: { daysAgo: number };
}

export interface Session {
  title: string;
  items: QuizItem[];
  /** 通常セッション（単一セット）のときだけセットIDを持つ */
  setId: string | null;
  /** 挑戦束（計画29）。完走で今日の束を完遂にする */
  kind?: "challenge";
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
  // 全セットの中身（挑戦束の候補プール用。計画29）。counts と同じ読み込みを使う
  const [allSets, setAllSets] = useState<Record<string, QuestionSet> | null>(
    null
  );
  // 概念メタ（前提宣言。計画26）。読み込み失敗時は空 = 遡り誘導なしで動く
  const [concepts, setConcepts] = useState<ConceptMeta[]>([]);
  // ホーム画面に追加の案内（計画37）
  const [installDismissed, setInstallDismissed] = useState(
    isInstallGuideDismissed
  );
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e) => setLoadError(String(e)));
    loadConcepts().then(setConcepts);
  }, []);
  // 週間目標（計画28）: 週が替わっていたら翌週適用の予約を反映する
  useEffect(() => {
    setState((prev) => {
      const g = rolloverGoals(prev.goals, todayKey());
      return g === prev.goals ? prev : { ...prev, goals: g };
    });
  }, []);
  // 効果音（計画27）: ミュート設定の反映と、ボタン・リンクへのタップ音の一括取り付け。
  // pointerdown（ユーザー操作）起点なので AudioContext の作成・resume が許可される
  useEffect(() => setSoundMuted(state.muted), [state.muted]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.("button, a")) playTap();
    };
    document.addEventListener("pointerdown", onDown, {
      capture: true,
      passive: true,
    });
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);
  // Android Chrome 等の install prompt を捕まえる（計画37）。iOS では発火しない
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  useEffect(() => {
    if (!index) return;
    let cancelled = false;
    const load = () =>
      loadAllSets(index).then((sets) => {
        if (cancelled) return;
        setCounts(buildContentCounts(index, sets));
        setAllSets(sets);
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

  /** setId → その単元のレッスン・外部リンク（つまずき誘導用。計画13） */
  const unitGuide = useMemo(() => {
    const map = new Map<
      string,
      { lesson: SetMeta | null; links: ContentLink[] }
    >();
    if (!index) return map;
    for (const subject of index.subjects) {
      for (const unit of subject.units) {
        const lesson = unit.sets.find((m) => m.kind === "lesson") ?? null;
        for (const meta of unit.sets) {
          map.set(meta.id, { lesson, links: unit.links ?? [] });
        }
      }
    }
    return map;
  }, [index]);

  const conceptMap = useMemo(() => buildConceptMap(concepts), [concepts]);

  /** setId → その単元（すごろくの踏破判定用。計画33） */
  const setUnit = useMemo(() => {
    const map = new Map<string, { subjectId: string; unit: Unit }>();
    if (!index) return map;
    for (const subject of index.subjects) {
      for (const unit of subject.units) {
        for (const meta of unit.sets) {
          map.set(meta.id, { subjectId: subject.id, unit });
        }
      }
    }
    return map;
  }, [index]);

  /**
   * セット完走後、単元すごろくの全マスクリアなら祝福を記録する（計画33。
   * 18の体系に相乗り＝バッジ棚に残る。一度きり）
   */
  function celebrateSugoroku(s: AppState, setId: string): AppState {
    const entry = setUnit.get(setId);
    if (!entry) return s;
    if (!buildTrack(entry.unit, s).allClear) return s;
    const id = sugorokuMilestoneId(entry.subjectId, entry.unit.id);
    if (s.celebrated.includes(id)) return s;
    return { ...s, celebrated: [...s.celebrated, id] };
  }

  /**
   * つまずいた概念の「前提概念の復習」誘導先（計画26）。
   * 習熟の低い前提があれば、その前提のセットを単元レッスンより優先して提示する
   */
  function prereqFor(
    concept: string,
    currentSetId: string
  ): { name: string; set: SetMeta } | null {
    const p = pickPrereq(concept, conceptMap, state.mastery, {
      currentSetId,
      setExists: (id) => lookup.has(id),
    });
    if (!p || !p.set) return null;
    const entry = lookup.get(p.set);
    return entry ? { name: p.name, set: entry.meta } : null;
  }

  /** 週間目標の進捗計算に渡す共通コンテキスト（計画28） */
  function goalCtx(s: AppState) {
    return {
      state: s,
      today: todayKey(),
      setSubject: (id: string) => lookup.get(id)?.subject.id,
      isLesson: (id: string) => lookup.get(id)?.meta.kind === "lesson",
      rangeSetIds: isTestActive(s.test, todayKey())
        ? Object.values(s.test!.range).flat()
        : null,
      setTotals: counts?.setTotals ?? null,
    };
  }

  /** 今日のおすすめ（日常: 進行中単元 / テストモード: 範囲×試験日が近い教科優先） */
  const recommendations = useMemo(
    () => (index ? recommend(index, state, todayKey()) : []),
    [index, state]
  );

  /**
   * 挑戦束（計画29）の候補プール。テスト範囲 → 進行中単元 → その他の優先順で、
   * 層内はシャッフル（毎日同じ束にならないように）。レッスンは除く
   */
  const challengePool = useMemo<ChallengeCandidate[]>(() => {
    if (!index || !allSets) return [];
    const testRange = isTestActive(state.test, todayKey())
      ? new Set(Object.values(state.test!.range).flat())
      : null;
    const tiers: ChallengeCandidate[][] = [[], [], []];
    for (const subject of index.subjects) {
      const current = state.currentUnits[subject.id] ?? [];
      for (const unit of subject.units) {
        for (const meta of unit.sets) {
          if (meta.kind === "lesson") continue;
          const tier = testRange?.has(meta.id)
            ? 0
            : current.includes(unit.id)
              ? 1
              : 2;
          for (const q of allSets[meta.id]?.questions ?? []) {
            tiers[tier].push({
              question: q,
              setId: meta.id,
              math: subject.id === "math",
            });
          }
        }
      }
    }
    return tiers.flatMap((t) => shuffle(t));
  }, [index, allSets, state.test, state.currentUnits]);

  /**
   * 再戦カードの候補（計画30）。ゲート判定に必要なメタ（concept・関連演習の完走日時）を
   * 既存の記録から引いて、古い失敗から少数だけ選ぶ
   */
  const rematches = useMemo<RematchCandidate[]>(() => {
    if (!allSets) return [];
    const candidates: RematchCandidate[] = [];
    for (const qkey of wrongKeys) {
      const stat = state.questionStats[qkey];
      const setId = stat.setId;
      const set = allSets[setId];
      if (!set) continue; // コンテンツ更新で消えたセットは無視
      const qId = qkey.slice(qkey.indexOf("/") + 1);
      const q = set.questions?.find((x) => x.id === qId);
      if (!q) continue;
      const related: string[] = [];
      const rec = state.setRecords[setId];
      if (rec) related.push(rec.lastAt);
      const lesson = unitGuide.get(setId)?.lesson;
      const lessonRec = lesson ? state.setRecords[lesson.id] : undefined;
      if (lessonRec) related.push(lessonRec.lastAt);
      candidates.push({
        qkey,
        failedAt: stat.updatedAt.slice(0, 10),
        concept: q.concept,
        relatedDoneAt: related,
      });
    }
    return pickRematches(candidates, state, todayKey());
  }, [allSets, wrongKeys, state, unitGuide]);

  /** 再戦セッション（計画30）: ゲートを満たした過去不正解問題に再戦フレームを付けて出す */
  function startRematch() {
    if (!allSets || rematches.length === 0) return;
    const items: QuizItem[] = [];
    for (const c of rematches) {
      const setId = c.qkey.slice(0, c.qkey.indexOf("/"));
      const qId = c.qkey.slice(c.qkey.indexOf("/") + 1);
      const q = allSets[setId]?.questions?.find((x) => x.id === qId);
      if (q) items.push({ question: q, setId });
    }
    if (items.length === 0) return;
    setSession({
      title: "再戦",
      setId: null,
      items: tagRematchItems(items, state.questionStats, todayKey()),
    });
  }

  /** 束を選ぶ（計画29）。挑戦なら束のセッションを開始する */
  function chooseBundle(choice: "normal" | "challenge", normalQuota: number) {
    const quota = challengeQuota(normalQuota);
    const items =
      choice === "challenge" ? buildChallengeItems(challengePool, quota) : null;
    if (choice === "challenge" && !items) return; // 候補不足（UI側で出さないが念のため）
    setState((prev) => ({
      ...prev,
      bundles: {
        ...prev.bundles,
        [todayKey()]: {
          choice,
          normalQuota,
          challengeQuota: quota,
          completed: false,
        },
      },
    }));
    if (items) {
      setSession({
        title: "今日の挑戦束",
        setId: null,
        kind: "challenge",
        items: tagRematchItems(items, state.questionStats, todayKey()),
      });
    }
  }

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
        // 概念ラダーは習熟度の段に合わせた変種に絞る（concept 無しは従来どおり）。
        // 翌日以降の過去不正解問題には再戦フレームを付ける（計画30）
        items: tagRematchItems(
          buildAdaptiveItems(set.questions, meta.id, state),
          state.questionStats,
          todayKey()
        ),
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
        // 翌日以降の過去不正解問題には再戦フレームを付ける（計画30）
        items: tagRematchItems(
          shuffle(items).slice(0, REVIEW_SESSION_MAX),
          state.questionStats,
          todayKey()
        ),
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
    hintsTotal = 0,
    trace = false,
    rematch = false,
    fullHint = false,
    form?: "choice" | "input",
    formSwitch?: "up" | "down"
  ): { promotedTo: number | null; milestones: Milestone[] } {
    const signal = {
      correct,
      dontKnow,
      hintsUsed,
      hintsTotal,
      trace,
      // 昇降格の証拠は提示形式ではなく実際に解答した形式（計画34）
      form,
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
    // 節目がスキンを解放するなら、解放の祝福も添える（記録は不要＝節目側が一度きり）
    for (const m of [...milestones]) {
      const skin = skinUnlockedBy(m.id);
      if (skin) {
        milestones.push({
          id: `skin:${skin.id}`,
          emoji: "🎁",
          label: `着せ替え「${skin.name}」がアンロック！`,
          big: true,
        });
      }
    }
    // 週間目標の達成チェック（計画28）: この解答を反映した状態で判定する
    {
      let post = recordStat
        ? recordQuestion(state, setId, questionId, correct)
        : state;
      post = recordHistory(
        post,
        setId,
        questionId,
        dontKnow ? "dontKnow" : correct,
        timeMs,
        hintsUsed,
        rematch,
        fullHint,
        formSwitch
      );
      post = addDailyLog(post, { answered: 1, correct: correct ? 1 : 0, xp });
      milestones.push(
        ...goalMilestones(post.goals, goalCtx(post), state.celebrated)
      );
    }
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
        hintsUsed,
        rematch,
        fullHint,
        formSwitch
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
    if (setId)
      setState((prev) =>
        celebrateSugoroku(recordSetResult(prev, setId, score), setId)
      );
    // 挑戦束の完走（計画29）: 完遂を記録し、寄与同等で達成した週目標があれば祝福を記録
    if (session?.kind === "challenge") {
      setState((prev) => {
        const today = todayKey();
        const b = prev.bundles[today];
        if (!b || b.choice !== "challenge" || b.completed) return prev;
        const next = {
          ...prev,
          bundles: { ...prev.bundles, [today]: { ...b, completed: true } },
        };
        const ms = goalMilestones(next.goals, goalCtx(next), prev.celebrated);
        return ms.length > 0
          ? {
              ...next,
              celebrated: [...next.celebrated, ...ms.map((m) => m.id)],
            }
          : next;
      });
    }
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
    setState((prev) => {
      const next = { ...prev, mockResults: [...prev.mockResults, result] };
      // 模擬テスト系の週目標はここで達成が確定する（計画28）。
      // 模試の結果画面にチップは出さず、祝福済みとして記録だけする（ホームで達成表示）
      const ms = goalMilestones(next.goals, goalCtx(next), prev.celebrated);
      return ms.length > 0
        ? { ...next, celebrated: [...next.celebrated, ...ms.map((m) => m.id)] }
        : next;
    });
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
    <SkinContext.Provider value={state.selectedSkin}>
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
          setSubject={(id) => lookup.get(id)?.subject.id}
          isLesson={(id) => lookup.get(id)?.meta.kind === "lesson"}
          onSelectGoals={(ids) =>
            setState((prev) => ({
              ...prev,
              goals: selectGoals(prev.goals, ids, todayKey()),
            }))
          }
          onDismissGoalsIntro={() =>
            setState((prev) => ({
              ...prev,
              goals: { ...prev.goals, introDismissed: true },
            }))
          }
          canChallenge={(quota) =>
            buildChallengeItems(challengePool, quota) !== null
          }
          onChooseBundle={chooseBundle}
          installGuide={installGuideFor({
            ios: isIos(),
            standalone: isStandalone(),
            dismissed: installDismissed,
            // デスクトップ Chrome も prompt を発火させるため Android に限定
            canPrompt: installPrompt !== null && isAndroid(),
          })}
          onDismissInstallGuide={() => {
            dismissInstallGuide();
            setInstallDismissed(true);
          }}
          onInstall={() => {
            // OSのインストールUIを開く。結果に関わらずプロンプトは使い捨て
            void installPrompt?.prompt();
            setInstallPrompt(null);
            dismissInstallGuide();
            setInstallDismissed(true);
          }}
          rematchCount={rematches.length}
          rematchOldestDays={
            rematches.length > 0
              ? Math.max(
                  ...rematches.map((c) =>
                    Math.round(
                      (new Date(`${todayKey()}T00:00:00`).getTime() -
                        new Date(`${c.failedAt}T00:00:00`).getTime()) /
                        86400000
                    )
                  )
                )
              : 0
          }
          onStartRematch={startRematch}
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
          onSelectSkin={(id) =>
            setState((prev) => ({ ...prev, selectedSkin: id }))
          }
          onToggleMute={() =>
            setState((prev) => ({ ...prev, muted: !prev.muted }))
          }
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
          // セッションを直接差し替えたとき（前提復習への誘導等）に内部state（出題キュー）を
          // 作り直すため、セット単位で再マウントする
          key={session.setId ?? session.title}
          title={session.title}
          items={session.items}
          onAnswer={handleAnswer}
          onFinish={handleFinish}
          onClose={() => setSession(null)}
          lessonFor={(setId) => unitGuide.get(setId)?.lesson ?? null}
          unitLinksFor={(setId) => unitGuide.get(setId)?.links ?? []}
          prereqFor={prereqFor}
          onStartLesson={(meta) => void startSet(meta)}
          hintStyleFor={(concept) =>
            recommendHintStyle(concept ? state.mastery[concept] : undefined)
          }
        />
      )}

      {lesson && (
        <LessonScreen
          title={lesson.title}
          setId={lesson.setId}
          steps={lesson.steps}
          revisit={!!state.setRecords[lesson.setId]}
          onAnswer={handleAnswer}
          onFinish={(score) =>
            setState((prev) =>
              celebrateSugoroku(
                recordSetResult(prev, lesson.setId, score),
                lesson.setId
              )
            )
          }
          onClose={() => setLesson(null)}
        />
      )}
    </SkinContext.Provider>
  );
}
