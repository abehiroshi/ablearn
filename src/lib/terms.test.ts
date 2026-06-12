import { describe, expect, it } from "vitest";
import type { ContentIndex } from "../types";
import {
  addTermRange,
  removeTermRange,
  termAllChecked,
  termRange,
} from "./terms";

const index: ContentIndex = {
  subjects: [
    {
      id: "math",
      name: "数学",
      color: "#000",
      icon: "📐",
      units: [
        {
          id: "shiki",
          name: "式の計算",
          terms: ["1学期中間"],
          sets: [
            { id: "m1", name: "a", file: "a.json" },
            { id: "m2", name: "b", file: "b.json" },
          ],
        },
        {
          id: "renritsu",
          name: "連立方程式",
          terms: ["1学期期末"],
          sets: [{ id: "m3", name: "c", file: "c.json" }],
        },
      ],
    },
    {
      id: "science",
      name: "理科",
      color: "#111",
      icon: "🧪",
      units: [
        {
          // 学期をまたぐ単元は複数の terms を持てる
          id: "kagaku",
          name: "化学変化",
          terms: ["1学期中間", "1学期期末"],
          sets: [{ id: "s1", name: "d", file: "d.json" }],
        },
      ],
    },
    {
      id: "english",
      name: "英語",
      color: "#222",
      icon: "🔤",
      units: [
        {
          // タグの無い常設系（英単語）はどのプリセットにも入らない
          id: "words",
          name: "英単語",
          sets: [{ id: "e1", name: "w", file: "w.json" }],
        },
      ],
    },
  ],
};

describe("プリセット範囲の導出（受け入れ条件1・3）", () => {
  it("term を持つ単元の全セットが教科ごとにまとまる", () => {
    expect(termRange(index, "1学期中間")).toEqual({
      math: ["m1", "m2"],
      science: ["s1"],
    });
  });

  it("学期をまたぐ単元は両方のテスト範囲に入る", () => {
    expect(termRange(index, "1学期期末")).toEqual({
      math: ["m3"],
      science: ["s1"],
    });
  });

  it("タグの無い単元はどの範囲にも入らない", () => {
    for (const term of ["1学期中間", "1学期期末"] as const) {
      expect(termRange(index, term).english).toBeUndefined();
    }
    expect(termRange(index, "学年末")).toEqual({});
  });
});

describe("一括チェックとトグル（受け入れ条件1・2）", () => {
  const preset = termRange(index, "1学期中間");

  it("追加は union（既存の個別チェックを保持）", () => {
    const range = addTermRange({ english: ["e1"], math: ["m1"] }, preset);
    expect(range.math.sort()).toEqual(["m1", "m2"]);
    expect(range.science).toEqual(["s1"]);
    expect(range.english).toEqual(["e1"]); // 個別チェックは残る
  });

  it("全部入りなら termAllChecked が真 → 解除で範囲外のチェックは残る", () => {
    let range = addTermRange({ english: ["e1"] }, preset);
    expect(termAllChecked(range, preset)).toBe(true);
    range = removeTermRange(range, preset);
    expect(range.math).toEqual([]);
    expect(range.science).toEqual([]);
    expect(range.english).toEqual(["e1"]);
  });

  it("一部を個別に外すと termAllChecked が偽（追加し直しができる）", () => {
    const range = addTermRange({}, preset);
    range.math = range.math.filter((id) => id !== "m2");
    expect(termAllChecked(range, preset)).toBe(false);
  });

  it("空のプリセットは常に偽（ボタン自体を出さない判定に使う）", () => {
    expect(termAllChecked({ math: ["m1"] }, {})).toBe(false);
  });
});
