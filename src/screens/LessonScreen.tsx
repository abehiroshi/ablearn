import { useRef, useState } from "react";
import type { LessonStep, Question } from "../types";
import { XP_LESSON, peekQuestion } from "../lib/quiz";
import {
  ChoiceView,
  FlashcardView,
  InputView,
  OrderView,
} from "../components/QuestionViews";
import Abler from "../components/Abler";
import { playCorrect, playWrong } from "../lib/sound";
import type { Milestone } from "../lib/milestones";

interface Feedback {
  correct: boolean;
  correctText?: string;
}

interface Props {
  title: string;
  setId: string;
  steps: LessonStep[];
  /** QuizScreen と同じ。レッスンは recordStat=false で呼ぶ（復習リストに混ぜない） */
  onAnswer: (
    setId: string,
    questionId: string,
    correct: boolean,
    xp: number,
    recordStat: boolean,
    timeMs: number,
    hintsUsed: number
  ) => { milestones: Milestone[] };
  /** 最後まで進めたときに1回呼ばれる（完了の記録） */
  onFinish: (score: number) => void;
  onClose: () => void;
  /** 再受講か（計画32。入り方の推奨: 初見=解説から・再受講=チラ見） */
  revisit?: boolean;
}

export default function LessonScreen({
  title,
  setId,
  steps,
  onAnswer,
  onFinish,
  onClose,
  revisit = false,
}: Props) {
  const [pos, setPos] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [finished, setFinished] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const shownAt = useRef(Date.now());
  // 問題ステップの正解数（完了スコア用）
  const results = useRef<boolean[]>([]);
  const reported = useRef(false);
  const milestones = useRef<Milestone[]>([]);

  // 入り方の選択（計画32）: チラ見に流用できる問題が無いレッスンでは選択肢自体を出さない
  const peek = peekQuestion(steps);
  const [intro, setIntro] = useState<"choosing" | "peeking" | null>(
    peek ? "choosing" : null
  );
  // チラ見中に解答してみた結果（採点なし・記録なし。「解けなくて当然」の地点）
  const [peekTried, setPeekTried] = useState(false);

  const total = steps.length;
  const step = steps[pos];

  function startSteps() {
    setIntro(null);
    shownAt.current = Date.now();
  }

  function submit(correct: boolean, correctText?: string) {
    if (feedback || finished || step.type === "card") return;
    results.current.push(correct);
    const xp = correct ? XP_LESSON : 0;
    const res = onAnswer(
      setId,
      step.id,
      correct,
      xp,
      false,
      Date.now() - shownAt.current,
      0
    );
    milestones.current.push(...res.milestones);
    setSessionXp((v) => v + xp);
    if (correct) playCorrect();
    else playWrong();
    // 間違えてもその場で解説して先へ進む（リトライはしない）
    setFeedback({ correct, correctText });
  }

  function advance() {
    setFeedback(null);
    shownAt.current = Date.now();
    if (pos + 1 >= total) {
      if (!reported.current) {
        reported.current = true;
        const qs = results.current;
        const score =
          qs.length > 0
            ? Math.round((qs.filter(Boolean).length / qs.length) * 100)
            : 100;
        onFinish(score);
      }
      setFinished(true);
    } else {
      setPos(pos + 1);
    }
  }

  if (finished) {
    const correctCount = results.current.filter(Boolean).length;
    return (
      <div className="quiz-root">
        <div className="result-center">
          <div style={{ marginBottom: 12 }}>
            <Abler pose="dekita" size={150} />
          </div>
          <div className="result-title">レッスン完了！</div>
          {milestones.current.length > 0 && (
            <div className="milestone-list">
              {milestones.current.map((m) => (
                <div key={m.id} className={`milestone ${m.big ? "big" : ""}`}>
                  {m.emoji} {m.label}
                </div>
              ))}
            </div>
          )}
          <div className="result-stats">
            <div className="stat-card">
              <div className="num">
                {correctCount}/{results.current.length}
              </div>
              <div className="label">といた問題</div>
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

  // 入り方の選択（計画32）: 「何を解けるようになるための解説か」を先に体感できる入り口。
  // テスト/レッスンの選択は従来のまま、レッスン内部の入り方だけを選ばせる
  if (intro !== null && peek) {
    const focusPeek = revisit; // 初見は「解説から」・再受講は「チラ見」を推す（選ぶのは本人）
    return (
      <div className="quiz-root">
        <div className="quiz-header">
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: 0 }} />
          </div>
        </div>
        <div className="quiz-body">
          <div className="muted" style={{ fontSize: 13 }}>
            📖 {title}
          </div>
          {intro === "choosing" ? (
            <>
              <div className="row" style={{ margin: "12px 0" }}>
                <Abler pose="hirameita" size={64} />
                <div style={{ flex: 1, fontWeight: 700 }}>
                  どこからはじめる？
                </div>
              </div>
              <button
                className={focusPeek ? "secondary-btn" : "primary-btn"}
                style={{ marginBottom: 8 }}
                onClick={startSteps}
              >
                解説から読む
              </button>
              <button
                className={focusPeek ? "primary-btn" : "secondary-btn"}
                onClick={() => setIntro("peeking")}
              >
                まず問題をチラ見する
              </button>
            </>
          ) : (
            <>
              <div className="muted" style={{ margin: "8px 0" }}>
                👀 このレッスンでこんな問題が解けるようになるよ（いまは解けなくてOK・採点なし）
              </div>
              {!peekTried ? (
                <>
                  {peek.type === "choice" && (
                    <ChoiceView
                      question={peek}
                      onSubmit={() => setPeekTried(true)}
                    />
                  )}
                  {peek.type === "input" && (
                    <InputView
                      question={peek}
                      disabled={false}
                      onSubmit={() => setPeekTried(true)}
                    />
                  )}
                  {peek.type === "flashcard" && (
                    <FlashcardView
                      question={peek}
                      onSubmit={() => setPeekTried(true)}
                    />
                  )}
                  {peek.type === "order" && (
                    <OrderView
                      question={peek}
                      disabled={false}
                      onSubmit={() => setPeekTried(true)}
                    />
                  )}
                </>
              ) : (
                <div className="row" style={{ margin: "12px 0" }}>
                  <Abler pose="nikkori" size={60} />
                  <div style={{ flex: 1 }}>
                    ためしてみたね！それで十分。解き方はこれから一緒に見ていこう
                  </div>
                </div>
              )}
              <button
                className="primary-btn"
                style={{ marginTop: "auto" }}
                onClick={startSteps}
              >
                レッスンをはじめる
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const q = step.type === "card" ? null : (step as Question);

  return (
    <div className="quiz-root">
      <div className="quiz-header">
        <button
          className="close-btn"
          onClick={() => {
            if (pos === 0 || confirm("レッスンを中断しますか？")) onClose();
          }}
        >
          ✕
        </button>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${(pos / total) * 100}%` }}
          />
        </div>
        <span className="muted" style={{ fontWeight: 700 }}>
          {pos + 1}/{total}
        </span>
      </div>

      <div className="quiz-body">
        <div className="muted" style={{ fontSize: 13 }}>
          📖 {title}
        </div>

        {step.type === "card" && (
          <>
            <div className="lesson-card">
              {step.title && (
                <div className="lesson-card-title">{step.title}</div>
              )}
              <div className="lesson-card-body">{step.body}</div>
            </div>
            <button
              className="primary-btn"
              style={{ marginTop: "auto" }}
              onClick={advance}
            >
              次へ
            </button>
          </>
        )}

        {q?.type === "choice" && (
          <ChoiceView key={`${step.id}`} question={q} onSubmit={submit} />
        )}
        {q?.type === "input" && (
          <InputView
            key={`${step.id}`}
            question={q}
            disabled={!!feedback}
            onSubmit={submit}
          />
        )}
        {q?.type === "flashcard" && (
          <FlashcardView key={`${step.id}`} question={q} onSubmit={submit} />
        )}
        {q?.type === "order" && (
          <OrderView
            key={`${step.id}`}
            question={q}
            disabled={!!feedback}
            onSubmit={submit}
          />
        )}

        {feedback && (
          <div className={`feedback ${feedback.correct ? "ok" : "ng"}`}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <Abler
                pose={feedback.correct ? "iine" : "nikkori"}
                size={60}
              />
              <div style={{ flex: 1 }}>
                <div className="head">
                  {feedback.correct
                    ? "せいかい！ 🎉"
                    : "だいじょうぶ、一緒に確認しよう"}
                </div>
                {!feedback.correct && feedback.correctText && (
                  <div className="explanation">
                    <strong>正解: </strong>
                    {feedback.correctText}
                  </div>
                )}
                {q?.explanation && (
                  <div className="explanation">{q.explanation}</div>
                )}
              </div>
            </div>
            <button className="primary-btn" onClick={advance}>
              次へ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
