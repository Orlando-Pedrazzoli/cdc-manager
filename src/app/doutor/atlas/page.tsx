// 📄 src/app/doutor/atlas/page.tsx
// =============================================================================
// CDC Manager — Atlas Dentário v2 (ferramenta de "cadeira")
// -----------------------------------------------------------------------------
// Página educativa que o médico abre À FRENTE DO PACIENTE. Dois modos:
//   👤 Modo paciente — uma pergunta de cada vez, letras grandes, botões
//      grandes, linguagem simples, numa jornada com passos:
//      1 Onde? → 2 O que sente? → 3 Conte-nos mais → 4 O que pode ser →
//      5 O que precisamos de ver → 6 Qual exame → Resumo
//   👨‍⚕️ Modo clínico — tudo ao mesmo tempo, mais denso, com anatomia
//      (raízes/canais), sinal de urgência e "o que o RX mostra" por causa.
// Filosofia: "temos uma pergunta clínica → este exame ajuda a responder".
// Continua sem dados de paciente e sem gravar nada (não é diagnóstico).
// Dados: lib/data/atlas.ts (inalterado) + lib/data/atlas-flow.ts (v2).
// =============================================================================

'use client';

import { useMemo, useState } from 'react';
import { ScanSearch, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { OdontogramaArcada } from '@/components/clinico/OdontogramaArcada';
import type { ToothEntry } from '@/components/clinico/ToothDetail';
import { UPPER_TEETH, LOWER_TEETH } from '@/lib/domain';
import {
  TOOTH_ANATOMY,
  SYMPTOMS,
  SINUS_CAUSE,
  RX_REVEALS,
  type Cause,
} from '@/lib/data/atlas';
import { FOLLOW_UPS, recommendExam } from '@/lib/data/atlas-flow';
import { AtlasToothFocus } from '@/components/atlas/AtlasToothFocus';
import {
  AtlasSymptomPicker,
  AtlasFollowUp,
} from '@/components/atlas/AtlasSymptomFlow';
import { AtlasCauses } from '@/components/atlas/AtlasCauses';
import { AtlasInvestigation } from '@/components/atlas/AtlasInvestigation';
import { AtlasRadiography } from '@/components/atlas/AtlasRadiography';
import { AtlasSummary } from '@/components/atlas/AtlasSummary';
import { Gloss } from '@/components/atlas/AtlasGlossary';

const QUADRANT_SIDE: Record<string, string> = {
  '1': 'superior direito',
  '2': 'superior esquerdo',
  '3': 'inferior esquerdo',
  '4': 'inferior direito',
};

type Mode = 'clinico' | 'paciente';
const STEPS = [
  'Onde está o problema?',
  'O que está a sentir?',
  'Conte-nos um pouco mais',
  'O que pode estar a acontecer?',
  'O que precisamos de ver?',
  'Qual exame responde à nossa dúvida?',
  'O que percebemos até agora',
] as const;

export default function AtlasPage() {
  const [mode, setMode] = useState<Mode>('paciente');
  const [selected, setSelected] = useState<string | null>(null);
  const [symptomId, setSymptomId] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [step, setStep] = useState(0);

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
  const toothName =
    anatomy && selected
      ? `${anatomy.name} ${QUADRANT_SIDE[selected[0]] ?? ''}`
      : '';
  const symptom = SYMPTOMS.find(s => s.id === symptomId) ?? null;
  const followUpOption = symptom
    ? (FOLLOW_UPS[symptom.id]?.options.find(o => o.key === followUp) ?? null)
    : null;

  const causes = useMemo<Cause[]>(() => {
    if (!symptom || !position || !arch) return [];
    const base = symptom.causes.filter(
      c =>
        (!c.positions || c.positions.includes(position)) &&
        (!c.arch || c.arch === arch),
    );
    return arch === 'upper' &&
      SINUS_CAUSE.positions?.includes(position) &&
      (symptom.id === 'dor-prolongada' || symptom.id === 'mastigar')
      ? [...base, SINUS_CAUSE]
      : base;
  }, [symptom, position, arch]);

  const recommendation =
    symptom && position && arch
      ? recommendExam(symptom.id, position, arch)
      : null;

  const reset = () => {
    setSelected(null);
    setSymptomId(null);
    setFollowUp(null);
    setStep(0);
  };
  // Passos possíveis conforme o que já foi escolhido
  const maxStep = !selected ? 0 : !symptom ? 1 : !followUp ? 2 : 6;
  const canNext = step < maxStep;

  // --- estilos ---
  const card: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EEF1F8',
    borderRadius: '16px',
    padding: '18px 20px',
  };
  const large = mode === 'paciente';
  const h2: React.CSSProperties = {
    margin: '0 0 10px',
    fontSize: large ? '22px' : '15px',
    fontWeight: 800,
    color: '#1B2A6B',
  };

  const modeBtn = (m: Mode, label: string) => (
    <button
      type='button'
      onClick={() => setMode(m)}
      style={{
        padding: '8px 14px',
        borderRadius: 999,
        border: 'none',
        backgroundColor: mode === m ? '#1B2A6B' : 'transparent',
        color: mode === m ? '#FFFFFF' : '#1B2A6B',
        fontSize: '13px',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cabeçalho + modo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
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
          <p
            style={{
              margin: '4px 0 0',
              fontSize: large ? '16px' : '14px',
              color: '#6A7186',
            }}
          >
            {large
              ? 'Vamos perceber juntos o que pode estar a acontecer.'
              : 'Ferramenta de explicação em cadeira — dente, sintoma, possibilidades e o porquê do exame.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'inline-flex',
              padding: 3,
              borderRadius: 999,
              backgroundColor: '#EEF1F8',
            }}
          >
            {modeBtn('clinico', '👨‍⚕️ Modo clínico')}
            {modeBtn('paciente', '👤 Modo paciente')}
          </div>
          {(selected || symptomId) && (
            <button
              type='button'
              onClick={reset}
              title='Recomeçar'
              style={{
                border: '1px solid #D8DEEF',
                background: '#FFFFFF',
                borderRadius: 999,
                padding: 8,
                cursor: 'pointer',
                color: '#6A7186',
                display: 'flex',
              }}
            >
              <RotateCcw size={15} />
            </button>
          )}
        </div>
      </div>

      {large ? (
        /* ===================== MODO PACIENTE — jornada ===================== */
        <>
          {/* Progresso */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {STEPS.map((s, i) => {
              const reachable = i <= maxStep;
              const active = i === step;
              return (
                <button
                  key={s}
                  type='button'
                  disabled={!reachable}
                  onClick={() => setStep(i)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: 'none',
                    backgroundColor: active
                      ? '#1B2A6B'
                      : reachable
                        ? '#EEF2FF'
                        : '#F4F6FB',
                    color: active
                      ? '#FFFFFF'
                      : reachable
                        ? '#1B2A6B'
                        : '#B0B6C6',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: reachable ? 'pointer' : 'default',
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: active
                        ? '#FFFFFF'
                        : reachable
                          ? '#1B2A6B'
                          : '#C7CEE0',
                      color: active ? '#1B2A6B' : '#FFFFFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                    }}
                  >
                    {i + 1}
                  </span>
                  {s}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            {/* Coluna principal */}
            <div
              style={{
                flex: '1 1 560px',
                minWidth: 0,
                ...card,
                padding: '24px 26px',
              }}
            >
              <p
                style={{
                  margin: '0 0 4px',
                  fontSize: '13px',
                  fontWeight: 800,
                  color: '#2743A6',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                Passo {step + 1}
              </p>
              <h2 style={{ ...h2, fontSize: '26px' }}>{STEPS[step]}</h2>

              {step === 0 && (
                <>
                  <p
                    style={{
                      margin: '0 0 12px',
                      fontSize: '16px',
                      color: '#3D4257',
                    }}
                  >
                    Toque no dente onde sente o problema.
                  </p>
                  <OdontogramaArcada
                    entries={entries}
                    selected={selected}
                    onSelect={n => {
                      setSelected(prev => (prev === n ? null : n));
                      setSymptomId(null);
                      setFollowUp(null);
                    }}
                  />
                  {selected && (
                    <p
                      style={{
                        margin: '12px 0 0',
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#1B2A6B',
                      }}
                    >
                      Dente {selected} — {toothName}
                    </p>
                  )}
                </>
              )}
              {step === 1 && (
                <AtlasSymptomPicker
                  value={symptomId}
                  onChange={id => {
                    setSymptomId(id);
                    setFollowUp(null);
                  }}
                  large
                />
              )}
              {step === 2 && symptom && (
                <AtlasFollowUp
                  symptomId={symptom.id}
                  value={followUp}
                  onChange={setFollowUp}
                  large
                />
              )}
              {step === 3 && symptom && (
                <>
                  <p
                    style={{
                      margin: '0 0 12px',
                      fontSize: '16px',
                      color: '#3D4257',
                    }}
                  >
                    Podemos estar perante várias situações. O exame clínico
                    ajuda-nos a distingui-las.
                  </p>
                  <AtlasCauses
                    causes={causes}
                    emphasize={followUpOption?.emphasize ?? []}
                    mode='paciente'
                  />
                </>
              )}
              {step === 4 && symptom && selected && arch && (
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px' }}>
                    <AtlasToothFocus
                      fdi={selected}
                      name={toothName}
                      arch={arch}
                      large
                    />
                  </div>
                  <div style={{ flex: '1 1 260px' }}>
                    <p
                      style={{
                        margin: '0 0 8px',
                        fontSize: '15px',
                        fontWeight: 800,
                        color: '#1B2A6B',
                      }}
                    >
                      O que estamos a tentar perceber?
                    </p>
                    <AtlasInvestigation
                      symptomId={symptom.id}
                      rxStage={false}
                      large
                    />
                    <p
                      style={{
                        margin: '14px 0 0',
                        fontSize: '15px',
                        color: '#3D4257',
                      }}
                    >
                      Os itens a cinzento só a radiografia consegue responder —
                      é por isso que a recomendamos.
                    </p>
                  </div>
                </div>
              )}
              {step === 5 && recommendation && symptom && (
                <>
                  <AtlasRadiography recommendation={recommendation} large />
                  <div style={{ marginTop: 14 }}>
                    <AtlasInvestigation symptomId={symptom.id} rxStage large />
                  </div>
                </>
              )}
              {step === 6 && recommendation && symptom && selected && (
                <AtlasSummary
                  fdi={selected}
                  toothName={toothName}
                  symptomLabel={symptom.label}
                  followUpLabel={followUpOption?.label ?? null}
                  symptomId={symptom.id}
                  recommendation={recommendation}
                  large
                />
              )}

              {/* Navegação */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 20,
                  gap: 8,
                }}
              >
                <button
                  type='button'
                  disabled={step === 0}
                  onClick={() => setStep(s => Math.max(0, s - 1))}
                  style={navBtn(step === 0)}
                >
                  <ChevronLeft size={18} /> {step === 6 ? 'Rever' : 'Anterior'}
                </button>
                {step < 6 ? (
                  <button
                    type='button'
                    disabled={!canNext}
                    onClick={() => setStep(s => Math.min(6, s + 1))}
                    style={{
                      ...navBtn(!canNext),
                      backgroundColor: canNext ? '#2743A6' : '#EEF1F8',
                      color: canNext ? '#FFFFFF' : '#B0B6C6',
                    }}
                  >
                    {step === 5 ? 'Ver resumo' : 'Seguinte'}{' '}
                    <ChevronRight size={18} />
                  </button>
                ) : (
                  <button
                    type='button'
                    onClick={reset}
                    style={{
                      ...navBtn(false),
                      backgroundColor: '#1B2A6B',
                      color: '#FFFFFF',
                    }}
                  >
                    Recomeçar <RotateCcw size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Lateral: dente em foco (a partir do passo 1) */}
            {selected && arch && step >= 1 && step !== 4 && (
              <div style={{ flex: '0 1 300px', ...card }}>
                <AtlasToothFocus fdi={selected} name={toothName} arch={arch} />
              </div>
            )}
          </div>
        </>
      ) : (
        /* ===================== MODO CLÍNICO — tudo visível ===================== */
        <>
          <OdontogramaArcada
            entries={entries}
            selected={selected}
            onSelect={n => {
              setSelected(prev => (prev === n ? null : n));
              setFollowUp(null);
            }}
          />
          <div style={card}>
            <h2 style={h2}>Qual é a queixa?</h2>
            <AtlasSymptomPicker
              value={symptomId}
              onChange={id => {
                setSymptomId(id);
                setFollowUp(null);
              }}
              large={false}
            />
            {symptom && (
              <div style={{ marginTop: 12 }}>
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: '13px',
                    color: '#6A7186',
                  }}
                >
                  Pergunta de cadeira: <em>{symptom.ask}</em>
                </p>
                <AtlasFollowUp
                  symptomId={symptom.id}
                  value={followUp}
                  onChange={setFollowUp}
                  large={false}
                />
              </div>
            )}
          </div>

          {selected && arch && anatomy && (
            <div
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '0 1 300px', ...card }}>
                <AtlasToothFocus fdi={selected} name={toothName} arch={arch} />
                <div
                  style={{
                    marginTop: 12,
                    fontSize: '13px',
                    color: '#3D4257',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <span>
                    <strong>Função:</strong> {anatomy.role}
                  </span>
                  <span>
                    <strong>Raízes / canais:</strong> {anatomy.roots[arch]}
                  </span>
                  {anatomy.note && (
                    <span style={{ color: '#2743A6' }}>📌 {anatomy.note}</span>
                  )}
                </div>
              </div>
              <div
                style={{
                  flex: '1 1 480px',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                {symptom ? (
                  <>
                    <div style={card}>
                      <h2 style={h2}>O que pode explicar este sintoma?</h2>
                      <AtlasCauses
                        causes={causes}
                        emphasize={followUpOption?.emphasize ?? []}
                        mode='clinico'
                      />
                    </div>
                    <div style={card}>
                      <h2 style={h2}>O que estamos a tentar perceber?</h2>
                      <AtlasInvestigation
                        symptomId={symptom.id}
                        rxStage
                        large={false}
                      />
                    </div>
                    {recommendation && (
                      <div style={card}>
                        <h2 style={h2}>Qual exame responde à nossa dúvida?</h2>
                        <AtlasRadiography
                          recommendation={recommendation}
                          large={false}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ ...card, color: '#6A7186', fontSize: '14px' }}>
                    Escolha a queixa para ver as possibilidades e o exame
                    recomendado.
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={card}>
            <h2 style={h2}>O que a radiografia revela — e o olho não vê</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 10,
              }}
            >
              {RX_REVEALS.map(r => (
                <div
                  key={r.title}
                  style={{
                    borderRadius: '10px',
                    backgroundColor: '#F8F9FD',
                    padding: '10px 12px',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13.5px',
                      fontWeight: 700,
                      color: '#1B2A6B',
                    }}
                  >
                    {r.title}
                  </p>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: '12.5px',
                      color: '#3D4257',
                    }}
                  >
                    <Gloss text={r.detail} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <p style={{ margin: 0, fontSize: '12px', color: '#9AA1B4' }}>
        O Atlas é educativo: não diagnostica e não grava nada no processo
        clínico. Serve para tornar o raciocínio do médico visível e
        compreensível para o paciente.
      </p>
    </div>
  );
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '12px 18px',
    borderRadius: '12px',
    border: '1px solid #D8DEEF',
    backgroundColor: '#FFFFFF',
    color: disabled ? '#B0B6C6' : '#1B2A6B',
    fontSize: '16px',
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
  };
}
