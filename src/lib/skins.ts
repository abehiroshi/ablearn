// マスコットスキン（着せ替え）の定義（計画19）。
// 解放は節目システム（計画18）の達成→解放の直接対応（ショップ・XP消費にはしない）。
// 解放状態は celebrated（祝福済み節目）から導出するため専用の保存は不要。
// シートの制作は T系タスク（assets/TASKS.md）。納品されたら
//   node scripts/abler-build.mjs assets/skins/<id>.png public/abler/skins/<id>
// で切り出す（既定外の出力先では PWA アイコンは生成されない）。
// 画像が無い間はメインのポーズで代用される（Abler.tsx のフォールバック）。

import type { AppState } from "./storage";

export interface Skin {
  id: string;
  name: string;
  /** public/abler/ からの相対ディレクトリ（"" = メインの既存パス） */
  dir: string;
  /** 解放条件となる節目ID（null = 最初から解放） */
  unlockMilestone: string | null;
  /** 未解放時に見せる条件の文 */
  unlockLabel: string;
}

export const SKINS: Skin[] = [
  {
    id: "main",
    name: "アブラー",
    dir: "",
    unlockMilestone: null,
    unlockLabel: "最初から",
  },
  // 第1弾（シートは T-001 で制作中）。絵の納品前でも条件と枠は見える
  {
    id: "skin1",
    name: "ひみつの着せ替え",
    dir: "skins/skin1/",
    unlockMilestone: "streak:30",
    unlockLabel: "30日連続で学習する",
  },
];

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

export function isUnlocked(skin: Skin, state: AppState): boolean {
  return (
    skin.unlockMilestone === null ||
    state.celebrated.includes(skin.unlockMilestone)
  );
}

/** この節目で解放されるスキン（解放の祝福表示用） */
export function skinUnlockedBy(milestoneId: string): Skin | undefined {
  return SKINS.find((s) => s.unlockMilestone === milestoneId);
}
