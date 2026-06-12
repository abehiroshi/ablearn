import { useState } from "react";
import type { SetMeta, Subject } from "../types";
import type { AppState } from "../lib/storage";
import { todayKey } from "../lib/storage";
import type { Recommendation } from "../lib/recommend";
import { daysBetweenISO, isTestActive, isTestOver } from "../lib/recommend";
import {
  ContentCounts,
  achievedCount,
  achievementPct,
} from "../lib/milestones";
import {
  GOAL_CATALOG,
  GoalContext,
  GoalProgress,
  MAX_GOALS,
  activeGoalProgress,
  availableGoals,
  challengeQuota,
  recommendedBundle,
} from "../lib/goals";
import { buildTrack, miniTrack } from "../lib/sugoroku";
import Abler from "../components/Abler";

interface Props {
  state: AppState;
  streak: number;
  todayAnswered: number;
  recommendations: Recommendation[];
  wrongCount: number;
  subjects: Subject[];
  onStartSet: (meta: SetMeta) => void;
  onStartReview: () => void;
  onGoLibrary: () => void;
  onEditTest: () => void;
  onClearTest: () => void;
  /** タブレットの教科一覧から直接その教科を開く */
  onOpenSubject: (subjectId: string) => void;
  counts: ContentCounts | null;
  /** 週間目標（計画28）の進捗計算用 */
  setSubject: (setId: string) => string | undefined;
  isLesson: (setId: string) => boolean;
  onSelectGoals: (ids: string[]) => void;
  onDismissGoalsIntro: () => void;
  /** 挑戦束（計画29）: そのノルマぶんの難問を用意できるか */
  canChallenge: (quota: number) => boolean;
  /** 束を選ぶ。挑戦なら束のセッションが始まる */
  onChooseBundle: (choice: "normal" | "challenge", normalQuota: number) => void;
  /** 再戦（計画30）: ゲートを満たした再戦候補の数と最も古い失敗からの日数 */
  rematchCount: number;
  rematchOldestDays: number;
  onStartRematch: () => void;
  /** ホーム画面に追加の案内（計画37）。null = 出さない */
  installGuide: "ios" | "android" | null;
  onDismissInstallGuide: () => void;
  /** Android: OSのインストールUIを開く */
  onInstall: () => void;
}

/** iOS Safari の共有ボタン（□から上矢印）を模したアイコン */
function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{ verticalAlign: "-2px" }}
      aria-label="共有"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6.5 H3 V14 H13 V6.5 H12" />
        <path d="M8 10 V1.5 M5.5 4 L8 1.5 L10.5 4" />
      </g>
    </svg>
  );
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
}

export default function HomeScreen({
  state,
  streak,
  todayAnswered,
  recommendations,
  wrongCount,
  subjects,
  onStartSet,
  onStartReview,
  onGoLibrary,
  onEditTest,
  onClearTest,
  onOpenSubject,
  counts,
  setSubject,
  isLesson,
  onSelectGoals,
  onDismissGoalsIntro,
  canChallenge,
  onChooseBundle,
  rematchCount,
  rematchOldestDays,
  onStartRematch,
  installGuide,
  onDismissInstallGuide,
  onInstall,
}: Props) {
  const today = todayKey();
  const testActive = isTestActive(state.test, today);
  const testOver = isTestOver(state.test, today);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  // 週間目標（計画28）
  const goalCtx: GoalContext = {
    state,
    today,
    setSubject,
    isLesson,
    rangeSetIds: testActive ? Object.values(state.test!.range).flat() : null,
    setTotals: counts?.setTotals ?? null,
  };
  const goalsProgress = activeGoalProgress(state.goals, goalCtx);
  // 挑戦束（計画29）: 問数系の課題の先頭1つだけを「ふつう/挑戦」の2束にする
  const todayBundle = state.bundles?.[today];
  const bundleGoalId = goalsProgress.find(
    (p) => !p.achieved && p.todayQuota !== undefined
  )?.def.id;
  const bundleFocus = recommendedBundle(state, today);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftGoals, setDraftGoals] = useState<string[]>([]);
  const goalLabel = (id: string) =>
    GOAL_CATALOG.find((d) => d.id === id)?.label ?? id;

  function openGoalEditor() {
    setDraftGoals(state.goals.next ?? state.goals.active);
    setEditingGoals(true);
  }
  function toggleDraft(id: string) {
    setDraftGoals((prev) =>
      prev.includes(id)
        ? prev.filter((g) => g !== id)
        : prev.length >= MAX_GOALS
          ? prev
          : [...prev, id]
    );
  }

  /** 今日の課題の行。問数系の先頭1つは「ふつう/挑戦」の2束（計画29） */
  function taskLine(p: GoalProgress) {
    if (p.achieved) {
      return (
        <div className="muted" style={{ fontSize: 13 }}>
          たっせい！おみごと！
        </div>
      );
    }
    const quota = p.todayQuota;
    const plain = (
      <div className="muted" style={{ fontSize: 13 }}>
        今日の課題: {p.todayTask}
      </div>
    );
    if (p.def.id !== bundleGoalId || quota === undefined) return plain;
    const cq = challengeQuota(quota);
    // 難問が足りない日は挑戦束を出さない（水増しで「挑戦なのに簡単」を作らない）
    const challengeOk = canChallenge(cq);
    if (!todayBundle) {
      if (!challengeOk) return plain;
      // 推す方をデフォルトフォーカス（強調）してよい。ただし選ぶのは常に本人
      return (
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            今日の課題: どっちでいく？
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <button
              className={
                bundleFocus === "normal" ? "primary-btn" : "secondary-btn"
              }
              style={{ flex: 1 }}
              onClick={() => onChooseBundle("normal", quota)}
            >
              ふつう（{quota}問解く）
            </button>
            <button
              className={
                bundleFocus === "challenge" ? "primary-btn" : "secondary-btn"
              }
              style={{ flex: 1 }}
              onClick={() => onChooseBundle("challenge", quota)}
            >
              挑戦（難問{cq}問で同じ）
            </button>
          </div>
        </div>
      );
    }
    if (todayBundle.choice === "challenge") {
      if (todayBundle.completed) {
        return (
          <div className="muted" style={{ fontSize: 13 }}>
            🔥 今日の挑戦束クリア！ふつう束とおなじだけ進んだよ
          </div>
        );
      }
      return (
        <div className="row" style={{ gap: 8, fontSize: 13 }}>
          <span className="muted">
            今日の課題: 難問{todayBundle.challengeQuota}問にちょうせん中
          </span>
          <span className="spacer" />
          <button
            className="link-btn"
            onClick={() => onChooseBundle("challenge", quota)}
          >
            つづきをやる
          </button>
          <button
            className="link-btn"
            onClick={() => onChooseBundle("normal", quota)}
          >
            ふつうにする
          </button>
        </div>
      );
    }
    // ふつうを選んだ日（文言・扱いは従来と同等＝責めない）。挑戦への切替はいつでも
    return (
      <div className="row" style={{ gap: 8, fontSize: 13 }}>
        <span className="muted">今日の課題: {p.todayTask}</span>
        {challengeOk && (
          <>
            <span className="spacer" />
            <button
              className="link-btn"
              onClick={() => onChooseBundle("challenge", quota)}
            >
              💪 挑戦にかえる
            </button>
          </>
        )}
      </div>
    );
  }

  // テストの最初の残り日まで（テスト前はカウントダウン、期間中は「テスト期間中」）
  const firstRemaining = testActive
    ? state.test!.days
        .map((d) => d.date)
        .filter((d) => d >= today)
        .sort()[0]
    : undefined;
  const countdown =
    firstRemaining !== undefined ? daysBetweenISO(today, firstRemaining) : null;
  const started = testActive && state.test!.days.some((d) => d.date < today);

  // テスト範囲の達成度（文脈に合う数字をホームに少しだけ出す）
  const rangePct = (() => {
    if (!testActive || !counts) return null;
    const rangeIds = new Set(Object.values(state.test!.range).flat());
    let total = 0;
    for (const id of rangeIds) total += counts.setTotals[id] ?? 0;
    return achievementPct(
      achievedCount(state, (sid) => rangeIds.has(sid)),
      total
    );
  })();

  const greeting = testActive
    ? countdown === 0
      ? "今日はテスト！おちついていこう！"
      : `テストまであと${countdown}日。いっしょにがんばろう！`
    : todayAnswered > 0
      ? "今日もがんばってるね！この調子！"
      : wrongCount > 0
        ? "苦手問題をやっつけよう！"
        : streak > 1
          ? `${streak}日連続！今日も一緒にがんばろう！`
          : "今日も一緒にがんばろう！";

  return (
    <div className="screen">
      <h1 className="screen-title">Ablearn</h1>

      <div className="home-grid">
      <div className="home-main">
      <div className="card abler-card">
        <Abler pose="main" size={104} />
        <div className="abler-bubble">{greeting}</div>
      </div>

      {/* ホーム画面に追加の案内（計画37）。standalone 起動・閉じた後は出ない */}
      {installGuide && (
        <div className="card">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <Abler pose="hirameita" size={48} />
            <div style={{ flex: 1, fontSize: 14 }}>
              ホーム画面に追加すると、アプリみたいにすぐ開けるよ！
              {installGuide === "ios" && (
                <div style={{ marginTop: 6, fontWeight: 700 }}>
                  ① 共有ボタン（<ShareIcon />）をタップ
                  <br />② 「ホーム画面に追加」をえらぶ
                </div>
              )}
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="link-btn"
              style={{ flex: 1 }}
              onClick={onDismissInstallGuide}
            >
              とじる
            </button>
            {installGuide === "android" && (
              <button
                className="primary-btn"
                style={{ flex: 2 }}
                onClick={onInstall}
              >
                📲 ホーム画面に追加する
              </button>
            )}
          </div>
        </div>
      )}

      <div className="hero">
        <div className="stat-card">
          <div className="num">{streak > 0 ? `🔥${streak}` : "—"}</div>
          <div className="label">連続日数</div>
        </div>
        <div className="stat-card">
          <div className="num">{state.xp}</div>
          <div className="label">XP</div>
        </div>
        <div className="stat-card">
          <div className="num">{todayAnswered}</div>
          <div className="label">今日の問題数</div>
        </div>
      </div>

      {/* 週間目標と今日の課題（計画28） */}
      {editingGoals ? (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            週の目標をえらぶ（{draftGoals.length}/{MAX_GOALS}）
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            {state.goals.active.length > 0
              ? "変更は来週の月曜から適用されるよ"
              : "自分で決めた目標が「今日の課題」になるよ"}
          </p>
          {availableGoals(goalCtx).map((d) => {
            const checked = draftGoals.includes(d.id);
            const full = !checked && draftGoals.length >= MAX_GOALS;
            return (
              <button
                key={d.id}
                className="list-row"
                style={{
                  width: "100%",
                  textAlign: "left",
                  opacity: full ? 0.4 : 1,
                }}
                onClick={() => toggleDraft(d.id)}
              >
                <span>{checked ? "✅" : "⬜"}</span>
                <span style={{ flex: 1 }}>
                  {d.mode === "test" && "📝 "}
                  {d.label}
                </span>
              </button>
            );
          })}
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="secondary-btn"
              style={{ flex: 1 }}
              onClick={() => setEditingGoals(false)}
            >
              やめる
            </button>
            <button
              className="primary-btn"
              style={{ flex: 1 }}
              onClick={() => {
                onSelectGoals(draftGoals);
                setEditingGoals(false);
              }}
            >
              これにする
            </button>
          </div>
        </div>
      ) : goalsProgress.length > 0 ? (
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 700 }}>🎯 こんしゅうの目標</span>
            <span className="spacer" />
            <button className="link-btn" onClick={openGoalEditor}>
              えらびなおす
            </button>
          </div>
          {goalsProgress.map((p) => (
            <div key={p.def.id} style={{ marginBottom: 10 }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
                  {p.def.label}
                </span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {p.def.id === "range-review-0"
                    ? `のこり${p.current}問`
                    : `${p.current}/${p.target}`}
                </span>
              </div>
              <div className="row" style={{ gap: 8, margin: "4px 0" }}>
                <span className="acc-track" style={{ flex: 1 }}>
                  <span
                    className="acc-fill"
                    style={{
                      width: `${p.pct}%`,
                      background: p.achieved ? "var(--green)" : "var(--accent)",
                    }}
                  />
                </span>
                {p.achieved && <span style={{ fontSize: 13 }}>🎉</span>}
              </div>
              {taskLine(p)}
            </div>
          ))}
          {state.goals.next && (
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              来週から: {state.goals.next.map(goalLabel).join("・")}
            </p>
          )}
        </div>
      ) : state.goals.active.length === 0 && !state.goals.introDismissed ? (
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <Abler pose="hirameita" size={56} />
            <div style={{ flex: 1, fontSize: 14 }}>
              週の目標をえらぶと、毎日「今日の課題」が出るよ。
              自分のペースで決めよう！
            </div>
          </div>
          <div className="row">
            <button
              className="secondary-btn"
              style={{ flex: 1 }}
              onClick={onDismissGoalsIntro}
            >
              あとで
            </button>
            <button
              className="primary-btn"
              style={{ flex: 1 }}
              onClick={() => {
                onDismissGoalsIntro();
                openGoalEditor();
              }}
            >
              目標をえらぶ
            </button>
          </div>
        </div>
      ) : (
        <button className="ghost-btn" onClick={openGoalEditor}>
          🎯 週の目標をえらぶ
        </button>
      )}

      {testOver && (
        <div className="card">
          <div className="row" style={{ marginBottom: 12 }}>
            <Abler pose="dekita" size={64} />
            <div>
              <div style={{ fontWeight: 800 }}>
                「{state.test!.name}」おつかれさま！
              </div>
              <div className="muted">よくがんばったね。次に進もう！</div>
            </div>
          </div>
          <button className="secondary-btn" onClick={onClearTest}>
            登録をクリアして日常モードへ
          </button>
        </div>
      )}

      {testActive && (
        <div className="card test-card">
          <div className="row">
            <span style={{ fontWeight: 800, fontSize: 17 }}>
              📝 {state.test!.name}
            </span>
            <span className="spacer" />
            <button className="link-btn" onClick={onEditTest}>
              編集
            </button>
          </div>
          <div className="countdown">
            {countdown === 0
              ? "今日はテスト当日！"
              : started
                ? `テスト期間中（次まであと${countdown}日）`
                : `あと ${countdown} 日`}
          </div>
          {rangePct !== null && (
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 13 }}>
                範囲の達成度
              </span>
              <span className="acc-track" style={{ flex: 1 }}>
                <span
                  className="acc-fill"
                  style={{ width: `${rangePct}%`, background: "var(--accent)" }}
                />
              </span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{rangePct}%</span>
            </div>
          )}
          <div className="schedule">
            {state.test!.days.map((day, i) => {
              const passed = day.date < today;
              return (
                <div key={i} className={`sched-day ${passed ? "passed" : ""}`}>
                  <span className="sched-date">
                    {formatDay(day.date)}
                    {day.date === today && <span className="today-pill">今日</span>}
                  </span>
                  <span className="sched-subjects">
                    {day.subjects
                      .map((id) => subjectById.get(id))
                      .filter(Boolean)
                      .map((s) => `${s!.icon}${s!.name}`)
                      .join("・")}
                  </span>
                  {passed && <span className="muted">✓ 終了</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="card">
          <div className="muted" style={{ marginBottom: 4 }}>
            今日のおすすめ
          </div>
          {recommendations.map((rec) => (
            <div key={rec.meta.id}>
            <button
              className="rec-row"
              onClick={() => onStartSet(rec.meta)}
            >
              <span
                className="subject-icon"
                style={{
                  background: `${rec.subject.color}22`,
                  width: 38,
                  height: 38,
                  fontSize: 20,
                }}
              >
                {rec.subject.icon}
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, display: "block" }}>
                  {rec.meta.kind === "lesson" && "📖 "}
                  {rec.meta.name}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {rec.reason}
                  {rec.meta.kind === "lesson"
                    ? state.setRecords[rec.meta.id]
                      ? " ・ 完了"
                      : " ・ 未学習"
                    : state.setRecords[rec.meta.id]
                      ? ` ・ ベスト ${state.setRecords[rec.meta.id].best}%`
                      : " ・ 未挑戦"}
                </span>
              </span>
              <span className="chevron">›</span>
            </button>
            {/* レッスンが無い新しい単元では授業動画などの予習導線を添える（計画13） */}
            {rec.links && (
              <div className="link-row" style={{ margin: "0 0 8px 50px" }}>
                {rec.links.map((l) => (
                  <a
                    key={l.url}
                    className="link-chip"
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ▶ {l.label}
                  </a>
                ))}
              </div>
            )}
            </div>
          ))}
        </div>
      )}

      {/* 進行中単元のミニすごろく（計画33）: 全体量と現在地をマス目で見せる */}
      {(() => {
        const rows = subjects.flatMap((s) =>
          (state.currentUnits[s.id] ?? [])
            .map((uid) => s.units.find((u) => u.id === uid))
            .filter((u) => !!u)
            .map((u) => ({ subject: s, unit: u!, track: buildTrack(u!, state) }))
        );
        if (rows.length === 0) return null;
        return (
          <div className="card">
            <div className="muted" style={{ marginBottom: 4 }}>
              進行中の単元
            </div>
            {rows.map(({ subject, unit, track }) => (
              <button
                key={`${subject.id}/${unit.id}`}
                className="list-row"
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => onOpenSubject(subject.id)}
              >
                <span>{subject.icon}</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{unit.name}</span>
                <span className="sugo-mini">{miniTrack(track)}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {track.remaining === 0
                    ? "ゴール！"
                    : `あと${track.remaining}マス`}
                </span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* 再戦カード（計画30）: 解ける見込みが立った過去の不正解問題への成長確認イベント */}
      {rematchCount > 0 && (
        <div className="card">
          <div className="row" style={{ marginBottom: 12 }}>
            <Abler pose="hirameita" size={56} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>⚔️ 再戦のチャンス！</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {rematchOldestDays}日前にとけなかった問題、いまならいけるかも
              </div>
            </div>
          </div>
          <button className="secondary-btn" onClick={onStartRematch}>
            再戦する（{rematchCount}問）
          </button>
        </div>
      )}

      {wrongCount > 0 && (
        <div className="card">
          <div className="row" style={{ marginBottom: 12 }}>
            <span style={{ fontWeight: 700 }}>苦手問題 {wrongCount} 問</span>
            <span className="spacer" />
          </div>
          <button className="secondary-btn" onClick={onStartReview}>
            復習する
          </button>
        </div>
      )}

      <button
        className="secondary-btn home-go-library"
        style={{ marginTop: 4 }}
        onClick={onGoLibrary}
      >
        教科から選ぶ
      </button>

      {/* 模擬テストへの導線はフッタの「テスト」タブに一本化（計画16） */}
      {!testActive && !testOver && (
        <button
          className="ghost-btn"
          style={{ marginTop: 10 }}
          onClick={onEditTest}
        >
          📝 次のテストを登録する
        </button>
      )}
      </div>

      {/* タブレットだけに出す教科一覧（スマホは「教科から選ぶ」） */}
      <aside className="home-side">
        <div className="muted" style={{ fontWeight: 700, margin: "0 4px 8px" }}>
          教科から選ぶ
        </div>
        {subjects.map((s) => (
          <button
            key={s.id}
            className="subject-card"
            onClick={() => onOpenSubject(s.id)}
          >
            <span
              className="subject-icon"
              style={{ background: `${s.color}22` }}
            >
              {s.icon}
            </span>
            <span style={{ flex: 1 }}>
              <span className="title">{s.name}</span>
            </span>
            <span className="chevron">›</span>
          </button>
        ))}
      </aside>
      </div>
    </div>
  );
}
