// ホーム画面に追加の案内（計画37）。
// iOS Safari には自動インストールプロンプトが無いため手順の案内を出す。
// Android Chrome は beforeinstallprompt を捕まえて本物のインストールボタンを出す。
// 案内は一度閉じたら出さない（Stats の常設導線が残る）。

export type InstallGuide = "ios" | "android" | null;

/** Chromium 系の beforeinstallprompt（標準型定義に無いため最小限を定義） */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/**
 * どの案内を出すか（純粋な判定。環境は引数で受ける）。
 * ホーム画面起動済み・閉じた後は出さない。本物のプロンプトが使えるならそれを優先
 */
export function installGuideFor(env: {
  ios: boolean;
  standalone: boolean;
  dismissed: boolean;
  /** beforeinstallprompt を捕まえた（Android Chrome 等） */
  canPrompt: boolean;
}): InstallGuide {
  if (env.standalone || env.dismissed) return null;
  if (env.canPrompt) return "android";
  return env.ios ? "ios" : null;
}

/** iOS（iPhone/iPad）か。iPadOS 13+ は Mac を名乗るため maxTouchPoints で判別 */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/**
 * Android か。デスクトップ Chrome も beforeinstallprompt を発火させるため、
 * 「デスクトップでは何も変えない」の受け入れ条件を守るのに使う
 */
export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/.test(navigator.userAgent);
}

/** ホーム画面から起動しているか */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

// 案内を閉じた記録はコレクション非依存（端末に1回案内すれば足りる）
const DISMISS_KEY = "ablearn:install-guide-dismissed";

export function isInstallGuideDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return true; // localStorage が使えない環境では出さない
  }
}

export function dismissInstallGuide(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // 保存できなくても害はない（次回また出るだけ）
  }
}
