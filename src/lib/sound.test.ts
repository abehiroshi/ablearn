import { beforeEach, describe, expect, it } from "vitest";
import {
  isSoundMuted,
  playCorrect,
  playFanfare,
  playTap,
  playWrong,
  resetSoundThrottle,
  setSoundMuted,
  shouldPlay,
} from "./sound";

beforeEach(() => {
  resetSoundThrottle();
  setSoundMuted(false);
});

describe("効果音（計画27）", () => {
  it("スロットリング: 最小間隔内の連打は鳴らさない（音割れ防止・受け入れ条件2）", () => {
    expect(shouldPlay("tap", 1000, 40)).toBe(true);
    expect(shouldPlay("tap", 1020, 40)).toBe(false); // 20ms後 → 抑止
    expect(shouldPlay("tap", 1041, 40)).toBe(true); // 41ms後 → 鳴る
  });

  it("スロットリングは種類ごとに独立（タップが正解音を抑止しない）", () => {
    expect(shouldPlay("tap", 1000, 40)).toBe(true);
    expect(shouldPlay("correct", 1000, 150)).toBe(true);
  });

  it("抑止された再生は「鳴らした時刻」を更新しない（連打し続けても定期的に鳴る）", () => {
    expect(shouldPlay("tap", 1000, 40)).toBe(true);
    expect(shouldPlay("tap", 1030, 40)).toBe(false);
    // 最初の再生から40ms経過していれば、直前の抑止とは無関係に鳴る
    expect(shouldPlay("tap", 1045, 40)).toBe(true);
  });

  it("ミュートの設定と参照（永続化は AppState.muted 側が担う）", () => {
    expect(isSoundMuted()).toBe(false);
    setSoundMuted(true);
    expect(isSoundMuted()).toBe(true);
  });

  it("AudioContext が無い環境（テスト環境）でも play* が例外を出さない", () => {
    // jsdom/node には AudioContext が無い。実機以外で呼ばれても安全に何もしないこと
    expect(() => {
      playTap();
      playCorrect();
      playWrong();
      playFanfare();
    }).not.toThrow();
  });
});
