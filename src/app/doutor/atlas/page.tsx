// 📄 src/app/doutor/atlas/page.tsx
// =============================================================================
// CDC Manager — Atlas Dentário (ferramenta de "cadeira")
// -----------------------------------------------------------------------------
// Página educativa interativa que o médico abre À FRENTE DO PACIENTE na
// triagem: seleciona o dente da queixa na arcada, escolhe o sintoma, e o
// ecrã mostra em linguagem simples as causas possíveis, a anatomia do
// dente (raízes/canais) e o que a radiografia revela que o olho não vê —
// consentimento informado visual para o pedido de RX/panorâmica.
//
// Decisões:
//   · SEM dados de paciente — conteúdo genérico e educativo; nada aqui
//     entra no registo clínico (o diagnóstico faz-se na consulta)
//   · Reutiliza a OdontogramaArcada (mesma geometria do odontograma) com
//     todos os dentes "present" — fonte única do desenho das arcadas
//   · Tipografia maior do que o resto do admin: é para ler a dois, no ecrã
// =============================================================================

'use client';

import { useMemo, useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { OdontogramaArcada } from '@/components/clinico/OdontogramaArcada';
import type { ToothEntry } from '@/components/clinico/ToothDetail';
import { UPPER_TEETH, LOWER_TEETH } from '@/lib/domain';
import {
  TOOTH_ANATOMY,
  SYMPTOMS,
  SINUS_CAUSE,
  RX_REVEALS,
  RX_TYPES,
  SIGNAL_META,
  type Cause,
} from '@/lib/data/atlas';

const QUADRANT_SIDE: Record<string, string> = {
  '1': 'superior direito',
  '2': 'superior esquerdo',
  '3': 'inferior esquerdo',
  '4': 'inferior direito',
};

export default function AtlasPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [symptomId, setSymptomId] = useState<string | null>(null);

  // Arcada neutra: todos os dentes presentes, sem estados clínicos
  const entries = useMemo<ToothEntry[]>(
    () =>
      [...UPPER_TEETH, ...LOWER_TEETH].map(n => ({
        number: n,
        status: 'present' as const,
        faces: [],
        note: null,
      })),
    [],
  );

  const position = selected ? Number(selected[1]) : null;
  const arch: 'upper' | 'lower' | null = selected
    ? selected[0] === '1' || selected[0] === '2'
      ? 'upper'
      : 'lower'
    : null;
  const anatomy = position ? TOOTH_ANATOMY[position] : null;
  const symptom = SYMPTOMS.find(s => s.id === symptomId) ?? null;

  // Causas aplicáveis ao dente selecionado (posição + arcada), com a dor
  // referida do seio acrescentada nos molares superiores
  const causes = useMemo<Cause[]>(() => {
    if (!symptom || !position || !arch) return [];
    const base = symptom.causes.filter(
      c =>
        (!c.positions || c.positions.includes(position)) &&
        (!c.arch || c.arch === arch),
    );
    const withSinus =
      arch === 'upper' &&
      SINUS_CAUSE.positions?.includes(position) &&
      (symptom.id === 'dor-prolongada' || symptom.id === 'mastigar')
        ? [...base, SINUS_CAUSE]
        : base;
    return withSinus;
  }, [symptom, position, arch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Cabeçalho */}
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: '#1B2A6B',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ScanSearch size={22} />
          Atlas Dentário
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6A7186' }}>
          Ferramenta de explicação em cadeira — selecione o dente da queixa e o
          sintoma, e mostre ao paciente as causas possíveis e o que a
          radiografia revela.
        </p>
      </div>

      {/* Arcada interativa (mesma geometria do odontograma) */}
      <OdontogramaArcada
        entries={entries}
        selected={selected}
        onSelect={n => setSelected(prev => (prev === n ? null : n))}
      />

      {/* Sintomas */}
      <div>
        <p
          style={{
            margin: '0 0 8px',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          Qual é a queixa?
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {SYMPTOMS.map(s => {
            const active = symptomId === s.id;
            return (
              <button
                key={s.id}
                type='button'
                onClick={() => setSymptomId(active ? null : s.id)}
                aria-pressed={active}
                style={{
                  padding: '9px 16px',
                  borderRadius: '999px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: active ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
                  backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
                  color: active ? '#FFFFFF' : '#3A3F4A',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel do dente selecionado */}
      {selected && anatomy && arch && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EEF1F8',
            borderRadius: '14px',
            padding: '18px 22px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            Dente {selected} — {anatomy.name}{' '}
            <span style={{ fontWeight: 500, color: '#6A7186' }}>
              ({QUADRANT_SIDE[selected[0]]})
            </span>
          </h2>
          <p
            style={{
              margin: '6px 0 10px',
              fontSize: '15px',
              color: '#3A3F4A',
              lineHeight: 1.6,
            }}
          >
            {anatomy.role}.{' '}
            <strong>
              {arch === 'upper' ? anatomy.roots.upper : anatomy.roots.lower}
            </strong>
            {anatomy.note ? ` — ${anatomy.note}` : ''}
          </p>
          {!symptom && (
            <p style={{ margin: 0, fontSize: '14px', color: '#6A7186' }}>
              Escolha agora a queixa acima para ver as causas possíveis neste
              dente.
            </p>
          )}
        </div>
      )}

      {/* Causas possíveis */}
      {symptom && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 700,
              color: '#1B2A6B',
            }}
          >
            {selected
              ? `Causas possíveis no dente ${selected}`
              : 'Selecione o dente da queixa na arcada para afinar as causas'}
            <span style={{ fontWeight: 500, color: '#6A7186', marginLeft: 8 }}>
              «{symptom.ask}»
            </span>
          </p>
          {(selected ? causes : symptom.causes).map((c, i) => {
            const sig = SIGNAL_META[c.signal];
            return (
              <div
                key={i}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #EEF1F8',
                  borderRadius: '14px',
                  padding: '16px 20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#1B2A6B',
                    }}
                  >
                    {c.title}
                  </h3>
                  <span
                    style={{
                      padding: '3px 12px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: sig.bg,
                      color: sig.fg,
                    }}
                  >
                    {sig.label}
                  </span>
                </div>
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: '15px',
                    lineHeight: 1.65,
                    color: '#3A3F4A',
                  }}
                >
                  {c.explain}
                </p>
                <p
                  style={{
                    margin: '10px 0 0',
                    fontSize: '14px',
                    lineHeight: 1.6,
                    color: '#1B2A6B',
                    backgroundColor: '#F4F6FB',
                    borderRadius: '10px',
                    padding: '10px 14px',
                  }}
                >
                  📷 <strong>O que a radiografia mostra:</strong> {c.rx}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Porquê da radiografia — painel geral */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EEF1F8',
          borderRadius: '14px',
          padding: '18px 22px',
        }}
      >
        <h2
          style={{
            margin: '0 0 4px',
            fontSize: '17px',
            fontWeight: 700,
            color: '#1B2A6B',
          }}
        >
          O que a radiografia revela — e o olho não vê
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '10px',
            marginTop: '10px',
          }}
        >
          {RX_REVEALS.map(r => (
            <div
              key={r.title}
              style={{
                backgroundColor: '#F4F6FB',
                borderRadius: '10px',
                padding: '12px 14px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#1B2A6B',
                }}
              >
                {r.title}
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '13px',
                  lineHeight: 1.55,
                  color: '#3A3F4A',
                }}
              >
                {r.detail}
              </p>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            marginTop: '12px',
          }}
        >
          {RX_TYPES.map(t => (
            <div
              key={t.name}
              style={{
                flex: '1 1 280px',
                border: '1px solid #D8DEEF',
                borderRadius: '10px',
                padding: '12px 14px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#2743A6',
                }}
              >
                {t.name}
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '13px',
                  lineHeight: 1.55,
                  color: '#3A3F4A',
                }}
              >
                {t.what}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        Conteúdo educativo de apoio à consulta — não substitui o exame clínico;
        o diagnóstico é sempre estabelecido pelo médico.
      </p>
    </div>
  );
}
