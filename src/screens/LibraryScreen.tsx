import { useState } from "react";
import type { ContentIndex, SetMeta, Subject } from "../types";
import type { AppState } from "../lib/storage";

interface Props {
  index: ContentIndex;
  state: AppState;
  onStartSet: (meta: SetMeta) => void;
  onToggleUnit: (subjectId: string, unitId: string) => void;
  /** ホームの教科一覧から開いたときの初期表示教科 */
  focusSubjectId?: string | null;
}

export default function LibraryScreen({
  index,
  state,
  onStartSet,
  onToggleUnit,
  focusSubjectId,
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
        {subject.units.map((unit) => (
          <div key={unit.id}>
            <div className="unit-header row" style={{ gap: 8 }}>
              <span style={{ flex: 1 }}>{unit.name}</span>
              <button
                className={`unit-toggle ${currentIds.includes(unit.id) ? "active" : ""}`}
                onClick={() => onToggleUnit(subject.id, unit.id)}
              >
                {currentIds.includes(unit.id) ? "✓ 授業中" : "授業中にする"}
              </button>
            </div>
            <div className="set-grid">
            {unit.sets.map((meta) => {
              const rec = state.setRecords[meta.id];
              return (
                <button
                  key={meta.id}
                  className="set-row"
                  onClick={() => onStartSet(meta)}
                >
                  <span style={{ fontWeight: 600, flex: 1 }}>{meta.name}</span>
                  {rec ? (
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
        ))}
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
