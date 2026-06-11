// 解答判定・シャッフルなどクイズ進行のユーティリティ

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 入力式の解答を正規化して比較する。
 * 全角/半角、大文字/小文字、空白、句読点の揺れを吸収する。
 */
export function normalizeAnswer(s: string): string {
  return s
    .trim()
    // 全角英数字・記号 → 半角
    .replace(/[！-～]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/　/g, " ")
    .toLowerCase()
    // 空白除去・カンマ/読点の統一
    .replace(/\s+/g, "")
    .replace(/[、，]/g, ",")
    .replace(/[。．]/g, ".");
}

export function checkInputAnswer(input: string, answers: string[]): boolean {
  const n = normalizeAnswer(input);
  if (!n) return false;
  return answers.some((a) => normalizeAnswer(a) === n);
}

/** 並べ替え問題: 選択した順序が正解と一致するか */
export function checkOrder(selected: string[], correct: string[]): boolean {
  if (selected.length !== correct.length) return false;
  return selected.every((t, i) => t === correct[i]);
}

// XP 設計: 1発正解 +10 / セッション内リトライで正解 +5 / フラッシュカード「覚えた」 +5
export const XP_FIRST_CORRECT = 10;
export const XP_RETRY_CORRECT = 5;
export const XP_FLASHCARD = 5;
