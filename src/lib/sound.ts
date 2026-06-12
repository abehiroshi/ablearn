// 効果音エンジン（計画27）。Web Audio によるコード合成。
// 設計原則: 即時性（事前ロード不要の合成）/ 短さ（操作音は100ms前後）/
// 微変動（毎回ピッチを±数%揺らす）/ 小ささ（内部ゲイン控えめ・スロットリング）。
// 正解・祝福音は CC0 素材への差し替え候補（assets/TASKS.md の T 系タスク）。
// 差し替えるときはこのファイルの該当 play* をサンプル再生に置き換える。

let ctx: AudioContext | null = null;
let muted = false;

export function setSoundMuted(m: boolean): void {
  muted = m;
}

export function isSoundMuted(): boolean {
  return muted;
}

/** 連打で音が重なって割れないための最小間隔（種類ごと） */
const lastPlayed: Record<string, number> = {};

/**
 * スロットリング判定（純関数的にテストできるよう分離）。
 * 許可したときは「鳴らした」として時刻を記録する
 */
export function shouldPlay(
  kind: string,
  nowMs: number,
  minGapMs: number
): boolean {
  const prev = lastPlayed[kind];
  if (prev !== undefined && nowMs - prev < minGapMs) return false;
  lastPlayed[kind] = nowMs;
  return true;
}

/** テスト用: スロットリング状態のリセット */
export function resetSoundThrottle(): void {
  for (const k of Object.keys(lastPlayed)) delete lastPlayed[k];
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  type AC = typeof AudioContext;
  const Ctor: AC | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  // iOS 等はユーザー操作までサスペンドされる。タップ起点で呼ばれるので resume できる
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** ±pct のピッチ揺らぎ（機械的な反復感をなくす。クセになる感触の核） */
function jitter(freq: number, pct = 0.04): number {
  return freq * (1 + (Math.random() * 2 - 1) * pct);
}

interface NoteOpts {
  /** 開始周波数 Hz */
  freq: number;
  /** 終了周波数（指定でスライド） */
  slideTo?: number;
  /** 長さ（秒） */
  dur: number;
  /** 開始時刻のオフセット（秒） */
  at?: number;
  type?: OscillatorType;
  gain?: number;
}

function note(opts: NoteOpts): void {
  const c = context();
  if (!c) return;
  const t0 = c.currentTime + (opts.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.slideTo)
    osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + opts.dur);
  // クリックノイズを避ける短いアタック → 指数減衰
  const peak = opts.gain ?? 0.12;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

/** タップ・選択・画面遷移: 極小ポップ（1日数百回鳴る主役） */
export function playTap(): void {
  if (muted || !shouldPlay("tap", Date.now(), 40)) return;
  const f = jitter(1100, 0.06);
  note({ freq: f, slideTo: f * 0.6, dur: 0.07, type: "triangle", gain: 0.07 });
}

/** 正解: 短い上昇2音。控えめ */
export function playCorrect(): void {
  if (muted || !shouldPlay("correct", Date.now(), 150)) return;
  const base = jitter(660);
  note({ freq: base, dur: 0.09, gain: 0.1 });
  note({ freq: base * 1.5, dur: 0.14, at: 0.07, gain: 0.11 });
}

/** 不正解・わからない: 柔らかい低めの音（罰の音にしない。計画24の励ましと整合） */
export function playWrong(): void {
  if (muted || !shouldPlay("wrong", Date.now(), 150)) return;
  const f = jitter(220, 0.03);
  note({ freq: f, slideTo: f * 0.82, dur: 0.16, type: "sine", gain: 0.09 });
}

/** 節目の祝福・スキン解放・ランクアップ: ここだけ少しリッチな上昇アルペジオ */
export function playFanfare(): void {
  if (muted || !shouldPlay("fanfare", Date.now(), 500)) return;
  const base = jitter(523, 0.02); // C5
  const steps = [1, 1.26, 1.5, 2]; // ドミソド
  steps.forEach((r, i) => {
    note({ freq: base * r, dur: 0.18, at: i * 0.09, type: "triangle", gain: 0.1 });
    note({ freq: base * r * 2, dur: 0.18, at: i * 0.09, gain: 0.04 });
  });
}
