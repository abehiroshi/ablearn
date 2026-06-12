// つまずき時の励まし（計画24）。
// 誤答のたびには出さず、つまずき検知（quiz.ts の isStruggling）に達した
// 最初の1回だけ、誘導（計画13）の前段として表示する。
// トーンの規約: 責めない・次の一歩を示す。既存の Abler ポーズのみ使う（素材ゼロ）。

import type { AblerPose } from "../components/Abler";

export interface Encouragement {
  pose: AblerPose;
  text: string;
}

export const ENCOURAGEMENTS: Encouragement[] = [
  { pose: "ganbare", text: "むずかしいよね。ここはみんなつまずくところだよ" },
  { pose: "uun", text: "ここ、まちがえやすいんだ。きみだけじゃないよ" },
  { pose: "kangaechu", text: "あせらなくてだいじょうぶ。いっしょに整理しよう" },
  { pose: "ganbare", text: "まちがいは、おぼえるチャンス！もう一歩だよ" },
  { pose: "kangaechu", text: "むずかしいときは、きほんにもどるのが近道だよ" },
];

/** 文言プールからランダムに1つ選ぶ（rand はテスト用に差し替え可能） */
export function pickEncouragement(rand: () => number = Math.random): Encouragement {
  const i = Math.min(
    ENCOURAGEMENTS.length - 1,
    Math.floor(rand() * ENCOURAGEMENTS.length)
  );
  return ENCOURAGEMENTS[i];
}
