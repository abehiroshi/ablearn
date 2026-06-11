import { useMemo } from "react";
import type { AppState } from "../lib/storage";
import { currentStreak } from "../lib/storage";

interface Props {
  state: AppState;
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export default function StatsScreen({ state }: Props) {
  // 直近7日（今日を含む）の学習量
  const week = useMemo(() => {
    const days: { label: string; answered: number; xp: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const log = state.dailyLog[key];
      days.push({
        label: DOW[d.getDay()],
        answered: log?.answered ?? 0,
        xp: log?.xp ?? 0,
      });
    }
    return days;
  }, [state.dailyLog]);

  const totals = useMemo(() => {
    let answered = 0;
    let correct = 0;
    for (const log of Object.values(state.dailyLog)) {
      answered += log.answered;
      correct += log.correct;
    }
    return {
      answered,
      accuracy: answered > 0 ? Math.round((correct / answered) * 100) : 0,
      days: Object.keys(state.dailyLog).length,
    };
  }, [state.dailyLog]);

  const max = Math.max(1, ...week.map((d) => d.answered));

  return (
    <div className="screen">
      <h1 className="screen-title">記録</h1>

      <div className="hero">
        <div className="stat-card">
          <div className="num">🔥{currentStreak(state)}</div>
          <div className="label">連続日数</div>
        </div>
        <div className="stat-card">
          <div className="num">{state.xp}</div>
          <div className="label">合計XP</div>
        </div>
        <div className="stat-card">
          <div className="num">{totals.accuracy}%</div>
          <div className="label">正答率</div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>この1週間</div>
        <div className="bar-chart">
          {week.map((d, i) => (
            <div key={i} className="bar-col">
              <span className="bar-label">{d.answered || ""}</span>
              <div
                className="bar"
                style={{
                  height: `${(d.answered / max) * 80}%`,
                  opacity: d.answered ? 1 : 0.2,
                }}
              />
              <span className="bar-label">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="list-row">
          <span style={{ flex: 1 }}>解いた問題の合計</span>
          <span style={{ fontWeight: 700 }}>{totals.answered}問</span>
        </div>
        <div className="list-row">
          <span style={{ flex: 1 }}>学習した日数</span>
          <span style={{ fontWeight: 700 }}>{totals.days}日</span>
        </div>
      </div>
    </div>
  );
}
