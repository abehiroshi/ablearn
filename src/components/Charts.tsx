// SVG/CSS 直書きの可視化部品（ライブラリは入れない方針）

import type { DayLog } from "../lib/storage";
import type { AccuracyItem, GrowthSeries } from "../lib/stats";
import Abler from "./Abler";

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="chart-empty">
      <Abler pose="uun" size={64} />
      <span className="muted">{message}</span>
    </div>
  );
}

// ===== 学習カレンダー（草表示） =====

const WEEKS = 15;

function heatLevel(answered: number): number {
  if (answered <= 0) return 0;
  if (answered < 10) return 1;
  if (answered < 20) return 2;
  if (answered < 35) return 3;
  return 4;
}

function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function Heatmap({ dailyLog }: { dailyLog: Record<string, DayLog> }) {
  // 直近 WEEKS 週分。今週の日曜から逆算した日曜はじまりのグリッド
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);

  const cells: { key: string; level: number; answered: number; future: boolean }[] = [];
  const todayKey = dateKey(today);
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + w * 7 + d);
      const key = dateKey(cur);
      const answered = dailyLog[key]?.answered ?? 0;
      cells.push({
        key,
        level: heatLevel(answered),
        answered,
        future: key > todayKey,
      });
    }
  }

  return (
    <div>
      <div className="heatmap" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
        {cells.map((c) => (
          <span
            key={c.key}
            className={`heat-cell ${c.future ? "future" : `l${c.level}`}`}
            title={`${c.key}: ${c.answered}問`}
          />
        ))}
      </div>
      <div className="heat-legend muted">
        少ない
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`heat-cell l${l}`} />
        ))}
        多い
      </div>
    </div>
  );
}

// ===== 得意不得意レーダー（教科別） =====

export function Radar({ items }: { items: AccuracyItem[] }) {
  const W = 300;
  const H = 240;
  const cx = W / 2;
  const cy = H / 2 + 6;
  const R = 78;
  const n = items.length;

  function point(i: number, value: number): [number, number] {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = (R * value) / 100;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  const rings = [25, 50, 75, 100];
  const poly = items
    .map((item, i) => point(i, Math.max(item.accuracy, 3)).join(","))
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img">
      {rings.map((r) => (
        <polygon
          key={r}
          points={items.map((_, i) => point(i, r).join(",")).join(" ")}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      {items.map((_, i) => {
        const [x, y] = point(i, 100);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="var(--border)"
            strokeWidth={1}
          />
        );
      })}
      <polygon
        points={poly}
        fill="rgba(79, 124, 255, 0.25)"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {items.map((item, i) => {
        const [x, y] = point(i, 100);
        // ラベルを外側に押し出す
        const lx = cx + (x - cx) * 1.32;
        const ly = cy + (y - cy) * 1.28;
        return (
          <text
            key={item.id}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={700}
            fill="var(--text)"
          >
            {item.icon}
            {item.accuracy}%
          </text>
        );
      })}
    </svg>
  );
}

// ===== 正答率バー（単元別・レーダーの軸が足りないときの教科別） =====

export function AccuracyBars({ items }: { items: AccuracyItem[] }) {
  return (
    <div>
      {items.map((item) => (
        <div key={item.id} className="acc-row">
          <span className="acc-label">
            {item.icon} {item.label}
          </span>
          <span className="acc-track">
            <span
              className="acc-fill"
              style={{ width: `${item.accuracy}%`, background: item.color }}
            />
          </span>
          <span className="acc-pct">{item.accuracy}%</span>
        </div>
      ))}
    </div>
  );
}

// ===== 成長グラフ（単元別の累積正答率） =====

export function GrowthChart({
  dates,
  series,
}: {
  dates: string[];
  series: GrowthSeries[];
}) {
  const W = 320;
  const H = 190;
  const PAD = { top: 10, right: 10, bottom: 22, left: 32 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const x = (i: number) =>
    PAD.left + (dates.length === 1 ? iw / 2 : (i * iw) / (dates.length - 1));
  const y = (v: number) => PAD.top + ih - (v / 100) * ih;

  function pathOf(values: (number | null)[]): string {
    let d = "";
    values.forEach((v, i) => {
      if (v === null) return;
      d += `${d === "" ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    });
    return d.trim();
  }

  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              y1={y(v)}
              x2={W - PAD.right}
              y2={y(v)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill="var(--text-2)"
            >
              {v}%
            </text>
          </g>
        ))}
        <text
          x={PAD.left}
          y={H - 6}
          fontSize={10}
          fill="var(--text-2)"
        >
          {fmt(dates[0])}
        </text>
        <text
          x={W - PAD.right}
          y={H - 6}
          textAnchor="end"
          fontSize={10}
          fill="var(--text-2)"
        >
          {fmt(dates[dates.length - 1])}
        </text>
        {series.map((s) => (
          <g key={s.label}>
            <path
              d={pathOf(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* 1点しかない日も見えるように打点する */}
            {s.values.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} />
              )
            )}
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label} className="legend-item">
            <span className="legend-dot" style={{ background: s.color }} />
            {s.icon} {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
