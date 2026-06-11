// マスコット Abler。画像は scripts/abler-build.mjs が
// assets/original.png（設定画シート）から public/abler/ に生成する。
// スキン（計画19）: SkinContext のスキンのディレクトリから読み、
// 画像が無い（シート未納品の）スキンはメインのポーズで代用する。

import { createContext, useContext } from "react";
import { skinById } from "../lib/skins";

export type AblerPose =
  | "main"
  | "benkyou"
  | "kangaechu"
  | "dekita"
  | "mukatteru"
  | "nikkori"
  | "uun"
  | "odoroki"
  | "hirameita"
  | "iine"
  | "kuyashii"
  | "fukushu"
  | "ganbare";

/** 選択中のスキンID。App が state.selectedSkin を流し込む */
export const SkinContext = createContext("main");

interface Props {
  pose: AblerPose;
  size: number;
  /** 指定したらそのスキンで描く（きせかえUIのプレビュー用） */
  skinId?: string;
}

export default function Abler({ pose, size, skinId }: Props) {
  const contextSkin = useContext(SkinContext);
  const skin = skinById(skinId ?? contextSkin);
  const base = import.meta.env.BASE_URL;
  const fallback = `${base}abler/${pose}.webp`;
  return (
    <img
      className="abler"
      src={`${base}abler/${skin.dir}${pose}.webp`}
      alt=""
      style={{ height: size }}
      draggable={false}
      onError={(e) => {
        // スキンのシートが未納品でも壊さない（メインで代用）
        if (e.currentTarget.src !== new URL(fallback, location.href).href) {
          e.currentTarget.src = fallback;
        }
      }}
    />
  );
}
