# 写経段階（テキスト写経・ラダー最弱段）

- 状態: 完了（2026-06-12）
- 引き継ぎメモ（実装）:
  - レベル番号は変えず **写経段 = level -1**（`TRACE_LEVEL`）とした。保存済み level 0〜2 の意味は不変＝データ移行なし。
    降格判定用に `ConceptMastery.wrongStreak?`（連続不正解数）を追加（旧データは ?? 0 で読む。フィクスチャ v1-after-12 追加）
  - 初見判定は `deriveInitialMastery`（全変種に解答実績ゼロ → -1）。choice 段から連続2回不正解（`DEMOTE_TO_TRACE_WRONGS`）で -1 へ
  - 出題は `pickVariant`: answers を持つ最易変種（difficulty 3 除く）を `QuizItem.asTrace` で出す。choice 変種は asInput 併用で input 化。
    写経できない概念（flashcard/order のみ）は choice 段へフォールバック
  - 完了は `AnswerSignal.trace` で `applyAnswer` に伝える（level → max(0, level)・streak に数えない・翌日再確認）。
    写経の正解は `questionStats` に入れない（recordStat=false。復習リスト・達成度を汚さない）。XP は `XP_TRACE`(+2)
  - UI は InputView の trace モード（`.trace-ghost` を入力欄に重ねる。ヒント・わからない非表示・一致で自動完了）。
    Stats の段位表は4段（✏️ みながらかける を追加）
  - 既知の警け（破綻条件）: 1概念だけのセットを写経完了すると setRecords に best=100 が記録され、Library 上は「100%」に見える。
    翌日 dueDate でおすすめに再浮上するため実害は限定的だが、「写経だけで100%表示」が紛らわしいと感じたら
    スコア分母から写経を除く小修正を入れる
  - ゴーストは answers[0] を white-space:pre で重ねる。入力欄の横幅を超える長い答えはゴーストがスクロールに追従しない（短答前提）
- 触るファイル範囲: `src/components/QuestionViews.tsx`・`src/lib/`（mastery / quiz）・`src/screens/QuizScreen.tsx`
- 引き継ぎメモ: 根拠は [調査レポート](../research/learning-apps-survey.md) B-1（Monoxer の写経形式）。実装形はテキスト写経（案a・オーナー決定 2026-06-12）。手書きなぞり（案b）は漢字の書き対策が必要になったら別計画

## 目的

「選択すらできない」完全な初見状態の受け皿として、習熟度ラダーの choice より下に
「写経」段階を追加する。答えを見ながら入力する行為自体が最初の学習になる。

## 内容

- **形式**: input 問題の変形。入力欄に正解が薄く（ゴースト表示で）見えており、見ながら打つ。
  一致したら完了。新しい問題タイプは作らず、出題時のモードとして実装（`asInput` と同じ系統）
- **ラダー拡張**: 写経 → choice → input → 応用変種 の4段に。習熟度エンジン（12）の昇降格に1段追加
- **出題条件**: その概念の解答履歴が全くない初見時、または降格の底（choice で連続不正解）で写経を出す
- **XP**: 写経完了は +2（レッスン並み。覚えた証明ではないので小さく）
- 対象は answers を持つ問題（input、choice+answers 両用）。flashcard・order は対象外

## 非スコープと破綻条件

- 手書きなぞり（案b）はやらない → 漢字の「書き」を写経したくなったら別計画（なぞり判定は
  自己申告になる制約も込みで検討）
- 写経の連打による XP 稼ぎは +2 の低さで抑止 → 乱用が見えたら1問1日1回に制限

## 受け入れ条件

- 初見の概念が写経形式で出題され、完了すると choice 段に進む
- choice での連続不正解で写経に降格する
- 既存の習熟度データが壊れない（互換フィクスチャ追加）
- 昇降格ルールの変更が docs/spec.md に反映されている
