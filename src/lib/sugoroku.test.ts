import { describe, expect, it } from "vitest";
import type { Unit } from "../types";
import { emptyState, recordSetResult } from "./storage";
import { CLEAR_BEST, buildTrack, miniTrack, sugorokuMilestoneId } from "./sugoroku";

function unit(setIds: string[], lessonIds: string[] = []): Unit {
  return {
    id: "u1",
    name: "単元",
    sets: setIds.map((id) => ({
      id,
      name: `セット${id}`,
      file: `${id}.json`,
      kind: lessonIds.includes(id) ? ("lesson" as const) : undefined,
    })),
  };
}

describe("トラックの導出（受け入れ条件1）", () => {
  it("index の単元内セット順そのままで通過/クリア/未到達が出る", () => {
    const s = emptyState();
    s.setRecords["a"] = { attempts: 1, best: 90, lastScore: 90, lastAt: "" };
    s.setRecords["b"] = { attempts: 2, best: 60, lastScore: 60, lastAt: "" };
    const t = buildTrack(unit(["a", "b", "c", "d"]), s);
    expect(t.cells.map((c) => c.state)).toEqual([
      "clear",
      "passed",
      "ahead",
      "ahead",
    ]);
    expect(t.pos).toBe(2);
    expect(t.cells[2].current).toBe(true);
    expect(t.remaining).toBe(2);
    expect(CLEAR_BEST).toBe(80);
  });

  it("レッスンは完走＝クリア（採点で計らない）", () => {
    const s = emptyState();
    s.setRecords["lesson1"] = { attempts: 1, best: 50, lastScore: 50, lastAt: "" };
    const t = buildTrack(unit(["lesson1", "a"], ["lesson1"]), s);
    expect(t.cells[0].state).toBe("clear");
  });

  it("先のマスは存在だけ見せる: 次のマスは名前が見え、その先は隠れる", () => {
    const s = emptyState();
    s.setRecords["a"] = { attempts: 1, best: 90, lastScore: 90, lastAt: "" };
    const t = buildTrack(unit(["a", "b", "c"]), s);
    expect(t.cells.map((c) => c.revealed)).toEqual([true, true, false]);
  });

  it("先のマスに挑んでいても（ロックなし）踏破済みマスは見える・現在地は道順のまま", () => {
    const s = emptyState();
    s.setRecords["c"] = { attempts: 1, best: 100, lastScore: 100, lastAt: "" };
    const t = buildTrack(unit(["a", "b", "c"]), s);
    expect(t.pos).toBe(0); // 道順の現在地は最初の未到達
    expect(t.cells[2].revealed).toBe(true); // 飛ばして踏破したマスは見える
  });
});

describe("踏破の単調増加（受け入れ条件3）", () => {
  it("後からスコアが下がってもマスは戻らない", () => {
    let s = emptyState();
    s = recordSetResult(s, "a", 90); // クリア
    const before = buildTrack(unit(["a", "b"]), s).cells[0].state;
    expect(before).toBe("clear");
    s = recordSetResult(s, "a", 30); // 低スコアで再挑戦
    expect(buildTrack(unit(["a", "b"]), s).cells[0].state).toBe("clear");
  });
});

describe("トラックの自動延伸（受け入れ条件4）", () => {
  it("index.json にセットを足すだけでマスが増える", () => {
    const s = emptyState();
    expect(buildTrack(unit(["a", "b"]), s).cells).toHaveLength(2);
    expect(buildTrack(unit(["a", "b", "new"]), s).cells).toHaveLength(3);
  });
});

describe("全マスクリアとミニ版", () => {
  it("全マスクリアで allClear（祝福の対象）", () => {
    let s = emptyState();
    s = recordSetResult(s, "a", 85);
    expect(buildTrack(unit(["a", "b"]), s).allClear).toBe(false);
    s = recordSetResult(s, "b", 100);
    expect(buildTrack(unit(["a", "b"]), s).allClear).toBe(true);
    expect(sugorokuMilestoneId("math", "u1")).toBe("sugoroku:math/u1");
  });

  it("ミニ版は ●=クリア ◍=通過 ○=現在地 ？=未開示", () => {
    const s = emptyState();
    s.setRecords["a"] = { attempts: 1, best: 90, lastScore: 90, lastAt: "" };
    s.setRecords["b"] = { attempts: 1, best: 50, lastScore: 50, lastAt: "" };
    expect(miniTrack(buildTrack(unit(["a", "b", "c", "d"]), s))).toBe("●◍○？");
  });
});
