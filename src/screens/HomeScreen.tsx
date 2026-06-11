import type { SetMeta } from "../types";
import type { AppState } from "../lib/storage";
import Abler from "../components/Abler";

interface Props {
  state: AppState;
  streak: number;
  todayAnswered: number;
  recommended: SetMeta | null;
  wrongCount: number;
  onStartRecommended: () => void;
  onStartReview: () => void;
  onGoLibrary: () => void;
}

export default function HomeScreen({
  state,
  streak,
  todayAnswered,
  recommended,
  wrongCount,
  onStartRecommended,
  onStartReview,
  onGoLibrary,
}: Props) {
  const greeting =
    todayAnswered > 0
      ? "きょうもがんばってるね！この調子！"
      : wrongCount > 0
        ? "にがて問題をやっつけよう！"
        : streak > 1
          ? `${streak}日連続！きょうも一緒にがんばろう！`
          : "きょうも一緒にがんばろう！";

  return (
    <div className="screen">
      <h1 className="screen-title">Ablearn</h1>

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

      {recommended && (
        <div className="card">
          <div className="muted" style={{ marginBottom: 4 }}>
            きょうのおすすめ
          </div>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>
            {recommended.name}
          </div>
          <button className="primary-btn" onClick={onStartRecommended}>
            学習を始める
          </button>
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
        className="secondary-btn"
        style={{ marginTop: 4 }}
        onClick={onGoLibrary}
      >
        教科から選ぶ
      </button>
    </div>
  );
}
