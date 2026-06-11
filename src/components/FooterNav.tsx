// フッタナビゲーション（計画16）。
// アイコンは assets/ablearn-icons.png の案C（ミニマル・丸形ベース）を SVG で起こしたもの。
// カラーパレットも同画像の指定: 濃紺 #2D4A7F / 青 #4A90E2 / ティール #6BC1B6 /
// ブラウン #A77C52 / クリーム #F5E6C8（選択中ピル）

interface IconProps {
  className?: string;
}

/** ホーム: 「A」＋丸メガネ（Abler の顔） */
function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.8 8.7 9.6 M12 2.8 15.3 9.6 M10 7.2 H14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="8.2" cy="15.8" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="15.8" cy="15.8" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M10.9 15.2 Q12 13.9 13.1 15.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 学習: 開いた本＋ケモ耳 */
function BookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 6.2 5.7 3 9.4 4.9 Z" fill="currentColor" />
      <path d="M17 6.2 18.3 3 14.6 4.9 Z" fill="currentColor" />
      <path
        d="M12 7.6 C10.2 6 7.3 5.7 4.8 6.4 V18 C7.3 17.3 10.2 17.6 12 19.2 C13.8 17.6 16.7 17.3 19.2 18 V6.4 C16.7 5.7 13.8 6 12 7.6 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 7.6 V19.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** テスト: 鉛筆（先端はブラウン） */
function PencilIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M4.6 19.4 5.8 15.4 16 5.2 A2.05 2.05 0 0 1 18.9 8.1 L8.7 18.3 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M5.8 15.4 8.7 18.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path className="ic-brown" d="M4.6 19.4 5.4 16.8 7.3 18.7 Z" fill="#A77C52" />
      <path
        d="M14.2 7 17.1 9.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 復習: 循環矢印（ティール）＋丸メガネ */
function ReviewIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        className="ic-teal"
        d="M5.2 8.6 A8 8 0 0 1 18.8 8.6"
        fill="none"
        stroke="#6BC1B6"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path className="ic-teal" d="M19.9 5.4 18.8 9.3 15 8.2" fill="none" stroke="#6BC1B6" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path
        className="ic-teal"
        d="M18.8 15.4 A8 8 0 0 1 5.2 15.4"
        fill="none"
        stroke="#6BC1B6"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path className="ic-teal" d="M4.1 18.6 5.2 14.7 9 15.8" fill="none" stroke="#6BC1B6" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.7" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14.3" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11.3 11.7 Q12 11 12.7 11.7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** 成績: 棒グラフ（ティール混じり）＋肉球 */
function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="3.6" y="12.4" width="3.4" height="7.2" rx="1" fill="currentColor" />
      <rect className="ic-teal-fill" x="8.8" y="8.4" width="3.4" height="11.2" rx="1" fill="#6BC1B6" />
      <rect x="14" y="4.4" width="3.4" height="15.2" rx="1" fill="currentColor" />
      <g className="ic-brown" fill="#A77C52">
        <circle cx="20.1" cy="13.4" r="0.95" />
        <circle cx="22" cy="14.5" r="0.85" />
        <circle cx="18.4" cy="14.7" r="0.85" />
        <ellipse cx="20.2" cy="16.6" rx="1.6" ry="1.35" />
      </g>
    </svg>
  );
}

export type NavId = "home" | "library" | "mock" | "review" | "stats";

const ITEMS: { id: NavId; label: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { id: "home", label: "ホーム", Icon: HomeIcon },
  { id: "library", label: "学習", Icon: BookIcon },
  { id: "mock", label: "テスト", Icon: PencilIcon },
  { id: "review", label: "復習", Icon: ReviewIcon },
  { id: "stats", label: "成績", Icon: ChartIcon },
];

interface Props {
  active: NavId;
  reviewCount: number;
  onSelect: (id: NavId) => void;
}

export default function FooterNav({ active, reviewCount, onSelect }: Props) {
  return (
    <nav className="tabbar fnav">
      {ITEMS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={active === id ? "active" : ""}
          aria-label={label}
          aria-current={active === id ? "page" : undefined}
          onClick={() => onSelect(id)}
        >
          <span className="fnav-pill">
            <Icon className="fnav-icon" />
            {id === "review" && reviewCount > 0 && (
              <span className="badge">{reviewCount}</span>
            )}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
