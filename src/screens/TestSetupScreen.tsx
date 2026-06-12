import { useState } from "react";
import type { ContentIndex, TermTest } from "../types";
import { TERM_TESTS } from "../types";
import type { AppState, TestDay, TestPlan } from "../lib/storage";
import { todayKey } from "../lib/storage";
import {
  addTermRange,
  removeTermRange,
  termAllChecked,
  termRange,
} from "../lib/terms";

/** プリセット由来・初期値のテスト名（自動補完で置き換えてよい名前） */
const PRESET_NAMES = new Set([
  "期末テスト",
  ...TERM_TESTS.map((t) => `${t}テスト`),
]);

interface Props {
  index: ContentIndex;
  state: AppState;
  onSave: (test: TestPlan) => void;
  onCancel: () => void;
  onDelete: () => void;
}

/** 進行中単元のセットを範囲の下書きにする */
function draftRange(
  index: ContentIndex,
  currentUnits: Record<string, string[]>
): Record<string, string[]> {
  const range: Record<string, string[]> = {};
  for (const subject of index.subjects) {
    const unitIds = currentUnits[subject.id] ?? [];
    const ids = subject.units
      .filter((u) => unitIds.includes(u.id))
      .flatMap((u) => u.sets.map((m) => m.id));
    if (ids.length > 0) range[subject.id] = ids;
  }
  return range;
}

/** 翌日の "YYYY-MM-DD"。日程の連日入力を楽にする */
function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function TestSetupScreen({
  index,
  state,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const editing = state.test;
  const [name, setName] = useState(editing?.name ?? "期末テスト");
  const [days, setDays] = useState<TestDay[]>(editing?.days ?? []);
  const [range, setRange] = useState<Record<string, string[]>>(
    editing?.range ?? draftRange(index, state.currentUnits)
  );

  function addDay() {
    const last = days[days.length - 1]?.date;
    setDays([...days, { date: last ? nextDate(last) : todayKey(), subjects: [] }]);
  }

  function updateDay(i: number, day: TestDay) {
    setDays(days.map((d, j) => (j === i ? day : d)));
  }

  function toggleSubject(i: number, subjectId: string) {
    const day = days[i];
    const subjects = day.subjects.includes(subjectId)
      ? day.subjects.filter((s) => s !== subjectId)
      : [...day.subjects, subjectId];
    updateDay(i, { ...day, subjects });
  }

  function toggleSet(subjectId: string, setId: string) {
    const cur = range[subjectId] ?? [];
    const next = cur.includes(setId)
      ? cur.filter((id) => id !== setId)
      : [...cur, setId];
    setRange({ ...range, [subjectId]: next });
  }

  /**
   * 定期テストのプリセット（計画35）: その範囲を一括チェック、全部入りなら一括解除。
   * 適用後の個別チェック（toggleSet）が常に勝つ
   */
  function toggleTerm(term: TermTest) {
    const preset = termRange(index, term);
    if (termAllChecked(range, preset)) {
      setRange(removeTermRange(range, preset));
    } else {
      setRange(addTermRange(range, preset));
      // テスト名が初期値・プリセット由来のときだけ自動補完（手入力の名前は触らない）
      if (PRESET_NAMES.has(name.trim())) setName(`${term}テスト`);
    }
  }

  const valid =
    name.trim().length > 0 &&
    days.length > 0 &&
    days.every((d) => d.date && d.subjects.length > 0);

  return (
    <div className="modal-screen">
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="back-btn" style={{ margin: 0 }} onClick={onCancel}>
          ‹ 戻る
        </button>
      </div>
      <h1 className="screen-title" style={{ marginTop: 0 }}>
        {editing ? "テストを編集" : "テストを登録"}
      </h1>

      <div className="card">
        <div className="field-label">テストの名前</div>
        <input
          className="text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 1学期期末テスト"
        />
      </div>

      <div className="card">
        <div className="field-label">時間割（日にちと教科）</div>
        {days.map((day, i) => (
          <div key={i} className="test-day-edit">
            <div className="row" style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {i + 1}日目
              </span>
              <input
                className="text-input"
                type="date"
                style={{ flex: 1, padding: "8px 10px" }}
                value={day.date}
                onChange={(e) => updateDay(i, { ...day, date: e.target.value })}
              />
              <button
                className="icon-btn"
                aria-label="この日を削除"
                onClick={() => setDays(days.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
            <div className="chip-row">
              {index.subjects.map((s) => {
                const order = day.subjects.indexOf(s.id);
                return (
                  <button
                    key={s.id}
                    className={`chip ${order >= 0 ? "active" : ""}`}
                    onClick={() => toggleSubject(i, s.id)}
                  >
                    {s.icon} {s.name}
                    {order >= 0 && day.subjects.length > 1 && (
                      <span className="chip-order">{order + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <button className="secondary-btn" onClick={addDay}>
          ＋ 日を追加
        </button>
      </div>

      <div className="card">
        <div className="field-label">テスト範囲（出るところにチェック）</div>
        {/* プリセット（計画35）: テスト名のワンタップで標準的な範囲を一括チェック */}
        <div className="chip-row" style={{ margin: "4px 0 8px" }}>
          {TERM_TESTS.map((term) => {
            const preset = termRange(index, term);
            if (Object.keys(preset).length === 0) return null;
            const active = termAllChecked(range, preset);
            return (
              <button
                key={term}
                className={`chip ${active ? "active" : ""}`}
                onClick={() => toggleTerm(term)}
              >
                {term}
              </button>
            );
          })}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          ボタンでだいたいの範囲が入るよ。学校の範囲表に合わせて、あとは1つずつ調整してね
        </p>
        {index.subjects.map((subject) => (
          <div key={subject.id}>
            <div className="unit-header" style={{ margin: "14px 0 4px" }}>
              {subject.icon} {subject.name}
            </div>
            {subject.units.map((unit) =>
              unit.sets.map((meta) => {
                const checked = (range[subject.id] ?? []).includes(meta.id);
                return (
                  <button
                    key={meta.id}
                    className="check-row"
                    onClick={() => toggleSet(subject.id, meta.id)}
                  >
                    <span className={`checkbox ${checked ? "on" : ""}`}>
                      {checked ? "✓" : ""}
                    </span>
                    <span style={{ flex: 1, textAlign: "left" }}>
                      {meta.name}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {unit.name}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ))}
      </div>

      <button
        className="primary-btn"
        disabled={!valid}
        onClick={() => {
          // 日付順に並べてから保存（カウントダウン・残り日数の計算を単純にする）
          const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
          onSave({ name: name.trim(), days: sorted, range });
        }}
      >
        保存する
      </button>
      {!valid && (
        <p className="muted" style={{ textAlign: "center" }}>
          名前と、日にち・教科の入った日が1日以上あると保存できるよ
        </p>
      )}
      {editing && (
        <button
          className="danger-btn"
          onClick={() => {
            if (confirm("テストの登録を削除しますか？")) onDelete();
          }}
        >
          テストの登録を削除
        </button>
      )}
    </div>
  );
}
