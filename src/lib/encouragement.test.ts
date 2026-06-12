import { describe, expect, it } from "vitest";
import { ENCOURAGEMENTS, pickEncouragement } from "./encouragement";

// 素材ゼロの方針（計画24）: 既存ポーズしか使わない
const EXISTING_POSES = ["ganbare", "uun", "kangaechu"];

describe("encouragement（計画24）", () => {
  it("文言は複数パターンあり、すべて空でない", () => {
    expect(ENCOURAGEMENTS.length).toBeGreaterThanOrEqual(3);
    for (const e of ENCOURAGEMENTS) {
      expect(e.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("ポーズは既存の励まし系ポーズのみ", () => {
    for (const e of ENCOURAGEMENTS) {
      expect(EXISTING_POSES).toContain(e.pose);
    }
  });

  it("pickEncouragement は乱数値に応じてプール内の要素を返す", () => {
    expect(pickEncouragement(() => 0)).toBe(ENCOURAGEMENTS[0]);
    expect(pickEncouragement(() => 0.999)).toBe(
      ENCOURAGEMENTS[ENCOURAGEMENTS.length - 1]
    );
    // rand が 1 を返す実装ミスがあっても範囲外にならない
    expect(pickEncouragement(() => 1)).toBe(
      ENCOURAGEMENTS[ENCOURAGEMENTS.length - 1]
    );
  });
});
