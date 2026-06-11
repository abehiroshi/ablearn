import { useMemo, useState } from "react";
import type {
  ChoiceQuestion,
  FlashcardQuestion,
  InputQuestion,
  OrderQuestion,
} from "../types";
import { checkInputAnswer, checkOrder, shuffle } from "../lib/quiz";

type Submit = (correct: boolean, correctText?: string) => void;

// ===== 選択式 =====

export function ChoiceView({
  question,
  onSubmit,
  reveal = true,
}: {
  question: ChoiceQuestion;
  onSubmit: Submit;
  /** false なら選択後も正誤の色付けをしない（模擬テスト用） */
  reveal?: boolean;
}) {
  // 表示順をシャッフルしつつ正解インデックスを追跡する
  const order = useMemo(
    () => shuffle(question.choices.map((_, i) => i)),
    [question]
  );
  const [chosen, setChosen] = useState<number | null>(null);

  function choose(originalIndex: number) {
    if (chosen !== null) return;
    setChosen(originalIndex);
    onSubmit(
      originalIndex === question.answer,
      question.choices[question.answer]
    );
  }

  return (
    <>
      <div className="q-text">{question.question}</div>
      <div className="choices">
        {order.map((oi) => {
          let cls = "choice-btn";
          if (chosen !== null && reveal) {
            if (oi === question.answer) cls += " correct";
            else if (oi === chosen) cls += " wrong";
          }
          return (
            <button
              key={oi}
              className={cls}
              disabled={chosen !== null}
              onClick={() => choose(oi)}
            >
              {question.choices[oi]}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ===== 入力式 =====

export function InputView({
  question,
  disabled,
  onSubmit,
}: {
  question: InputQuestion;
  disabled: boolean;
  onSubmit: Submit;
}) {
  const [value, setValue] = useState("");

  function submit() {
    if (disabled || !value.trim()) return;
    onSubmit(checkInputAnswer(value, question.answers), question.answers[0]);
  }

  return (
    <>
      <div className="q-text">{question.question}</div>
      <input
        className="answer-input"
        value={value}
        placeholder={question.placeholder ?? "答えを入力"}
        autoCapitalize="off"
        autoCorrect="off"
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <button
        className="primary-btn"
        style={{ marginTop: 16 }}
        disabled={disabled || !value.trim()}
        onClick={submit}
      >
        答える
      </button>
    </>
  );
}

// ===== フラッシュカード =====

export function FlashcardView({
  question,
  onSubmit,
}: {
  question: FlashcardQuestion;
  onSubmit: Submit;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <>
      <div className="flash-scene">
        <div
          className={`flash-card ${flipped ? "flipped" : ""}`}
          onClick={() => setFlipped((f) => !f)}
        >
          <div className="flash-face">
            {question.front}
            <span className="flash-hint">タップしてめくる</span>
          </div>
          <div className="flash-face back">
            {question.back}
            <span className="flash-hint">タップして戻す</span>
          </div>
        </div>
      </div>
      {flipped && (
        <div className="row">
          <button
            className="secondary-btn"
            style={{ flex: 1, background: "var(--red-soft)", color: "var(--red)" }}
            onClick={() => onSubmit(false)}
          >
            まだ
          </button>
          <button
            className="secondary-btn"
            style={{ flex: 1, background: "var(--green-soft)", color: "var(--green)" }}
            onClick={() => onSubmit(true)}
          >
            覚えた
          </button>
        </div>
      )}
    </>
  );
}

// ===== 並べ替え =====

export function OrderView({
  question,
  disabled,
  onSubmit,
}: {
  question: OrderQuestion;
  disabled: boolean;
  onSubmit: Submit;
}) {
  // 同じ単語が複数あっても区別できるよう、元インデックスで管理する
  const pool = useMemo(
    () => shuffle(question.tokens.map((t, i) => ({ t, i }))),
    [question]
  );
  const [selected, setSelected] = useState<{ t: string; i: number }[]>([]);

  const used = new Set(selected.map((s) => s.i));

  function submit() {
    if (disabled || selected.length !== question.tokens.length) return;
    onSubmit(
      checkOrder(
        selected.map((s) => s.t),
        question.tokens
      ),
      question.tokens.join(" ")
    );
  }

  return (
    <>
      <div className="q-text">{question.question}</div>
      <div className="token-area">
        {selected.length === 0 && (
          <span className="muted" style={{ alignSelf: "center" }}>
            下の語をタップして並べよう
          </span>
        )}
        {selected.map((s) => (
          <button
            key={s.i}
            className="token selected"
            disabled={disabled}
            onClick={() =>
              setSelected((sel) => sel.filter((x) => x.i !== s.i))
            }
          >
            {s.t}
          </button>
        ))}
      </div>
      <div className="token-pool">
        {pool.map((p) => (
          <button
            key={p.i}
            className={`token ${used.has(p.i) ? "ghost" : ""}`}
            disabled={disabled || used.has(p.i)}
            onClick={() => setSelected((sel) => [...sel, p])}
          >
            {p.t}
          </button>
        ))}
      </div>
      <button
        className="primary-btn"
        style={{ marginTop: 20 }}
        disabled={disabled || selected.length !== question.tokens.length}
        onClick={submit}
      >
        答える
      </button>
    </>
  );
}
