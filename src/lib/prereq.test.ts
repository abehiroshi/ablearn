import { describe, expect, it } from "vitest";
import type { ConceptMeta } from "../types";
import { buildConceptMap, pickPrereq } from "./prereq";

const CONCEPTS: ConceptMeta[] = [
  { id: "math1-houteishiki", name: "中1: 1次方程式" }, // コレクション外（set なし）
  { id: "shiki-doruiko", name: "同類項をまとめる", set: "math-shiki-keisan" },
  {
    id: "math-shiki-touhen",
    name: "等式の変形",
    set: "math-shiki-touhen",
    prerequisites: ["math1-houteishiki", "shiki-doruiko"],
  },
];

const map = buildConceptMap(CONCEPTS);
const allSetsExist = { currentSetId: "math-shiki-touhen", setExists: () => true };

describe("pickPrereq: 前提概念への遡り（計画26）", () => {
  it("習熟の低い（未練習の）コレクション内前提を返す（受け入れ条件1）", () => {
    const p = pickPrereq("math-shiki-touhen", map, {}, allSetsExist);
    expect(p?.id).toBe("shiki-doruiko");
  });

  it("習熟が低い = level 1 未満。写経段・choice段の前提は誘導対象", () => {
    for (const level of [-1, 0]) {
      const p = pickPrereq(
        "math-shiki-touhen",
        map,
        { "shiki-doruiko": { level } },
        allSetsExist
      );
      expect(p?.id).toBe("shiki-doruiko");
    }
  });

  it("前提が自力（level 1）以上なら誘導しない（従来のレッスン誘導に任せる）", () => {
    const p = pickPrereq(
      "math-shiki-touhen",
      map,
      { "shiki-doruiko": { level: 1 } },
      allSetsExist
    );
    expect(p).toBeNull();
  });

  it("コレクション外（set なし）の前提は誘導に使わない（受け入れ条件2）", () => {
    // 先頭の前提 math1-houteishiki は set なし → スキップして次の前提を選ぶ
    const p = pickPrereq("math-shiki-touhen", map, {}, allSetsExist);
    expect(p?.id).not.toBe("math1-houteishiki");
  });

  it("前提のセットが現在のセット自身なら誘導しない", () => {
    const p = pickPrereq("math-shiki-touhen", map, {}, {
      currentSetId: "math-shiki-keisan",
      setExists: () => true,
    });
    expect(p).toBeNull();
  });

  it("前提のセットがコンテンツから消えていたら誘導しない", () => {
    const p = pickPrereq("math-shiki-touhen", map, {}, {
      currentSetId: "math-shiki-touhen",
      setExists: () => false,
    });
    expect(p).toBeNull();
  });

  it("宣言の無い概念・前提を持たない概念は null", () => {
    expect(pickPrereq("unknown", map, {}, allSetsExist)).toBeNull();
    expect(pickPrereq("shiki-doruiko", map, {}, allSetsExist)).toBeNull();
  });
});
