// 📄 src/components/atlas/AtlasToothFocus.tsx
// =============================================================================
// CDC Manager — Atlas: o dente "sai" da arcada (v2)
// -----------------------------------------------------------------------------
// Ilustração grande e genérica do dente selecionado (forma por classe:
// incisivo/canino/pré-molar/molar; nº de raízes por posição e arcada) com
// três camadas que o médico alterna à frente do paciente:
//   👁️ Na consulta — vemos a coroa e a gengiva
//   ⬇️ E por baixo? — raízes e osso, que não se veem
//   📷 O que o RX acrescenta — canais, ponta da raiz, osso (aspeto de
//      radiografia)
// Hotspots clicáveis (coroa · nervo · raiz · osso) explicam cada zona.
// Não é anatomia exata — é um esquema para conversar.
// =============================================================================

'use client';

import { useState } from 'react';

type Layer = 'clinic' | 'below' | 'rx';
type Spot = 'coroa' | 'nervo' | 'raiz' | 'osso' | null;

const SPOT_TEXT: Record<
  Exclude<Spot, null>,
  { title: string; text: string; color: string }
> = {
  coroa: {
    title: 'Coroa',
    text: 'A parte visível do dente, coberta por esmalte. É aqui que vemos cáries, desgaste e fraturas visíveis — o que a consulta consegue observar.',
    color: '#E0A100',
  },
  nervo: {
    title: 'Nervo (polpa)',
    text: 'O interior vivo do dente: nervo e vasos. Quando inflama dá sensibilidade ou dor; quando morre, deixa de doer mas pode infetar a raiz.',
    color: '#8E44AD',
  },
  raiz: {
    title: 'Raízes',
    text: 'Ficam dentro do osso e não se veem. É aqui que procuramos fraturas, infeções na ponta e a forma dos canais.',
    color: '#B3261E',
  },
  osso: {
    title: 'Osso e ligamento',
    text: 'O osso segura o dente; o ligamento amortece a mordida. A radiografia mostra quanto osso existe e se há "sombras" de infeção.',
    color: '#2743A6',
  },
};

function classOf(
  position: number,
): 'incisor' | 'canine' | 'premolar' | 'molar' {
  if (position <= 2) return 'incisor';
  if (position === 3) return 'canine';
  if (position <= 5) return 'premolar';
  return 'molar';
}
function rootsOf(position: number, arch: 'upper' | 'lower'): number {
  if (position >= 6) return arch === 'upper' ? 3 : 2;
  if (position === 4 && arch === 'upper') return 2;
  return 1;
}

export function AtlasToothFocus({
  fdi,
  name,
  arch,
  large = false,
}: {
  fdi: string;
  name: string;
  arch: 'upper' | 'lower';
  large?: boolean;
}) {
  const position = Number(fdi[1]);
  const cls = classOf(position);
  const roots = rootsOf(position, arch);
  const [layer, setLayer] = useState<Layer>('clinic');
  const [spot, setSpot] = useState<Spot>(null);

  // Geometria: dente "de pé" com a coroa em cima (invertemos para inferior)
  const W = 220;
  const H = 300;
  const crownW =
    cls === 'molar'
      ? 120
      : cls === 'premolar'
        ? 90
        : cls === 'canine'
          ? 70
          : 64;
  const crownH = cls === 'incisor' ? 96 : cls === 'canine' ? 100 : 84;
  const cx = W / 2;
  const gumY = 120;
  const crownTop = gumY - crownH;
  const rootLen = cls === 'canine' ? 150 : 130;
  const rootPaths: string[] = [];
  const canalPaths: string[] = [];
  const spread =
    roots === 1
      ? [0]
      : roots === 2
        ? [-crownW * 0.28, crownW * 0.28]
        : [-crownW * 0.34, 0, crownW * 0.34];
  for (const off of spread) {
    const x = cx + off;
    const rw = roots === 1 ? crownW * 0.6 : crownW * 0.3;
    rootPaths.push(
      `M ${x - rw / 2} ${gumY} Q ${x - rw / 2 + 4} ${gumY + rootLen * 0.55} ${x} ${gumY + rootLen} Q ${x + rw / 2 - 4} ${gumY + rootLen * 0.55} ${x + rw / 2} ${gumY} Z`,
    );
    canalPaths.push(`M ${x} ${gumY - 10} L ${x} ${gumY + rootLen - 12}`);
  }
  const crownPath =
    cls === 'incisor'
      ? `M ${cx - crownW / 2} ${gumY} L ${cx - crownW / 2 + 6} ${crownTop + 8} Q ${cx} ${crownTop - 6} ${cx + crownW / 2 - 6} ${crownTop + 8} L ${cx + crownW / 2} ${gumY} Z`
      : cls === 'canine'
        ? `M ${cx - crownW / 2} ${gumY} L ${cx - crownW / 2 + 8} ${crownTop + 30} L ${cx} ${crownTop - 4} L ${cx + crownW / 2 - 8} ${crownTop + 30} L ${cx + crownW / 2} ${gumY} Z`
        : `M ${cx - crownW / 2} ${gumY} Q ${cx - crownW / 2 - 4} ${crownTop + 10} ${cx - crownW / 2 + 14} ${crownTop} Q ${cx} ${crownTop + 14} ${cx + crownW / 2 - 14} ${crownTop} Q ${cx + crownW / 2 + 4} ${crownTop + 10} ${cx + crownW / 2} ${gumY} Z`;
  const pulpPath = `M ${cx - crownW * 0.18} ${gumY - 6} Q ${cx} ${crownTop + crownH * 0.35} ${cx + crownW * 0.18} ${gumY - 6} Z`;
  const flip = arch === 'lower' ? `translate(0 ${H}) scale(1 -1)` : undefined;
  const rx = layer === 'rx';

  const layerBtn = (k: Layer, label: string) => (
    <button
      type='button'
      onClick={() => setLayer(k)}
      style={{
        flex: 1,
        padding: large ? '10px 12px' : '7px 10px',
        borderRadius: '10px',
        border: `1.5px solid ${layer === k ? '#2743A6' : '#D8DEEF'}`,
        backgroundColor: layer === k ? '#EEF2FF' : '#FFFFFF',
        color: '#1B2A6B',
        fontSize: large ? '14px' : '12.5px',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
  const hot = (
    k: Exclude<Spot, null>,
    x: number,
    y: number,
    visible: boolean,
  ) =>
    visible ? (
      <g
        key={k}
        onClick={e => {
          e.stopPropagation();
          setSpot(s => (s === k ? null : k));
        }}
        style={{ cursor: 'pointer' }}
        transform={
          flip
            ? `translate(${x} ${y}) scale(1 -1) translate(${-x} ${-y})`
            : undefined
        }
      >
        <circle
          cx={x}
          cy={y}
          r={11}
          fill={SPOT_TEXT[k].color}
          opacity={spot === k ? 1 : 0.85}
          stroke='#FFFFFF'
          strokeWidth={2}
        />
        <text
          x={x}
          y={y + 4}
          textAnchor='middle'
          style={{ fontSize: 11, fontWeight: 800, fill: '#FFFFFF' }}
        >
          {k[0].toUpperCase()}
        </text>
      </g>
    ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          borderRadius: '16px',
          background: rx
            ? 'radial-gradient(circle at 50% 40%, #2B2F3A 0%, #0F1218 100%)'
            : 'linear-gradient(180deg, #FFFFFF 0%, #F4F6FB 100%)',
          border: '1px solid #EEF1F8',
          padding: 12,
          transition: 'background 300ms',
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: large ? 320 : 240, display: 'block' }}
          onClick={() => setSpot(null)}
        >
          <g transform={flip}>
            {/* Osso (só nas camadas por baixo/RX) */}
            {layer !== 'clinic' && (
              <rect
                x={0}
                y={gumY + 18}
                width={W}
                height={H - gumY - 18}
                fill={rx ? '#8B8F9C' : '#EADFCB'}
                opacity={rx ? 0.55 : 1}
              />
            )}
            {/* Ligamento / sombra periapical no RX */}
            {rx &&
              rootPaths.map((_, i) => (
                <circle
                  key={i}
                  cx={cx + spread[i]}
                  cy={gumY + rootLen + 2}
                  r={16}
                  fill='#3A3F4A'
                  opacity={0.9}
                />
              ))}
            {/* Raízes */}
            {layer !== 'clinic' &&
              rootPaths.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill={rx ? '#E8E9EE' : '#F6E9D2'}
                  stroke={rx ? '#FFFFFF' : '#C9B58E'}
                  strokeWidth={1.5}
                />
              ))}
            {/* Gengiva (na consulta tapa as raízes) */}
            <rect
              x={0}
              y={gumY - 2}
              width={W}
              height={layer === 'clinic' ? H - gumY + 2 : 20}
              fill={rx ? '#6E7280' : '#F2A7A7'}
              opacity={rx ? 0.5 : 1}
            />
            {/* Coroa */}
            <path
              d={crownPath}
              fill={rx ? '#F5F6FA' : '#FFFFFF'}
              stroke={rx ? '#FFFFFF' : '#8A93AC'}
              strokeWidth={2}
            />
            {/* Polpa / canais (RX) */}
            {rx && (
              <>
                <path d={pulpPath} fill='#2B2F3A' />
                {canalPaths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    stroke='#2B2F3A'
                    strokeWidth={3}
                    strokeLinecap='round'
                  />
                ))}
              </>
            )}
            {/* Hotspots */}
            {hot('coroa', cx, crownTop + crownH * 0.45, true)}
            {hot('nervo', cx, gumY - 4, rx)}
            {hot(
              'raiz',
              cx + spread[spread.length - 1],
              gumY + rootLen * 0.6,
              layer !== 'clinic',
            )}
            {hot('osso', 26, gumY + 70, layer !== 'clinic')}
          </g>
        </svg>
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <p
            style={{
              margin: 0,
              fontSize: large ? '22px' : '17px',
              fontWeight: 800,
              color: rx ? '#FFFFFF' : '#1B2A6B',
            }}
          >
            Dente {fdi}
          </p>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: large ? '15px' : '13px',
              color: rx ? '#C7CEE0' : '#6A7186',
            }}
          >
            {name}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {layerBtn('clinic', '👁️ Na consulta')}
        {layerBtn('below', '⬇️ E por baixo?')}
        {layerBtn('rx', '📷 O que o RX acrescenta')}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: large ? '15px' : '13px',
          color: '#3D4257',
          minHeight: 40,
        }}
      >
        {layer === 'clinic'
          ? 'Na consulta vemos a coroa e a gengiva. Tudo o que está por baixo da gengiva não é visível diretamente.'
          : layer === 'below'
            ? 'As raízes ficam dentro do osso. Fraturas, infeções na ponta e a forma dos canais não se veem a olho nu.'
            : 'A radiografia revela o interior: canais, ponta das raízes e o osso à volta — onde aparecem as "sombras" de infeção.'}
      </p>
      {spot && (
        <div
          style={{
            borderLeft: `4px solid ${SPOT_TEXT[spot].color}`,
            backgroundColor: '#F8F9FD',
            borderRadius: '0 10px 10px 0',
            padding: '10px 12px',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            {SPOT_TEXT[spot].title}
          </p>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: large ? '14.5px' : '13px',
              color: '#3D4257',
            }}
          >
            {SPOT_TEXT[spot].text}
          </p>
        </div>
      )}
    </div>
  );
}
