// 📄 src/components/pacientes/WebcamCapture.tsx
// =============================================================================
// CDC Manager — Fotografia do paciente com a câmara do posto (28/11/2026)
// -----------------------------------------------------------------------------
// Cada computador da receção tem uma câmara móvel: a rececionista aponta,
// tira a fotografia e ela fica na ficha (Orlando, 28/11). Abre a câmara no
// browser, mostra a imagem ao vivo, tira (ou repete) e entrega um JPEG ao
// mesmo circuito de upload da fotografia. A imagem só sai do posto quando se
// carrega em "Usar esta fotografia". A câmara é desligada ao fechar.
// =============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';

const CAMERA_KEY = 'cdc-foto-camara';

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError')
    return 'O browser não tem autorização para usar a câmara. Carregue no cadeado junto ao endereço, permita a câmara e tente de novo.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'Não foi encontrada nenhuma câmara neste computador.';
  if (name === 'NotReadableError')
    return 'A câmara está a ser usada por outro programa. Feche-o e tente de novo.';
  return 'Não foi possível abrir a câmara.';
}

export function WebcamCapture({
  patientName,
  onCapture,
  onClose,
}: {
  patientName: string;
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState<string>(() => {
    try {
      return window.localStorage.getItem(CAMERA_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);

  // Liga a câmara escolhida; desliga ao trocar de câmara e ao fechar
  useEffect(() => {
    let alive = true;
    const stop = () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este browser não permite usar a câmara.');
        return;
      }
      const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
        });
      } catch (e) {
        if (!alive) return;
        // a câmara guardada já não existe neste posto: usa a que houver
        if (deviceId) return setDeviceId('');
        return setError(cameraError(e));
      }
      if (!alive) return stream.getTracks().forEach(t => t.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      if (!alive) return;
      setError(null);
      setReady(true);
      const list = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      if (!alive) return;
      setDevices(
        list
          .filter(d => d.kind === 'videoinput')
          .map((d, i) => ({ id: d.deviceId, label: d.label || `Câmara ${i + 1}` })),
      );
    })();
    return () => {
      alive = false;
      stop();
    };
  }, [deviceId]);

  const chooseCamera = (id: string) => {
    setReady(false);
    setDeviceId(id);
    try {
      window.localStorage.setItem(CAMERA_KEY, id);
    } catch {
      /* sem armazenamento: escolhe-se de novo da próxima vez */
    }
  };

  const take = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    // quadrado ao centro: a fotografia da ficha é redonda
    const side = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      v,
      (v.videoWidth - side) / 2,
      (v.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      side,
      side,
    );
    canvas.toBlob(
      blob => {
        if (blob) setShot({ url: URL.createObjectURL(blob), blob });
      },
      'image/jpeg',
      0.9,
    );
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  };

  const use = () => {
    if (!shot) return;
    const file = new File([shot.blob], 'fotografia.jpg', { type: 'image/jpeg' });
    URL.revokeObjectURL(shot.url);
    onCapture(file);
  };

  const btn = (primary: boolean, disabled = false) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: '8px',
    border: primary ? 'none' : '1px solid #D8DEEF',
    padding: '9px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: primary ? '#FFFFFF' : '#1B2A6B',
    backgroundColor: primary ? (disabled ? '#8FA0DC' : '#2743A6') : '#FFFFFF',
    cursor: disabled ? 'default' : 'pointer',
  });

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label='Tirar fotografia do paciente'
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(11,15,30,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          padding: '18px',
          width: '100%',
          maxWidth: 460,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1B2A6B' }}>
              Fotografia do paciente
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: '#6A7186' }}>{patientName}</p>
          </div>
          <button
            type='button'
            onClick={onClose}
            title='Fechar'
            style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: '#6A7186' }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1 / 1',
            borderRadius: '12px',
            overflow: 'hidden',
            backgroundColor: '#0B0F1E',
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: shot ? 'none' : 'block',
            }}
          />
          {shot && (
            // eslint-disable-next-line @next/next/no-img-element -- imagem local acabada de tirar
            <img
              src={shot.url}
              alt='Fotografia tirada'
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {!shot && !ready && !error && (
            <p
              style={{
                position: 'absolute',
                inset: 0,
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#C9D4FF',
                fontSize: '13px',
              }}
            >
              A ligar a câmara…
            </p>
          )}
        </div>

        {error && (
          <p role='alert' style={{ margin: 0, fontSize: '13px', color: '#B3261E', lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        {!shot && devices.length > 1 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '12px', color: '#6A7186' }}>Câmara</span>
            <select
              value={deviceId || devices[0]?.id}
              onChange={e => chooseCamera(e.target.value)}
              style={{
                border: '1px solid #D8DEEF',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '13px',
                color: '#1C2233',
              }}
            >
              {devices.map(d => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {shot ? (
            <>
              <button type='button' onClick={retake} style={btn(false)}>
                <RefreshCw size={15} /> Repetir
              </button>
              <button type='button' onClick={use} style={btn(true)}>
                Usar esta fotografia
              </button>
            </>
          ) : (
            <button
              type='button'
              onClick={take}
              disabled={!ready}
              style={btn(true, !ready)}
            >
              <Camera size={15} /> Tirar fotografia
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
