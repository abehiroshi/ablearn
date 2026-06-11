import { useMemo } from "react";
import type { ContentIndex } from "../types";
import type { AppState } from "../lib/storage";
import { buildSetLookup } from "../lib/content";

interface Props {
  index: ContentIndex;
  state: AppState;
  wrongKeys: string[];
  onStart: () => void;
}

export default function ReviewScreen({ index, wrongKeys, onStart }: Props) {
  const bySubject = useMemo(() => {
    const lookup = buildSetLookup(index);
    const counts = new Map<string, { icon: string; name: string; n: number }>();
    for (const key of wrongKeys) {
      const setId = key.slice(0, key.indexOf("/"));
      const entry = lookup.get(setId);
      if (!entry) continue;
      const cur = counts.get(entry.subject.id) ?? {
        icon: entry.subject.icon,
        name: entry.subject.name,
        n: 0,
      };
      cur.n += 1;
      counts.set(entry.subject.id, cur);
    }
    return [...counts.values()];
  }, [index, wrongKeys]);

  return (
    <div className="screen">
      <h1 className="screen-title">復習</h1>
      {wrongKeys.length === 0 ? (
        <div className="empty-note">
          <p style={{ fontSize: 40, margin: 0 }}>🎉</p>
          <p>にがて問題はありません。</p>
          <p>間違えた問題がここにたまります。</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              にがて問題 {wrongKeys.length} 問
            </div>
            {bySubject.map((s) => (
              <div key={s.name} className="list-row">
                <span>{s.icon}</span>
                <span style={{ flex: 1 }}>{s.name}</span>
                <span className="muted">{s.n}問</span>
              </div>
            ))}
          </div>
          <button className="primary-btn" onClick={onStart}>
            復習を始める
          </button>
          <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
            正解すると、にがて問題から外れます
          </p>
        </>
      )}
    </div>
  );
}
