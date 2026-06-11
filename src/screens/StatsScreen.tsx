import { useMemo, useRef, useState } from "react";
import type { AppState, BackupFile } from "../lib/storage";
import {
  currentStreak,
  makeBackup,
  parseBackup,
  todayKey,
} from "../lib/storage";

interface Props {
  state: AppState;
  onImport: (state: AppState) => void;
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export default function StatsScreen({ state, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  // インポート確認待ちのバックアップ（null = 確認中でない）
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function exportBackup() {
    const blob = new Blob([JSON.stringify(makeBackup(state), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ablearn-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function pickBackup(file: File | undefined) {
    setImportError(null);
    setPending(null);
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  }

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

      <div className="stats-grid">
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

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>バックアップ</div>
        <p className="muted" style={{ marginTop: 0 }}>
          端末をかえるとき・データが消えたときのために、記録をファイルに残せるよ
        </p>
        <div className="row">
          <button
            className="secondary-btn"
            style={{ flex: 1 }}
            onClick={exportBackup}
          >
            エクスポート
          </button>
          <button
            className="secondary-btn"
            style={{ flex: 1 }}
            onClick={() => fileInput.current?.click()}
          >
            インポート
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            void pickBackup(e.target.files?.[0]);
            e.target.value = ""; // 同じファイルを選び直せるように
          }}
        />
        {importError && (
          <p style={{ color: "var(--red)", fontSize: 14, marginBottom: 0 }}>
            {importError}
          </p>
        )}
        {pending && (
          <div className="import-confirm">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              このバックアップで上書きする？
            </div>
            <div className="list-row">
              <span style={{ flex: 1 }}>エクスポート日時</span>
              <span style={{ fontWeight: 700 }}>
                {new Date(pending.exportedAt).toLocaleString("ja-JP")}
              </span>
            </div>
            <div className="list-row">
              <span style={{ flex: 1 }}>XP</span>
              <span style={{ fontWeight: 700 }}>{pending.state.xp}</span>
            </div>
            <div className="list-row">
              <span style={{ flex: 1 }}>学習した日数</span>
              <span style={{ fontWeight: 700 }}>
                {Object.keys(pending.state.dailyLog).length}日
              </span>
            </div>
            <div className="list-row">
              <span style={{ flex: 1 }}>問題の成績</span>
              <span style={{ fontWeight: 700 }}>
                {Object.keys(pending.state.questionStats).length}件
              </span>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              いまの記録は消えて、このファイルの内容になります
            </p>
            <div className="row">
              <button
                className="secondary-btn"
                style={{ flex: 1 }}
                onClick={() => setPending(null)}
              >
                やめる
              </button>
              <button
                className="primary-btn"
                style={{ flex: 1 }}
                onClick={() => {
                  onImport(pending.state);
                  setPending(null);
                }}
              >
                上書きして復元
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
