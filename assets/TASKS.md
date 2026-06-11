# 外部制作タスク

アプリ実装とは別系で用意する制作物（画像・選定リンクなど）の依頼一覧。
制作側はこのファイルだけを見て作業できる状態を保つ。

## 運用ルール

- 1タスク = 1セクション。新しいタスクは末尾にテンプレートをコピーして追加する
- ID は `T-001` から連番。欠番を再利用しない
- 状態は3段階: **依頼中**（制作待ち）→ **納品済み**（納品先パスにコミット済み・取り込み待ち）→ **取込済み**（アプリに反映済み）
- 制作側: 仕様に従って作成し、納品先パスにコミットしたら状態を「納品済み」に更新する。判断に迷ったらメモ欄に質問を書いて止める
- アプリ側: 「納品済み」を取込手順に従って反映し、状態を「取込済み」に更新する
- 将来の分まで先回りで依頼を積まない。必要になったタイミングで同じルールで追加する

## テンプレート

```
## T-0XX: タイトル

- 状態: 依頼中
- 内容: 何を作るか1〜2行
- 仕様: サイズ・形式・構成など、制作に必要な条件
- 参照: 参考にする既存ファイルや資料
- 納品先: コミットするパス
- 取込手順: 納品後にアプリ側が行うこと
- メモ:
```

---

## T-001: Abler スキン第1弾の設定画シート

- 状態: 依頼中
- 内容: マスコット Abler の着せ替えスキン1着分の設定画シート（[計画19](../docs/plans/19-skin-rewards.md) の最初の解放スキン）
- 仕様: 既存シートと同じポーズ構成・同じ配置で1枚に収める（切り出しは既存パイプラインを使うため配置がずれると使えない）。衣装・色違いなどテーマは制作側の提案でよい
- 参照: `assets/original.png`（現行シート）、`public/abler/` の13ポーズ（main, benkyou, dekita, fukushu, ganbare, hirameita, iine, kangaechu, kuyashii, mukatteru, nikkori, odoroki, uun）
- 納品先: `assets/skins/<スキン名>.png`
- 取込手順: `scripts/abler-build.mjs` の複数シート対応（計画19）後に切り出して `public/abler/skins/` に生成
- メモ: 計画19の実装より先に納品されてもよい（受け入れ口は19で作る）

## T-002: 理科単元別のぽにょん動画URL選定

- 状態: 納品済み（化学変化の単元のみ取込済み・残りは該当単元の作成時に取込）
- 内容: 理科の各単元に紐付ける「ぽにょん」（https://www.youtube.com/@ponyoani ）の該当動画URLの選定
- 仕様: 動画一覧から単元との対応をマッピング（2026-06-12 チャンネル全動画から突き合わせ済み）
- 参照: `public/content/index.json` の理科の単元一覧
- 納品先: このメモ欄の一覧
- 取込手順: 各単元の作成時（計画20/21）に `links` へ反映する
- メモ: ぽにょんの番号体系は c=化学（1学期）/ b=生物 / e=天気 / p=電気。中2向けの対応は以下
  - **化学変化と原子・分子（取込済み）**: c1〜c12 → index.json に反映済み
  - **生物のからだのつくりとはたらき（2学期・計画20で作成予定の単元）**:
    b01 細胞と組織 https://youtu.be/NHxNRpMbfwo ／ b2 細胞のつくり・細胞呼吸 https://youtu.be/WfrCFQde3ws ／
    b03 光合成 https://youtu.be/ZiKXqfdq3xc ／ b04 維管束 https://youtu.be/kuAogZZE52U ／
    b05 気孔と蒸散 https://youtu.be/juDCCxzZ3Ek ／ b06 だ液と消化 https://youtu.be/k0RaKgzukO0 ／
    b07 消化酵素と吸収 https://youtu.be/0tJirPg33L0 ／ b08 肺呼吸と排出 https://youtu.be/jKRdfUK_Mmw ／
    b09 血液と循環 https://youtu.be/-nJZyUayUo4 ／ b10 感覚器官 https://youtu.be/Aj9H0DR6_2o ／
    b11 刺激と反応・神経 https://youtu.be/A1a1Cbhvv7g
  - **天気とその変化（2学期後半〜・計画20/21）**:
    e01 大気圧 https://youtu.be/VvAtPl915_s ／ e02 気象観測と天気図 https://youtu.be/CSsPJHJcVXk ／
    e03 霧と雲のでき方 https://youtu.be/yC-A00sx3FE ／ 湿度の計算復習 https://youtu.be/jBPQRXP22sI
  - **電流とその利用（3学期・計画21）**:
    p01 回路図 https://youtu.be/RUiDDygFKPA ／ p02 電流と電流計 https://youtu.be/mQT5RbenIAA ／
    p03 電圧と電圧計 https://youtu.be/LyOXq0W___w ／ p04 オームの法則と抵抗 https://youtu.be/j_xBmZDttA8 ／
    p05 オームの法則の計算・合成抵抗 https://youtu.be/dEmwqllx3nA ／ p06 電力と発熱 https://youtu.be/gerJm_n3bIU ／
    p07 静電気 https://youtu.be/Q3NDjEhjlbM ／ p08 磁界 https://youtu.be/7sfHnp0diWo ／
    p09 電流が磁界から受ける力 https://youtu.be/okBt9HPnZDY ／ p10 電磁誘導 https://youtu.be/-kgLoGhfxVs ／
    回路図問題の演習 https://youtu.be/_EOrSXC-kvs
