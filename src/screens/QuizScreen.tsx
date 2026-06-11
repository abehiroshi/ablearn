import { useRef, useState } from "react";
import type { QuizItem } from "../App";
import {
  XP_FIRST_CORRECT,
  XP_FLASHCARD,
  XP_RETRY_CORRECT,
} from "../lib/quiz";
import {
  ChoiceView,
  FlashcardView,
  InputView,
  OrderView,
} from "../components/QuestionViews";
import Abler from "../components/Abler";

interface Feedback {
  correct: boolean;
  /** 不正解時に表示する正解 */
  correctText?: string;
}

interface Props {
  title: string;
  items: QuizItem[];
  onAnswer: (
    setId: string,
    questionId: string,
    correct: boolean,
    xp: number,
    recordStat: boolean
  ) => void;
  onFinish: (score: number) => void;
  onClose: () => void;
}

export default function QuizScreen({
  title,
  items,
  onAnswer,
  onFinish,
  onClose,
}: Props) {
  // 先頭が現在の問題。不正解はキューの最後に回して正解するまで繰り返す
  const [queue, setQueue] = useState<QuizItem[]>(items);
  const [done, setDone] = useState(0);
  const [attempt, setAttempt] = useState(0); // リトライ時にビューを作り直すためのカウンタ
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [finished, setFinished] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  // セッション内の初回解答の結果（スコア計算用）。再描画不要なので ref
  const firstResults = useRef(new Map<string, boolean>());

  const total = items.length;
  const current = queue[0];

  function keyOf(item: QuizItem): string {
    return `${item.setId}/${item.question.id}`;
  }

  function submit(correct: boolean, correctText?: string) {
    if (feedback || finished || !current) return;
    const key = keyOf(current);
    const isFirst = !firstResults.current.has(key);
    if (isFirst) firstResults.current.set(key, correct);

    let xp = 0;
    if (correct) {
      if (current.question.type === "flashcard") xp = XP_FLASHCARD;
      else xp = isFirst ? XP_FIRST_CORRECT : XP_RETRY_CORRECT;
    }
    onAnswer(current.setId, current.question.id, correct, xp, isFirst);
    setSessionXp((v) => v + xp);

    // フラッシュカードは自己申告なのでフィードバックを挟まず次へ
    if (current.question.type === "flashcard") {
      advance(correct);
    } else {
      setFeedback({ correct, correctText });
    }
  }

  function advance(correct: boolean) {
    setFeedback(null);
    setAttempt((a) => a + 1);
    if (correct) {
      const nextDone = done + 1;
      setDone(nextDone);
      setQueue((q) => q.slice(1));
      if (nextDone >= total && queue.length <= 1) {
        const results = [...firstResults.current.values()];
        const score = Math.round(
          (results.filter(Boolean).length / total) * 100
        );
        onFinish(score);
        setFinished(true);
      }
    } else {
      setQueue((q) => [...q.slice(1), q[0]]);
    }
  }

  if (finished) {
    const results = [...firstResults.current.values()];
    const correctCount = results.filter(Boolean).length;
    const score = Math.round((correctCount / total) * 100);
    const pose = score === 100 ? "dekita" : score >= 80 ? "iine" : "ganbare";
    return (
      <div className="quiz-root">
        <div className="result-center">
          <div style={{ marginBottom: 12 }}>
            <Abler pose={pose} size={150} />
          </div>
          <div className="result-title">
            {score === 100 ? "パーフェクト！" : "おつかれさま！"}
          </div>
          <div className="result-stats">
            <div className="stat-card">
              <div className="num">{score}%</div>
              <div className="label">正答率</div>
            </div>
            <div className="stat-card">
              <div className="num">
                {correctCount}/{total}
              </div>
              <div className="label">正解</div>
            </div>
            <div className="stat-card">
              <div className="num">+{sessionXp}</div>
              <div className="label">XP</div>
            </div>
          </div>
          <button
            className="primary-btn"
            style={{ width: "100%" }}
            onClick={onClose}
          >
            完了
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const q = current.question;
  const viewKey = `${keyOf(current)}#${attempt}`;

  return (
    <div className="quiz-root">
      <div className="quiz-header">
        <button
          className="close-btn"
          onClick={() => {
            if (done === 0 || confirm("学習を中断しますか？")) onClose();
          }}
        >
          ✕
        </button>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <span className="muted" style={{ fontWeight: 700 }}>
          {Math.min(done + 1, total)}/{total}
        </span>
      </div>

      <div className="quiz-body">
        <div className="muted" style={{ fontSize: 13 }}>
          {title}
        </div>

        {q.type === "choice" && (
          <ChoiceView key={viewKey} question={q} onSubmit={submit} />
        )}
        {q.type === "input" && (
          <InputView
            key={viewKey}
            question={q}
            disabled={!!feedback}
            onSubmit={submit}
          />
        )}
        {q.type === "flashcard" && (
          <FlashcardView key={viewKey} question={q} onSubmit={submit} />
        )}
        {q.type === "order" && (
          <OrderView
            key={viewKey}
            question={q}
            disabled={!!feedback}
            onSubmit={submit}
          />
        )}

        {feedback && (
          <div className={`feedback ${feedback.correct ? "ok" : "ng"}`}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <Abler pose={feedback.correct ? "iine" : "kuyashii"} size={60} />
              <div style={{ flex: 1 }}>
                <div className="head">
                  {feedback.correct ? "せいかい！ 🎉" : "ざんねん…"}
                </div>
                {!feedback.correct && feedback.correctText && (
                  <div className="explanation">
                    <strong>正解: </strong>
                    {feedback.correctText}
                  </div>
                )}
                {q.explanation && (
                  <div className="explanation">{q.explanation}</div>
                )}
              </div>
            </div>
            <button
              className="primary-btn"
              onClick={() => advance(feedback.correct)}
            >
              {feedback.correct ? "次へ" : "あとでもう一度"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
