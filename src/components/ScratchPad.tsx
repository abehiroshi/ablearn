import { useEffect, useRef, useState } from "react";

interface Props {
  /** 変わったら描画内容をクリアする（問題の切り替え） */
  resetKey: string;
  /** オーバーレイ表示のときだけ渡す（とじるボタンを出す） */
  onClose?: () => void;
}

type Tool = "pen" | "eraser";

const PEN_WIDTH = 2.5;
const ERASER_WIDTH = 28;
const INK = "#1c1c1e";

export default function ScratchPad({ resetKey, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const toolRef = useRef<Tool>(tool);
  toolRef.current = tool;
  // 一度でもペン（スタイラス）を検出したら、以後タッチでは描かない（パームリジェクション）
  const penSeen = useRef(false);
  const activePointer = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    // desynchronized: スタイラスの描画遅延を減らす（非対応ブラウザでは無視される）
    const ctx = canvas.getContext("2d", { desynchronized: true })!;
    ctxRef.current = ctx;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // 非表示中はサイズを壊さない
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  function clearAll() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  useEffect(() => {
    clearAll();
    activePointer.current = null; // ストローク中に問題が変わった場合の取り残し防止
  }, [resetKey]);

  function pos(e: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function applyTool(ctx: CanvasRenderingContext2D) {
    if (toolRef.current === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = ERASER_WIDTH;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = INK;
      ctx.lineWidth = PEN_WIDTH;
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "pen") penSeen.current = true;
    if (e.pointerType === "touch" && penSeen.current) return;
    if (activePointer.current !== null) return; // 2本目以降（手のひら等）は無視
    activePointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ポインタが既に無効でも描画は続ける
    }
    const ctx = ctxRef.current!;
    applyTool(ctx);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // 点も打てるように極小の線を引く
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== e.pointerId) return;
    const ctx = ctxRef.current!;
    const native = e.nativeEvent;
    const coalesced =
      typeof native.getCoalescedEvents === "function"
        ? native.getCoalescedEvents()
        : [];
    // 空配列を返す実装があるためフォールバック
    const events = coalesced.length > 0 ? coalesced : [native];
    for (const ev of events) {
      const p = pos(ev);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  function onPointerEnd(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
  }

  return (
    <div className="scratch-pad">
      <div className="scratch-toolbar">
        <button
          className={`scratch-tool ${tool === "pen" ? "active" : ""}`}
          onClick={() => setTool("pen")}
        >
          ✏️ ペン
        </button>
        <button
          className={`scratch-tool ${tool === "eraser" ? "active" : ""}`}
          onClick={() => setTool("eraser")}
        >
          ⬜ 消しゴム
        </button>
        <button className="scratch-tool" onClick={clearAll}>
          🗑 全消し
        </button>
        <span className="spacer" />
        {onClose && (
          <button className="scratch-tool scratch-close" onClick={onClose}>
            ✕ とじる
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="scratch-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />
    </div>
  );
}
