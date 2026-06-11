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
}: Props) {
  const today = todayKey();
  const testActive = isTestActive(state.test, today);
  const testOver = isTestOver(state.test, today);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

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
      ? "きょうはテスト！おちついていこう！"
      : `テストまであと${countdown}日。いっしょにがんばろう！`
    : todayAnswered > 0
      ? "きょうもがんばってるね！この調子！"
      : wrongCount > 0
        ? "にがて問題をやっつけよう！"
        : streak > 1
          ? `${streak}日連続！きょうも一緒にがんばろう！`
          : "きょうも一緒にがんばろう！";

  return (
    <div className="screen">
      <h1 className="screen-title">Ablearn</h1>

      <div className="home-grid">
      <div className="home-main">
      <div className="card abler-card">
        <Abler pose="main" size={104} />
        <div className="abler-bubble">{greeting}</div>
      </div>

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
              ? "きょうはテスト当日！"
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
                    {day.date === today && <span className="today-pill">きょう</span>}
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
            きょうのおすすめ
          </div>
          {recommendations.map((rec) => (
            <button
              key={rec.meta.id}
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
          ))}
        </div>
      )}

      {wrongCount > 0 && (
        <div className="card">
          <div className="row" style={{ marginBottom: 12 }}>
            <span style={{ fontWeight: 700 }}>にがて問題 {wrongCount} 問</span>
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
