import { useRef, useState } from "react";
import type { QuizItem } from "../App";
import {
  XP_FIRST_CORRECT,
  XP_FLASHCARD,
  XP_RETRY_CORRECT,
  choiceAsInput,
} from "../lib/quiz";
import {
  ChoiceView,
  FlashcardView,
  InputView,
  OrderView,
} from "../components/QuestionViews";
import Abler from "../components/Abler";
import ScratchPad from "../components/ScratchPad";
import { RANK_LABELS } from "../lib/mastery";
import type { Milestone } from "../lib/milestones";

interface Feedback {
  correct: boolean;
  /** 不正解時に表示する正解 */
  correctText?: string;
  /** 「わからない」経由（責めずに解説・ヒントを見せる） */
  dontKnow?: boolean;
  /** 概念の段位が上がった（習熟度エンジン） */
  promotedTo?: number | null;
  /** この解答で跨いだ節目（軽いチップで祝福） */
  milestones?: Milestone[];
}

interface Props {
  title: string;
  items: QuizItem[];
  onAnswer: (
    setId: string,
    questionId: string,
    correct: boolean,
    xp: number,
    recordStat: boolean,
    timeMs: number,
    hintsUsed: number,
    dontKnow?: boolean,
    concept?: string,
    hintsTotal?: number
  ) => { promotedTo: number | null; milestones: Milestone[] };
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
  // 手書き計算余白（スマホはオーバーレイ開閉、タブレット横画面では常時表示）
  const [scratchOpen, setScratchOpen] = useState(false);
  // 現在の問題で開いたヒントの段階数。次の問題・リトライでリセット
  const [hintsShown, setHintsShown] = useState(0);
  // セッション内の初回解答の結果（スコア計算用）。再描画不要なので ref
  const firstResults = useRef(new Map<string, boolean>());
  // 現在の問題が表示された時刻。解答時間（表示→確定）の計測用
  const shownAt = useRef(Date.now());
  // セッション中に跨いだ節目（結果画面でまとめて祝福）
  const sessionMilestones = useRef<Milestone[]>([]);

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
    const timeMs = Date.now() - shownAt.current;

    let xp = 0;
    if (correct) {
      if (current.question.type === "flashcard") xp = XP_FLASHCARD;
      // ヒントを使った正解はリトライ正解と同額（+5）
      else if (hintsShown > 0) xp = XP_RETRY_CORRECT;
      else xp = isFirst ? XP_FIRST_CORRECT : XP_RETRY_CORRECT;
    }
    const { promotedTo, milestones } = onAnswer(
      current.setId,
      current.question.id,
      correct,
      xp,
      isFirst,
      timeMs,
      hintsShown,
      false,
      current.question.concept,
      current.question.hints?.length ?? 0
    );
    sessionMilestones.current.push(...milestones);
    setSessionXp((v) => v + xp);

    // フラッシュカードは自己申告なのでフィードバックを挟まず次へ
    if (current.question.type === "flashcard") {
      advance(correct);
    } else {
      setFeedback({ correct, correctText, promotedTo, milestones });
      // スマホのオーバーレイがフィードバックを隠さないように閉じる
      setScratchOpen(false);
    }
  }

  /** 「わからない」: 罰ではなく学びへの近道。解説と全ヒントを見せて再出題キューへ */
  function giveUp() {
    if (feedback || finished || !current) return;
    const key = keyOf(current);
    const isFirst = !firstResults.current.has(key);
    if (isFirst) firstResults.current.set(key, false);
    const timeMs = Date.now() - shownAt.current;
    onAnswer(
      current.setId,
      current.question.id,
      false,
      0, // XPは0だが減点もなし
      isFirst,
      timeMs,
      hintsShown,
      true,
      current.question.concept,
      current.question.hints?.length ?? 0
    );
    const q = current.question;
    const correctText =
      q.type === "choice"
        ? q.choices[q.answer]
        : q.type === "input"
          ? q.answers[0]
          : q.type === "order"
            ? q.tokens.join(" ")
            : undefined;
    setFeedback({ correct: false, dontKnow: true, correctText });
    setScratchOpen(false);
  }

  function advance(correct: boolean) {
    setFeedback(null);
    setAttempt((a) => a + 1);
    setHintsShown(0);
    shownAt.current = Date.now();
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
          {sessionMilestones.current.length > 0 && (
            <div className="milestone-list">
              {sessionMilestones.current.map((m) => (
                <div key={m.id} className={`milestone ${m.big ? "big" : ""}`}>
                  {m.emoji} {m.label}
                </div>
              ))}
            </div>
          )}
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
  // answers つき choice は input 形式でも出せる（asInput は12の出し分けが立てる）
  const q =
    current.asInput && current.question.type === "choice"
      ? (choiceAsInput(current.question) ?? current.question)
      : current.question;
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
        <button
          className="scratch-toggle"
          aria-label="計算用紙"
          onClick={() => setScratchOpen((v) => !v)}
        >
          ✏️
        </button>
      </div>

      <div className="quiz-columns">
        <div className="quiz-body">
        <div className="muted" style={{ fontSize: 13 }}>
          {title}
        </div>

        {q.type === "choice" && (
          <ChoiceView
            key={viewKey}
            question={q}
            onSubmit={submit}
            onGiveUp={giveUp}
          />
        )}
        {q.type === "input" && (
          <InputView
            key={viewKey}
            question={q}
            disabled={!!feedback}
            onSubmit={submit}
            onGiveUp={giveUp}
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
            onGiveUp={giveUp}
          />
        )}

        {q.hints && q.hints.length > 0 && !feedback && (
          <div className="hint-area">
            {q.hints.slice(0, hintsShown).map((hint, i) => (
              <div key={i} className="hint-row">
                <Abler
                  pose={i === q.hints!.length - 1 ? "hirameita" : "kangaechu"}
                  size={44}
                />
                <div className="hint-bubble">{hint}</div>
              </div>
            ))}
            {hintsShown < q.hints.length && (
              <button
                className="hint-btn"
                onClick={() => setHintsShown((v) => v + 1)}
              >
                💡 {hintsShown === 0 ? "ヒントを見る" : "つぎのヒント"}（
                {hintsShown + 1}/{q.hints.length}）
              </button>
            )}
          </div>
        )}

        {feedback && (
          <div
            className={`feedback ${feedback.correct ? "ok" : feedback.dontKnow ? "neutral" : "ng"}`}
          >
            <div className="row" style={{ alignItems: "flex-start" }}>
              <Abler
                pose={
                  feedback.correct
                    ? "iine"
                    : feedback.dontKnow
                      ? "kangaechu"
                      : "kuyashii"
                }
                size={60}
              />
              <div style={{ flex: 1 }}>
                <div className="head">
                  {feedback.correct
                    ? "せいかい！ 🎉"
                    : feedback.dontKnow
                      ? "だいじょうぶ！いっしょに確認しよう"
                      : "ざんねん…"}
                </div>
                {feedback.promotedTo != null && (
                  <div className="rank-up">
                    📈 ランクアップ！「{RANK_LABELS[feedback.promotedTo]}」になった！
                  </div>
                )}
                {feedback.milestones?.map((m) => (
                  <div key={m.id} className="rank-up">
                    {m.emoji} {m.label}
                  </div>
                ))}
                {!feedback.correct && feedback.correctText && (
                  <div className="explanation">
                    <strong>正解: </strong>
                    {feedback.correctText}
                  </div>
                )}
                {q.explanation && (
                  <div className="explanation">{q.explanation}</div>
                )}
                {feedback.dontKnow &&
                  q.hints &&
                  q.hints.length > 0 && (
                    <div className="explanation">
                      {q.hints.map((h, i) => (
                        <div key={i}>💡 {h}</div>
                      ))}
                    </div>
                  )}
                {q.links && q.links.length > 0 && (
                  <div className="link-row">
                    {q.links.map((l) => (
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

        <div className={`scratch-panel ${scratchOpen ? "open" : ""}`}>
          <ScratchPad
            resetKey={keyOf(current)}
            onClose={() => setScratchOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
