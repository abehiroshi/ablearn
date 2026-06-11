# Ablearn

中学生の定期テスト対策アプリ。PWA 対応・進捗は端末の localStorage に保存（1人用）。

- 公開 URL: https://abehiroshi.github.io/ablearn/
- 開発: `npm install` → `npm run dev`
- デプロイ: main に push すると GitHub Actions が自動で GitHub Pages に公開

## コンテンツの追加・更新

問題・解説はアプリ本体と分離されており、`public/content/` に JSON を置くだけで更新できる。

1. `public/content/<教科>/<セット名>.json` に問題セットを作成（スキーマは [src/types.ts](src/types.ts) を参照）
2. `public/content/index.json` の該当教科・単元に `{ id, name, file }` を追加
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

## マスコット Abler

`assets/image.png`（設定画シート）から、アプリ内で使う各ポーズ画像（`public/abler/`）と
PWA アイコン（`public/icons/`）を生成する。シートを差し替えたら再実行する。

```sh
node scripts/abler-build.mjs
```

切り出し座標はスクリプト内の `CROPS` で定義。`scripts/gen-icons.mjs` は
マスコットを使わないシンプルな「A」アイコンの生成用（予備）。
