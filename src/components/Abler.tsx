// マスコット Abler。画像は scripts/abler-build.mjs が
// assets/image.png（設定画シート）から public/abler/ に生成する。

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

interface Props {
  pose: AblerPose;
  size: number;
}

export default function Abler({ pose, size }: Props) {
  return (
    <img
      className="abler"
      src={`${import.meta.env.BASE_URL}abler/${pose}.webp`}
      alt=""
      style={{ height: size }}
      draggable={false}
    />
  );
}
