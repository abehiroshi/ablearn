import { useEffect, useMemo, useRef, useState } from "react";
import type { ContentIndex, Question, SetMeta } from "../types";
import type { AppState, MockResult } from "../lib/storage";
import { todayKey } from "../lib/storage";
import { isTestActive } from "../lib/recommend";
import { loadSet } from "../lib/content";
import { shuffle, XP_FIRST_CORRECT, XP_FLASHCARD } from "../lib/quiz";
import {
  ChoiceView,
  FlashcardView,
  InputView,
  OrderView,
} from "../components/QuestionViews";
import Abler from "../components/Abler";

interface Item {
  question: Question;
  setId: string;
}

interface Props {
  index: ContentIndex;
  state: AppState;
  /** QuizScreen と同じ。解答履歴・成績・XPを通常どおり記録する */
  onAnswer: (
    setId: string,
    questionId: string,
    correct: boolean,
    xp: number,
    recordStat: boolean,
    timeMs: number,
    hintsUsed: number
  ) => void;
  onFinishMock: (result: MockResult) => void;
  onClose: () => void;
}

const N_OPTIONS = [10, 20, 30];
const MIN_OPTIONS = [10, 15, 20, 30];

/** 問題の正解を表示用テキストにする */
function correctText(q: Question): string {
  switch (q.type) {
    case "choice":
      return q.choices[q.answer];
    case "input":
      return q.answers[0];
    case "order":
      return q.tokens.join(" ");
    case "flashcard":
      return q.back;
  }
}

function questionText(q: Question): string {
  return q.type === "flashcard" ? q.front : q.question;
}

export default function MockTestScreen({
  index,
  state,
  onAnswer,
  onFinishMock,
  onClose,
}: Props) {
  const testActive = isTestActive(state.test, todayKey());

  // ===== セットアップ =====
  const [n, setN] = useState(20);
  const [minutes, setMinutes] = useState(20);
  // テスト未登録時の単元選択（"subjectId/unitId"）。進行中単元が初期チェック
  const [pickedUnits, setPickedUnits] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const [sid, unitIds] of Object.entries(state.currentUnits)) {
      for (const uid of unitIds) init.add(`${sid}/${uid}`);
    }
    return init;
  });
  const [busy, setBusy] = useState(false);

  // 出題対象のセットと範囲ラベル
  const { pool, rangeLabel } = useMemo(() => {
    const metas: SetMeta[] = [];
    if (testActive) {
      const range = state.test!.range;
      for (const subject of index.subjects) {
        const ids = new Set(range[subject.id] ?? []);
        for (const unit of subject.units) {
          for (const meta of unit.sets) {
            if (ids.has(meta.id)) metas.push(meta);
          }
        }
      }
      return { pool: metas, rangeLabel: `「${state.test!.name}」の範囲` };
    }
    const names: string[] = [];
    for (const subject of index.subjects) {
      for (const unit of subject.units) {
        if (!pickedUnits.has(`${subject.id}/${unit.id}`)) continue;
        names.push(unit.name);
        metas.push(...unit.sets);
      }
    }
    const label =
      names.length <= 2
        ? names.join("・")
        : `${names.slice(0, 2).join("・")} ほか${names.length - 2}単元`;
    return { pool: metas, rangeLabel: label };
  }, [index, state.test, testActive, pickedUnits]);

  const best = useMemo(
    () =>
      state.mockResults.length > 0
        ? Math.max(...state.mockResults.map((r) => r.score))
        : null,
    [state.mockResults]
  );

  // ===== 実施中 =====
  const [items, setItems] = useState<Item[] | null>(null);
  const [pos, setPos] = useState(0);
  const [remaining, setRemaining] = useState(0); // 秒
  const endsAt = useRef(0);
  const shownAt = useRef(0);
  // 解答結果（インデックス対応。null = 未回答のまま時間切れ）
  const results = useRef<(boolean | null)[]>([]);
  const [finished, setFinished] = useState(false);
  const savedResult = useRef<MockResult | null>(null);

  async function start() {
    if (busy || pool.length === 0) return;
    setBusy(true);
    try {
      const all: Item[] = [];
      for (const meta of pool) {
        const set = await loadSet(meta);
        for (const q of set.questions) all.push({ question: q, setId: meta.id });
      }
      if (all.length === 0) {
        alert("出題できる問題がありません");
        return;
      }
      // 難易度バランス出題: 応用（difficulty 3）を約3割、残りを基本・標準から。
      // 足りない分は反対側から補う
      const isAdv = (i: Item) => (i.question.difficulty ?? 2) === 3;
      const adv = shuffle(all.filter(isAdv));
      const basic = shuffle(all.filter((i) => !isAdv(i)));
      const nAdv = Math.min(adv.length, Math.round(n * 0.3));
      const nBasic = Math.min(basic.length, n - nAdv);
      const picked = shuffle(
        [
          ...basic.slice(0, nBasic),
          ...adv.slice(0, nAdv),
          // どちらかが不足したときの補充
          ...basic.slice(nBasic),
          ...adv.slice(nAdv),
        ].slice(0, n)
      );
      results.current = picked.map(() => null);
      endsAt.current = Date.now() + minutes * 60_000;
      shownAt.current = Date.now();
      setRemaining(minutes * 60);
      setPos(0);
      setItems(picked);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  }

  // タイマー。0 になったら自動で採点へ
  useEffect(() => {
    if (!items || finished) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) setFinished(true);
    }, 250);
    return () => clearInterval(id);
  }, [items, finished]);

  function submit(correct: boolean) {
    if (!items || finished) return;
    results.current[pos] = correct;
    const q = items[pos].question;
    let xp = 0;
    if (correct) xp = q.type === "flashcard" ? XP_FLASHCARD : XP_FIRST_CORRECT;
    onAnswer(
      items[pos].setId,
      q.id,
      correct,
      xp,
      true,
      Date.now() - shownAt.current,
      0 // 模擬テストにヒントはない
    );
    shownAt.current = Date.now();
    if (pos + 1 >= items.length) {
      setFinished(true);
    } else {
      setPos(pos + 1);
    }
  }

  // 採点と保存（1回だけ）
  useEffect(() => {
    if (!finished || !items || savedResult.current) return;
    const correct = results.current.filter((r) => r === true).length;
    const result: MockResult = {
      at: new Date().toISOString(),
      score: Math.round((correct / items.length) * 100),
      correct,
      total: items.length,
      rangeLabel,
      durationMin: minutes,
    };
    savedResult.current = result;
    onFinishMock(result);
  }, [finished, items]);

  function confirmClose() {
    if (items && !finished) {
      if (!confirm("模擬テストを中断しますか？（結果は保存されません）")) return;
    }
    onClose();
  }

  // ===== 画面 =====

  if (!items) {
    // セットアップ
    return (
      <div className="modal-screen">
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="back-btn" style={{ margin: 0 }} onClick={onClose}>
            ‹ もどる
          </button>
        </div>
        <h1 className="screen-title" style={{ marginTop: 0 }}>
          🎯 模擬テスト
        </h1>
        {best !== null && (
          <p className="muted" style={{ marginTop: -8 }}>
            ベストスコア: {best}点
          </p>
        )}

        <div className="card">
          <div className="field-label">範囲</div>
          {testActive ? (
            <div style={{ fontWeight: 700 }}>{rangeLabel}</div>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                出題する単元を選ぼう
              </p>
              {index.subjects.map((subject) =>
                subject.units.map((unit) => {
                  const key = `${subject.id}/${unit.id}`;
                  const checked = pickedUnits.has(key);
                  return (
                    <button
                      key={key}
                      className="check-row"
                      onClick={() => {
                        const next = new Set(pickedUnits);
                        if (checked) next.delete(key);
                        else next.add(key);
                        setPickedUnits(next);
                      }}
                    >
                      <span className={`checkbox ${checked ? "on" : ""}`}>
                        {checked ? "✓" : ""}
                      </span>
                      <span style={{ flex: 1, textAlign: "left" }}>
                        {subject.icon} {unit.name}
                      </span>
                    </button>
                  );
                })
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="field-label">問題数</div>
          <div className="chip-row" style={{ marginBottom: 14 }}>
            {N_OPTIONS.map((v) => (
              <button
                key={v}
                className={`chip ${n === v ? "active" : ""}`}
                onClick={() => setN(v)}
              >
                {v}問
              </button>
            ))}
          </div>
          <div className="field-label">制限時間</div>
          <div className="chip-row">
            {MIN_OPTIONS.map((v) => (
              <button
                key={v}
                className={`chip ${minutes === v ? "active" : ""}`}
                onClick={() => setMinutes(v)}
              >
                {v}分
              </button>
            ))}
          </div>
        </div>

        <button
          className="primary-btn"
          disabled={busy || pool.length === 0}
          onClick={() => void start()}
        >
          スタート
        </button>
        {pool.length === 0 && (
          <p className="muted" style={{ textAlign: "center" }}>
            範囲を選ぶとスタートできるよ
          </p>
        )}
      </div>
    );
  }

  if (finished) {
    const r = savedResult.current;
    const score = r?.score ?? 0;
    const pose = score >= 90 ? "dekita" : score >= 70 ? "iine" : "ganbare";
    return (
      <div className="quiz-root">
        <div className="quiz-header">
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
          <span style={{ fontWeight: 800 }}>模擬テストの結果</span>
        </div>
        <div className="quiz-body">
          <div className="result-center" style={{ flex: "none", padding: 12 }}>
            <Abler pose={pose} size={120} />
            <div className="result-title" style={{ margin: "8px 0 4px" }}>
              {score}点
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {r?.correct}/{r?.total}問正解 ・ {rangeLabel}
              {best !== null && score > best && " ・ ベスト更新！"}
            </p>
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>見直し</div>
            {items.map((item, i) => {
              const res = results.current[i];
              return (
                <div key={i} className="review-item">
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <span className={`review-mark ${res ? "ok" : "ng"}`}>
                      {res === true ? "○" : res === false ? "×" : "−"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>
                        {questionText(item.question)}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        正解: {correctText(item.question)}
                        {res === null && "（時間切れ）"}
                      </div>
                      {item.question.explanation && (
                        <div className="muted" style={{ fontSize: 13 }}>
                          {item.question.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button className="primary-btn" onClick={onClose}>
            完了
          </button>
        </div>
      </div>
    );
  }

  // 実施中
  const item = items[pos];
  const q = item.question;
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="quiz-root">
      <div className="quiz-header">
        <button className="close-btn" onClick={confirmClose}>
          ✕
        </button>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${(pos / items.length) * 100}%` }}
          />
        </div>
        <span
          className={`mock-timer ${remaining <= 60 ? "urgent" : ""}`}
        >
          ⏱ {mm}:{ss}
        </span>
        <span className="muted" style={{ fontWeight: 700 }}>
          {pos + 1}/{items.length}
        </span>
      </div>

      <div className="quiz-body">
        <div className="muted" style={{ fontSize: 13 }}>
          模擬テスト ・ {rangeLabel}
        </div>
        {q.type === "choice" && (
          <ChoiceView
            key={`${item.setId}/${q.id}`}
            question={q}
            reveal={false}
            onSubmit={submit}
          />
        )}
        {q.type === "input" && (
          <InputView
            key={`${item.setId}/${q.id}`}
            question={q}
            disabled={false}
            onSubmit={submit}
          />
        )}
        {q.type === "flashcard" && (
          <FlashcardView
            key={`${item.setId}/${q.id}`}
            question={q}
            onSubmit={submit}
          />
        )}
        {q.type === "order" && (
          <OrderView
            key={`${item.setId}/${q.id}`}
            question={q}
            disabled={false}
            onSubmit={submit}
          />
        )}
      </div>
    </div>
  );
}
