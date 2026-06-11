# Ablearn

中学生の定期テスト対策アプリ。PWA 対応・進捗は端末の localStorage に保存（1人用）。

- 公開 URL: https://abehiroshi.github.io/ablearn/
- 開発: `npm install` → `npm run dev`
- デプロイ: main に push すると GitHub Actions が自動で GitHub Pages に公開

## コレクション（URL分離）

同じアプリで独立したコンテンツの世界を URL で分けて提供する（進捗も完全に独立）。

- `/ablearn/` — コレクション一覧（`public/content/collections.json` で管理）
- `/ablearn/chugaku/` — 中学教科書（PWA名「中学生問題集」）
- コレクションを増やすときは `<id>/index.html` を作って `vite.config.ts` の input に追加し、
  `public/content/<id>/index.json`・`public/manifest-<id>.webmanifest`・collections.json を用意する

## コンテンツの追加・更新

問題・解説はアプリ本体と分離されており、`public/content/<コレクション>/` に JSON を置くだけで更新できる。

1. `public/content/<コレクション>/<教科>/<セット名>.json` に問題セットを作成（スキーマは [src/types.ts](src/types.ts) を参照）
2. `public/content/<コレクション>/index.json` の該当教科・単元に `{ id, name, file }` を追加
3. push すれば反映（アプリ側のコード変更は不要）

### 問題形式

| type | 用途 | 主なフィールド |
| --- | --- | --- |
| `choice` | 選択式 | `question`, `choices[]`, `answer`（正解のインデックス）, `explanation` |
| `input` | 記述・一問一答 | `question`, `answers[]`（受理する表記のリスト）, `explanation` |
| `flashcard` | 暗記カード | `front`, `back` |
| `order` | 並べ替え | `question`, `tokens[]`（正しい順序で記述。表示時にシャッフル）, `explanation` |

注意:

- `id` はセット内で一意にする（進捗が `セットID/問題ID` で保存されるため、既存問題の `id` を変えると履歴が切れる）
- `input` の `answers` には漢字・ひらがな・別表記など想定される正解をすべて並べる（全角/半角・大文字小文字・空白は自動で吸収される）
- `order` は「別の正しい並べ方」が存在しない文にする（チャンク化 `"to play"` などで一意にできる）

### 概念ラダーとリンク（任意フィールド）

- `concept` — 同じ概念を確認する問題に共通のIDを付けると「概念ラダー」になる（易しい choice → input → 応用、の階段）。
  問題文のバリエーションは実行時生成ではなく、**作成時に変種を複数作って同じ `concept` に並べる**
- `choice` の `answers[]` — 受理表記を併記すると、同じ問題を習熟度に応じて choice（4択）/ input（自力入力）のどちらの形式でも出題できる
- `links`（`{ label, url }` の配列）— 授業で使われている動画や解説サイトへの導線。
  単元（`index.json` の Unit）を主な置き場とし、問題にも任意で持てる。**親が選定したものだけを入れる**

## マスコット Abler

`assets/original.png`（設定画シート・原画）から、アプリ内で使う各ポーズ画像
（`public/abler/*.webp`）と PWA アイコン（`public/icons/`）を生成する。
シートを差し替えたら再実行する（要 `brew install webp`）。

```sh
node scripts/abler-build.mjs                     # 本番出力
node scripts/abler-build.mjs <シート> <出力先>    # 実験用
```

切り出し座標はスクリプト内の `CROP_PROFILES` にシートのサイズごとに定義。
`scripts/gen-icons.mjs` はマスコットを使わない「A」アイコンの生成用（予備）。
