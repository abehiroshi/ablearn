import { useRef, useState } from "react";
import type { QuizItem } from "../App";
import type { ContentLink, SetMeta } from "../types";
import {
  StruggleCounter,
  XP_FIRST_CORRECT,
  XP_FLASHCARD,
  XP_RETRY_CORRECT,
  XP_TRACE,
  choiceAsInput,
  emptyStruggle,
  isStruggling,
  nextStruggle,
} from "../lib/quiz";
import {
  ChoiceView,
  FlashcardView,
  InputView,
  OrderView,
} from "../components/QuestionViews";
import Abler from "../components/Abler";
import { Encouragement, pickEncouragement } from "../lib/encouragement";
import { playCorrect, playFanfare, playWrong } from "../lib/sound";
import ScratchPad from "../components/ScratchPad";
import { RANK_LABELS } from "../lib/mastery";
import type { Milestone } from "../lib/milestones";

interface Feedback {
  correct: boolean;
  /** 写経の完了（計画25。祝い方を「正解」と変える） */
  trace?: boolean;
  /** 不正解時に表示する正解 */
  correctText?: string;
  /** 「わからない」経由（責めずに解説・ヒントを見せる） */
  dontKnow?: boolean;
  /** 概念の段位が上がった（習熟度エンジン） */
  promotedTo?: number | null;
  /** 再戦に勝った（計画30）。「○日前の自分に勝った」演出に使う日数 */
  rematchWin?: number;
  /** この解答で跨いだ節目（軽いチップで祝福） */
  milestones?: Milestone[];
  /** つまずき検知（計画13・24・26）: 励まし＋誘導（前提の復習 > レッスン > 授業動画） */
  struggle?: {
    encouragement: Encouragement;
    /** 習熟の低い前提概念の復習先（あればレッスンより優先して見せる） */
    prereq: { name: string; set: SetMeta } | null;
    lesson: SetMeta | null;
    links: ContentLink[];
  };
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
    hintsTotal?: number,
    trace?: boolean,
    rematch?: boolean
  ) => { promotedTo: number | null; milestones: Milestone[] };
  onFinish: (score: number) => void;
  onClose: () => void;
  /** setId からその単元のレッスン/外部リンクを引く（つまずき誘導用） */
  lessonFor?: (setId: string) => SetMeta | null;
  unitLinksFor?: (setId: string) => ContentLink[];
  /** 概念の「前提概念の復習」誘導先（計画26）。習熟の低い前提が無ければ null */
  prereqFor?: (
    concept: string,
    currentSetId: string
  ) => { name: string; set: SetMeta } | null;
  onStartLesson?: (meta: SetMeta) => void;
}

export default function QuizScreen({
  title,
  items,
  onAnswer,
  onFinish,
  onClose,
  lessonFor,
  unitLinksFor,
  prereqFor,
  onStartLesson,
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
  // つまずき検知のカウンタ（概念単位。conceptが無ければ問題単位）
  const struggles = useRef(new Map<string, StruggleCounter>());
  // 誘導は同じキーにつきセッション内1回だけ（無視した後に毎回出るとうるさい）
  const struggleShown = useRef(new Set<string>());

  const total = items.length;
  const current = queue[0];

  function keyOf(item: QuizItem): string {
    return `${item.setId}/${item.question.id}`;
  }

  /**
   * つまずきカウンタを進め、検知したら励まし＋誘導先を返す（計画13・24）。
   * 「繰り返し外し続ける体験」を断つための導線（無視して続けることもできる）。
   * 誘導先が無くても励ましだけは出す（責めずに次の一歩を示す）
   */
  /** 励まし＋誘導先（前提の復習 > レッスン > 授業動画。計画26）を組む */
  function buildGuidance(): NonNullable<Feedback["struggle"]> {
    const q = current!.question;
    const prereq = q.concept
      ? (prereqFor?.(q.concept, current!.setId) ?? null)
      : null;
    const lesson = lessonFor?.(current!.setId) ?? null;
    const links = unitLinksFor?.(current!.setId) ?? [];
    return { encouragement: pickEncouragement(), prereq, lesson, links };
  }

  function trackStruggle(correct: boolean): Feedback["struggle"] {
    const q = current!.question;
    const key = q.concept ?? keyOf(current!);
    const hintsTotal = q.hints?.length ?? 0;
    const next = nextStruggle(struggles.current.get(key) ?? emptyStruggle(), {
      correct,
      usedAllHints: hintsTotal > 0 && hintsShown >= hintsTotal,
    });
    struggles.current.set(key, next);
    if (correct || !isStruggling(next) || struggleShown.current.has(key))
      return undefined;
    struggleShown.current.add(key);
    return buildGuidance();
  }

  function submit(correct: boolean, correctText?: string) {
    if (feedback || finished || !current) return;
    const key = keyOf(current);
    const isFirst = !firstResults.current.has(key);
    if (isFirst) firstResults.current.set(key, correct);
    const timeMs = Date.now() - shownAt.current;

    let xp = 0;
    if (correct) {
      // 写経は覚えた証明ではないので小さく（レッスン並み）
      if (current.asTrace) xp = XP_TRACE;
      else if (current.question.type === "flashcard") xp = XP_FLASHCARD;
      // ヒントを使った正解はリトライ正解と同額（+5）
      else if (hintsShown > 0) xp = XP_RETRY_CORRECT;
      else xp = isFirst ? XP_FIRST_CORRECT : XP_RETRY_CORRECT;
    }
    const { promotedTo, milestones } = onAnswer(
      current.setId,
      current.question.id,
      correct,
      xp,
      // 写経は「見ながら打てた」だけなので正答実績（復習リスト・達成度）に混ぜない
      isFirst && !current.asTrace,
      timeMs,
      hintsShown,
      false,
      current.question.concept,
      current.question.hints?.length ?? 0,
      current.asTrace,
      !!current.rematch
    );
    sessionMilestones.current.push(...milestones);
    setSessionXp((v) => v + xp);

    // 再戦の勝利（計画30）: セッション内の初回正解だけを「勝ち」として祝う
    const rematchWin =
      correct && isFirst && current.rematch
        ? current.rematch.daysAgo
        : undefined;

    // 効果音（計画27）: 祝福があるときは祝福音だけ鳴らす（重ねない）
    if (milestones.length > 0 || promotedTo != null || rematchWin != null)
      playFanfare();
    else if (correct) playCorrect();
    else playWrong();

    // フラッシュカードは自己申告でフィードバックを挟まないため、
    // つまずき検知に数えると励まし・誘導が表示されないまま
    // 「セッション内1回」を消費してしまう。対象外にする
    let struggle =
      current.question.type === "flashcard"
        ? undefined
        : trackStruggle(correct);
    // 再戦の敗北は責めない: つまずき閾値を待たずに励まし→誘導を出す（計画30）
    if (!correct && current.rematch && !struggle) struggle = buildGuidance();

    if (current.question.type === "flashcard") {
      advance(correct);
    } else {
      setFeedback({
        correct,
        trace: current.asTrace,
        correctText,
        promotedTo,
        rematchWin,
        milestones,
        struggle,
      });
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
      current.question.hints?.length ?? 0,
      false,
      !!current.rematch
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
    // わからない もつまずきのシグナルとして数える
    let struggle = trackStruggle(false);
    // 再戦の敗北は責めない: つまずき閾値を待たずに励まし→誘導を出す（計画30）
    if (current.rematch && !struggle) struggle = buildGuidance();
    playWrong(); // 不正解と同じ柔らかい音（罰の音にしない）
    setFeedback({ correct: false, dontKnow: true, correctText, struggle });
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
  // answers つき choice は input 形式でも出せる（asInput/asTrace は12・25の出し分けが立てる）
  const q =
    (current.asInput || current.asTrace) && current.question.type === "choice"
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

        {/* 再戦フレーム（計画30）: 「弱点の消化」ではなく「過去の自分に挑む」場にする */}
        {current.rematch && (
          <div className="rematch-frame">
            ⚔️ {current.rematch.daysAgo}日前はとけなかった問題
          </div>
        )}

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
            trace={current.asTrace}
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

        {q.hints && q.hints.length > 0 && !feedback && !current.asTrace && (
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
                    : feedback.struggle
                      ? feedback.struggle.encouragement.pose
                      : feedback.dontKnow
                        ? "kangaechu"
                        : "kuyashii"
                }
                size={60}
              />
              <div style={{ flex: 1 }}>
                <div className="head">
                  {feedback.correct
                    ? feedback.trace
                      ? "かけた！✍️ つぎは自分でやってみよう"
                      : "せいかい！ 🎉"
                    : feedback.struggle
                      ? feedback.struggle.encouragement.text
                      : feedback.dontKnow
                        ? "だいじょうぶ！いっしょに確認しよう"
                        : "ざんねん…"}
                </div>
                {feedback.rematchWin != null && (
                  <div className="rank-up">
                    🏆 {feedback.rematchWin}日前の自分に勝った！
                  </div>
                )}
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
                {feedback.struggle &&
                  (feedback.struggle.prereq ||
                    feedback.struggle.lesson ||
                    feedback.struggle.links.length > 0) && (
                  <div className="struggle-box">
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>
                      {feedback.struggle.prereq
                        ? "手前にもどってからの方が近道だよ！"
                        : "きほんにもどるのが近道だよ！"}
                    </div>
                    {feedback.struggle.prereq ? (
                      <button
                        className="secondary-btn"
                        onClick={() =>
                          onStartLesson?.(feedback.struggle!.prereq!.set)
                        }
                      >
                        📚 「{feedback.struggle.prereq.name}」をふくしゅう
                      </button>
                    ) : feedback.struggle.lesson ? (
                      <button
                        className="secondary-btn"
                        onClick={() =>
                          onStartLesson?.(feedback.struggle!.lesson!)
                        }
                      >
                        📖 {feedback.struggle.lesson.name}
                      </button>
                    ) : (
                      <div className="link-row" style={{ marginTop: 0 }}>
                        {feedback.struggle.links.map((l) => (
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
