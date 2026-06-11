// コレクション（コンテンツの世界）の判定。
// URL: /ablearn/<collection>/ 配下でアプリが動き、コンテンツと進捗が
// コレクションごとに完全に独立する。機能側の分岐は
// 「どの index.json を読むか」「どの localStorage キーに保存するか」の2点に閉じる。

export function currentCollection(): string {
  if (typeof window === "undefined") return "chugaku"; // テスト（Node）環境
  const base = import.meta.env.BASE_URL; // "/ablearn/"
  const path = window.location.pathname;
  const rest = path.startsWith(base) ? path.slice(base.length) : "";
  return rest.split("/")[0] || "chugaku";
}
