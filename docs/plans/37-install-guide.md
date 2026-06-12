# ホーム画面に追加の案内（iOS Safari / Android）

- 状態: 完了（2026-06-12）
- 引き継ぎメモ:
  - 判定は `src/lib/install.ts`（installGuideFor が純関数・テスト済み）。iOS 判定は UA＋
    iPadOS の Mac 偽装対策（maxTouchPoints）。閉じた記録はコレクション非依存の
    localStorage キー `ablearn:install-guide-dismissed`
  - Android の install prompt は `isAndroid()` でゲート（**デスクトップ Chrome も
    beforeinstallprompt を発火させる**ため。Breaker レビューで検出して補修）
  - iOS の実機（Safari）と Android 実機の見た目は未確認（UA偽装でiOS表示・閉じる動作・
    Stats 常設導線・デスクトップ非表示はプレビューで確認済み）。実機で文言・アイコンの
    見え方が気になったら HomeScreen の ShareIcon / 文言を調整
  - localStorage が使えない環境では案内を出さない（fail-closed）
- 触るファイル範囲: `src/lib/install.ts`（新規・判定）・`src/App.tsx`（配線）・
  `src/screens/HomeScreen.tsx`（案内カード）・`src/screens/StatsScreen.tsx`（常設の手順）
- 出典: オーナー発案（2026-06-12）。iPhone の Safari で開いたときに
  ホーム画面への追加へ簡単に誘導したい

## 目的

ブラウザで開いている利用者を「ホーム画面に追加」へ誘導する。
iOS Safari には自動インストールプロンプト（beforeinstallprompt）が無いため、
手順をその場で見せる案内が最善手。

## 内容

- **iOS（ブラウザ閲覧時のみ）**: ホームに案内カード
  「① 共有ボタン（□↑）→ ② ホーム画面に追加」。
  ホーム画面起動済み（standalone）なら一切出さない。「とじる」で永続的に非表示（localStorage）
- **Android Chrome**: `beforeinstallprompt` を捕まえて同じカードに本物の
  「ホーム画面に追加する」ボタンを出す（タップでOSのインストールUI）
- **常設の入り口**: 成績（Stats）画面に「📲 ホーム画面に追加」の手順カードを置く
  （案内を閉じたあとでも辿れる。standalone・非iOSでは出さない）
- PWA の土台（apple-touch-icon・manifest・theme-color）は構築済みのため触らない

## 非スコープと破綻条件

- LINE 内ブラウザ等の WebView 対応はしない → iOS の「ホーム画面に追加」は
  Safari 系ブラウザからしかできない。検知して文言を変える価値が出たら再検討
- 表示頻度の制御（N日後に再表示等）はやらない → 一度閉じたら出さない。
  Stats の常設導線で十分

## 受け入れ条件

- 判定ロジック（iOS/standalone/閉じた後/Android prompt）がテストで確認できる
- standalone 起動時・閉じた後に案内が出ない
- デスクトップブラウザでは何も変わらない
