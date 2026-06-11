import { useState } from "react";
import type { ContentIndex, SetMeta, Subject } from "../types";
import type { AppState } from "../lib/storage";
import {
  ContentCounts,
  achievedCount,
  achievementPct,
} from "../lib/milestones";

interface Props {
  index: ContentIndex;
  state: AppState;
  onStartSet: (meta: SetMeta) => void;
  onToggleUnit: (subjectId: string, unitId: string) => void;
  /** ホームの教科一覧から開いたときの初期表示教科 */
  focusSubjectId?: string | null;
  /** 達成度の分母（読み込み中は null = バー非表示） */
  counts: ContentCounts | null;
}

export default function LibraryScreen({
  index,
  state,
  onStartSet,
  onToggleUnit,
  focusSubjectId,
  counts,
}: Props) {
  const [subject, setSubject] = useState<Subject | null>(
    () => index.subjects.find((s) => s.id === focusSubjectId) ?? null
  );

  if (subject) {
    const currentIds = state.currentUnits[subject.id] ?? [];
    return (
      <div className="screen">
        <button className="back-btn" onClick={() => setSubject(null)}>
          ‹ 教科一覧
        </button>
        <h1 className="screen-title">
          {subject.icon} {subject.name}
        </h1>
        <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
          いま授業でやっている単元に「授業中」マークをつけると、
          ホームのおすすめに出るよ
        </p>
        {subject.units.map((unit) => {
          // 達成度 = 一度でも正解した問題 ÷ 単元の全問題（下がらない数字）
          const unitKey = `${subject.id}/${unit.id}`;
          const pct = counts
            ? achievementPct(
                achievedCount(state, (sid) => counts.setToUnit[sid] === unitKey),
                counts.unitTotals[unitKey] ?? 0
              )
            : null;
          return (
          <div key={unit.id}>
            <div className="unit-header row" style={{ gap: 8 }}>
              <span style={{ flex: 1 }}>{unit.name}</span>
              {pct !== null && (
                <span className="unit-pct">
                  <span className="acc-track" style={{ width: 56 }}>
                    <span
                      className="acc-fill"
                      style={{ width: `${pct}%`, background: "var(--accent)" }}
                    />
                  </span>
                  {pct}%
                </span>
              )}
              <button
                className={`unit-toggle ${currentIds.includes(unit.id) ? "active" : ""}`}
                onClick={() => onToggleUnit(subject.id, unit.id)}
              >
                {currentIds.includes(unit.id) ? "✓ 授業中" : "授業中にする"}
              </button>
            </div>
            {unit.links && unit.links.length > 0 && (
              <div className="link-row" style={{ margin: "0 4px 8px" }}>
                {unit.links.map((l) => (
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
            <div className="set-grid">
            {unit.sets.map((meta) => {
              const rec = state.setRecords[meta.id];
              const isLesson = meta.kind === "lesson";
              return (
                <button
                  key={meta.id}
                  className="set-row"
                  onClick={() => onStartSet(meta)}
                >
                  <span style={{ fontWeight: 600, flex: 1 }}>
                    {isLesson && <span className="lesson-pill">📖 レッスン</span>}
                    {meta.name}
                    {meta.origin && (
                      <span className="origin-pill">📋 {meta.origin}</span>
                    )}
                  </span>
                  {isLesson ? (
                    <span className={`score-pill ${rec ? "done" : ""}`}>
                      {rec ? "完了" : "未学習"}
                    </span>
                  ) : rec ? (
                    <span
                      className={`score-pill ${rec.best >= 80 ? "done" : ""}`}
                    >
                      ベスト {rec.best}%
                    </span>
                  ) : (
                    <span className="score-pill">未挑戦</span>
                  )}
                  <span className="chevron">›</span>
                </button>
              );
            })}
            </div>
          </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="screen">
      <h1 className="screen-title">学習</h1>
      {index.title && (
        <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
          {index.title}
        </p>
      )}
      <div className="subject-grid">
      {index.subjects.map((s) => {
        const setCount = s.units.reduce((n, u) => n + u.sets.length, 0);
        return (
          <button
            key={s.id}
            className="subject-card"
            onClick={() => setSubject(s)}
          >
            <span
              className="subject-icon"
              style={{ background: `${s.color}22` }}
            >
              {s.icon}
            </span>
            <span style={{ flex: 1 }}>
              <span className="title">{s.name}</span>
              <span className="muted" style={{ display: "block" }}>
                {s.units.length}単元 / {setCount}セット
              </span>
            </span>
            <span className="chevron">›</span>
          </button>
        );
      })}
      </div>
    </div>
  );
}
