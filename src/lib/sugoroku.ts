// 単元すごろくマップ（計画33）
// 単元の全体量と現在地を「一本道のマス目」で見せる。1マス = 1セット、
// マス列は index.json の単元内セット配列の順そのまま（新しいデータ構造は持たない。
// セットが増えるとトラックが自動で伸びる）。
// 踏破は単調増加（best/attempts しか見ない＝後からスコアが下がってもマスは戻らない）。
// ロックはしない: 道順は推奨であって、どのマスもタップで挑める。

import type { SetMeta, Unit } from "../types";
import type { AppState, SetRecord } from "./storage";

/** クリアの目安（計画18の達成度の流用: ベストスコア80%以上） */
export const CLEAR_BEST = 80;

export type CellState = "clear" | "passed" | "ahead";

export interface SugorokuCell {
  meta: SetMeta;
  /** clear=達成条件を満たした / passed=1回完走 / ahead=未到達 */
  state: CellState;
  /** 名前を見せるか。踏破済みと次のマスだけ名前を出し、その先は「？」 */
  revealed: boolean;
  /** 現在地（Abler が立つ・デフォルトフォーカスで光らせる次のマス） */
  current: boolean;
}

export interface SugorokuTrack {
  cells: SugorokuCell[];
  /** 現在地のマス index。全マス踏破済みなら -1（ゴール） */
  pos: number;
  /** 全マスクリア（祝福の対象） */
  allClear: boolean;
  /** 残りマス数（未到達の数。「あと何マス」表示用） */
  remaining: number;
}

/**
 * マスの状態。レッスンは完走＝クリア（採点で計る対象ではない）。
 * 演習は1回完走で通過、ベスト80%以上でクリア
 */
export function cellState(
  meta: SetMeta,
  rec: SetRecord | undefined
): CellState {
  if (!rec) return "ahead";
  if (meta.kind === "lesson") return "clear";
  return rec.best >= CLEAR_BEST ? "clear" : "passed";
}

/** 単元のトラックを導出する */
export function buildTrack(unit: Unit, state: AppState): SugorokuTrack {
  const states = unit.sets.map((meta) =>
    cellState(meta, state.setRecords[meta.id])
  );
  // 現在地 = 道順で最初の未到達マス（先のマスに挑んでいても道順の現在地は変えない）
  const pos = states.findIndex((s) => s === "ahead");
  const cells: SugorokuCell[] = unit.sets.map((meta, i) => ({
    meta,
    state: states[i],
    // 踏破済み（通過/クリア）と次のマスは見える。その先は存在だけ見せる
    revealed: states[i] !== "ahead" || i === pos,
    current: i === pos,
  }));
  return {
    cells,
    pos,
    allClear: cells.length > 0 && states.every((s) => s === "clear"),
    remaining: states.filter((s) => s === "ahead").length,
  };
}

/** ホームのミニ版（●=クリア ◍=通過 ○=現在地 ？=未開示） */
export function miniTrack(track: SugorokuTrack): string {
  return track.cells
    .map((c) =>
      c.state === "clear"
        ? "●"
        : c.state === "passed"
          ? "◍"
          : c.current
            ? "○"
            : "？"
    )
    .join("");
}

/** 全マスクリアの祝福ID（計画18の体系に相乗り。celebrated に記録する） */
export function sugorokuMilestoneId(subjectId: string, unitId: string): string {
  return `sugoroku:${subjectId}/${unitId}`;
}
