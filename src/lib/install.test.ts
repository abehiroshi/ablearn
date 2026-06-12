import { describe, expect, it } from "vitest";
import { installGuideFor } from "./install";

const base = { ios: false, standalone: false, dismissed: false, canPrompt: false };

describe("ホーム画面に追加の案内（計画37・受け入れ条件1）", () => {
  it("iOS のブラウザ閲覧時だけ手順案内を出す", () => {
    expect(installGuideFor({ ...base, ios: true })).toBe("ios");
  });

  it("デスクトップ等では何も出さない（受け入れ条件3）", () => {
    expect(installGuideFor(base)).toBeNull();
  });

  it("ホーム画面起動済み（standalone）では出さない（受け入れ条件2）", () => {
    expect(installGuideFor({ ...base, ios: true, standalone: true })).toBeNull();
    expect(
      installGuideFor({ ...base, canPrompt: true, standalone: true })
    ).toBeNull();
  });

  it("一度閉じたら出さない（受け入れ条件2）", () => {
    expect(installGuideFor({ ...base, ios: true, dismissed: true })).toBeNull();
    expect(
      installGuideFor({ ...base, canPrompt: true, dismissed: true })
    ).toBeNull();
  });

  it("本物の install prompt が使えるならそれを優先（Android Chrome）", () => {
    expect(installGuideFor({ ...base, canPrompt: true })).toBe("android");
    // 理屈上は同時に立たないが、優先順位を固定しておく
    expect(installGuideFor({ ...base, ios: true, canPrompt: true })).toBe(
      "android"
    );
  });
});
