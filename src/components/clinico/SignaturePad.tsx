// 📄 src/components/clinico/SignaturePad.tsx
// =============================================================================
// CDC Manager — Assinatura no ecrã (consentimentos)
// -----------------------------------------------------------------------------
// Canvas de assinatura para o paciente assinar no ecrã do gabinete (rato,
// caneta ou dedo — pointer events cobrem tudo). Exporta PNG via
// onChange(dataUrl) a cada traço; null quando limpo. Escala por
// devicePixelRatio para a assinatura não sair serrilhada em ecrãs retina.
// Sem dependências — canvas nativo.
// =============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';

export function SignaturePad({
  onChange,
  height = 160,
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Dimensionar o bitmap ao tamanho real × DPR (uma vez, no mount)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1B2A6B';
    }
  }, [height]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    // Exportar a cada traço concluído — o pai tem sempre a versão atual
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL('image/png'));
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasInk(false);
    onChange(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          display: 'block',
          width: '100%',
          height: `${height}px`,
          border: '1px dashed #C4CBE0',
          borderRadius: '10px',
          backgroundColor: '#FFFFFF',
          touchAction: 'none', // essencial: sem scroll enquanto assina no touch
          cursor: 'crosshair',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '12px', color: '#9AA1B4' }}>
          {hasInk
            ? 'Assinatura registada'
            : 'O paciente assina aqui (dedo, caneta ou rato)'}
        </span>
        <button
          type='button'
          onClick={clear}
          style={{
            border: 'none',
            backgroundColor: 'transparent',
            color: '#2743A6',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          Limpar
        </button>
      </div>
    </div>
  );
}
