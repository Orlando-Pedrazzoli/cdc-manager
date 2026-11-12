// 📄 src/components/recalls/RecallContactLog.tsx
// =============================================================================
// CDC Manager — Recalls: registo de contactos / produtividade (6.ª ronda/09)
// -----------------------------------------------------------------------------
// Pedido do Victor (nov. 2026): "Filtro por colaborador, com o registo
// completo do que cada pessoa fez de recall: quantos contactos, em que dia e
// a que horas. Permite acompanhar a produtividade de cada colaborador."
//
// Server component: lê Recall.contacts (gravado por
// registerRecallContactAction) no período e clínica pedidos, mostra o resumo
// por colaborador e a lista contacto a contacto, e exporta para Excel.
// Só a gestão vê este separador (a página decide).
// =============================================================================

import Link from 'next/link';
import mongoose from 'mongoose';
import Recall, { RECALL_OUTCOMES, type RecallOutcome } from '@/models/Recall';
import Patient from '@/models/Patient';
import TreatmentType from '@/models/TreatmentType';
import User from '@/models/User';
import { lisbonToUtc, todayLisbon } from '@/lib/availability';
import { RECALL_OUTCOME_LABEL } from '@/lib/validations/recalls';
import { processLabel } from '@/lib/domain';
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OID_RE = /^[0-9a-fA-F]{24}$/;
const MAX_ROWS = 3000;

const dayFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Lisbon',
});
const hourFmt = new Intl.DateTimeFormat('pt-PT', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Lisbon',
});

function nextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

interface ContactRow {
  at: Date;
  userId: string;
  outcome: RecallOutcome;
  note: string | null;
  patientId: string;
  treatmentTypeId: string;
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '9px 12px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  color: '#6A7186',
  borderBottom: '1px solid #EEF1F8',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '9px 12px',
  fontSize: '13px',
  color: '#454C63',
  borderBottom: '1px solid #F4F6FB',
};
const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EEF1F8',
  borderRadius: '14px',
  overflow: 'hidden',
};
const field: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px solid #D8DEEF',
  padding: '7px 10px',
  fontSize: '13px',
  color: '#1B2A6B',
  backgroundColor: '#FFFFFF',
};

export async function RecallContactLog({
  clinicId,
  clinicSlug,
  clinicName,
  from,
  to,
  collaboratorId,
}: {
  clinicId: string;
  clinicSlug: string;
  clinicName: string;
  from?: string;
  to?: string;
  collaboratorId?: string;
}) {
  const today = todayLisbon();
  const toStr = to && DATE_RE.test(to) ? to : today;
  const fromStr =
    from && DATE_RE.test(from) && from <= toStr
      ? from
      : `${toStr.slice(0, 8)}01`; // 1.º dia do mês
  const colab =
    collaboratorId && OID_RE.test(collaboratorId) ? collaboratorId : '';

  const start = lisbonToUtc(fromStr, 0);
  const end = lisbonToUtc(nextDay(toStr), 0);
  const range = { $gte: start, $lt: end };

  const raw = await Recall.aggregate<ContactRow & { _id: unknown }>([
    {
      $match: {
        clinicId: new mongoose.Types.ObjectId(clinicId),
        'contacts.at': range,
      },
    },
    { $unwind: '$contacts' },
    { $match: { 'contacts.at': range } },
    { $sort: { 'contacts.at': -1 } },
    { $limit: MAX_ROWS },
    {
      $project: {
        at: '$contacts.at',
        userId: { $toString: '$contacts.userId' },
        outcome: '$contacts.outcome',
        note: '$contacts.note',
        patientId: { $toString: '$patientId' },
        treatmentTypeId: { $toString: '$treatmentTypeId' },
      },
    },
  ]);

  const userIds = [...new Set(raw.map(r => r.userId))];
  const [users, patients, treatments] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds } })
          .select('name')
          .lean()
      : [],
    raw.length
      ? Patient.find({ _id: { $in: [...new Set(raw.map(r => r.patientId))] } })
          .select('name processNumber phone')
          .lean()
      : [],
    raw.length
      ? TreatmentType.find({
          _id: { $in: [...new Set(raw.map(r => r.treatmentTypeId))] },
        })
          .select('name')
          .lean()
      : [],
  ]);
  const userName = new Map(users.map(u => [String(u._id), u.name]));
  const patientById = new Map(patients.map(p => [String(p._id), p]));
  const treatmentName = new Map(treatments.map(t => [String(t._id), t.name]));

  // Resumo por colaborador (sempre sobre o período inteiro, sem o filtro
  // de colaborador — é a tabela de comparação)
  const summary = new Map<
    string,
    { total: number; days: Set<string>; byOutcome: Map<RecallOutcome, number> }
  >();
  for (const r of raw) {
    const cur = summary.get(r.userId) ?? {
      total: 0,
      days: new Set<string>(),
      byOutcome: new Map<RecallOutcome, number>(),
    };
    cur.total += 1;
    cur.days.add(dayFmt.format(r.at));
    cur.byOutcome.set(r.outcome, (cur.byOutcome.get(r.outcome) ?? 0) + 1);
    summary.set(r.userId, cur);
  }
  const summaryRows = [...summary.entries()].sort(
    (a, b) => b[1].total - a[1].total,
  );

  const rows = colab ? raw.filter(r => r.userId === colab) : raw;
  const base = `/admin/recalls?clinic=${clinicSlug}&vista=registo&de=${fromStr}&ate=${toStr}`;

  const csvHeaders = [
    'Dia',
    'Hora',
    'Colaborador',
    'Resultado',
    'Paciente',
    'N.º processo',
    'Telemóvel',
    'Ato do recall',
    'Nota',
  ];
  const csvRows = rows.map(r => {
    const p = patientById.get(r.patientId);
    return [
      dayFmt.format(r.at),
      hourFmt.format(r.at),
      userName.get(r.userId) ?? '—',
      RECALL_OUTCOME_LABEL[r.outcome] ?? r.outcome,
      p?.name ?? 'Paciente removido',
      p ? processLabel(p.processNumber) : '—',
      p?.phone ?? '',
      treatmentName.get(r.treatmentTypeId) ?? '—',
      r.note ?? '',
    ];
  });

  return (
    <>
      {/* Filtros: período + colaborador (GET — fica no endereço) */}
      <form
        method='get'
        action='/admin/recalls'
        style={{
          ...card,
          padding: '14px 16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          overflow: 'visible',
        }}
      >
        <input type='hidden' name='clinic' value={clinicSlug} />
        <input type='hidden' name='vista' value='registo' />
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#6A7186' }}>
          De
          <br />
          <input type='date' name='de' defaultValue={fromStr} style={field} />
        </label>
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#6A7186' }}>
          Até
          <br />
          <input type='date' name='ate' defaultValue={toStr} style={field} />
        </label>
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#6A7186' }}>
          Colaborador
          <br />
          <select name='colab' defaultValue={colab} style={field}>
            <option value=''>Todos</option>
            {summaryRows.map(([id]) => (
              <option key={id} value={id}>
                {userName.get(id) ?? '—'}
              </option>
            ))}
          </select>
        </label>
        <button
          type='submit'
          style={{
            ...field,
            backgroundColor: '#2743A6',
            borderColor: '#2743A6',
            color: '#FFFFFF',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Filtrar
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <ExportCsvButton
            label='Exportar para Excel'
            filename={`recalls-contactos-${clinicSlug}-${fromStr}_${toStr}.csv`}
            headers={csvHeaders}
            rows={csvRows}
          />
        </div>
      </form>

      {/* Resumo por colaborador */}
      <div style={card}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #F4F6FB' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            Produtividade por colaborador
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9AA1B4' }}>
            {clinicName} · {dayFmt.format(start)} a{' '}
            {dayFmt.format(lisbonToUtc(toStr, 0))} · {raw.length} contacto
            {raw.length === 1 ? '' : 's'}
            {raw.length >= MAX_ROWS
              ? ` (limite de ${MAX_ROWS} — encurte o período)`
              : ''}
          </p>
        </div>
        {summaryRows.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '20px 16px',
              fontSize: '13px',
              color: '#9AA1B4',
            }}
          >
            Sem contactos registados neste período.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8F9FD' }}>
                  <th style={th}>Colaborador</th>
                  <th style={{ ...th, textAlign: 'right' }}>Contactos</th>
                  <th style={{ ...th, textAlign: 'right' }}>Dias</th>
                  {RECALL_OUTCOMES.map(o => (
                    <th key={o} style={{ ...th, textAlign: 'right' }}>
                      {RECALL_OUTCOME_LABEL[o]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryRows.map(([id, s]) => (
                  <tr
                    key={id}
                    style={{
                      backgroundColor: id === colab ? '#F1F5FF' : undefined,
                    }}
                  >
                    <td style={{ ...td, fontWeight: 600 }}>
                      <Link
                        href={`${base}&colab=${id}`}
                        style={{ color: '#2743A6', textDecoration: 'none' }}
                      >
                        {userName.get(id) ?? '—'}
                      </Link>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                      {s.total}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{s.days.size}</td>
                    {RECALL_OUTCOMES.map(o => (
                      <td key={o} style={{ ...td, textAlign: 'right' }}>
                        {s.byOutcome.get(o) ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Contacto a contacto */}
      <div style={card}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #F4F6FB' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 700,
              color: '#1C2233',
            }}
          >
            Registo de contactos
            {colab ? ` — ${userName.get(colab) ?? ''}` : ''}
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9AA1B4' }}>
            {rows.length} contacto{rows.length === 1 ? '' : 's'}, do mais
            recente para o mais antigo
          </p>
        </div>
        {rows.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '20px 16px',
              fontSize: '13px',
              color: '#9AA1B4',
            }}
          >
            Nada a mostrar.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8F9FD' }}>
                  {['Dia', 'Hora', 'Colaborador', 'Resultado', 'Paciente', 'Ato', 'Nota'].map(
                    h => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((r, i) => {
                  const p = patientById.get(r.patientId);
                  return (
                    <tr key={i}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {dayFmt.format(r.at)}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {hourFmt.format(r.at)}
                      </td>
                      <td style={td}>{userName.get(r.userId) ?? '—'}</td>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {RECALL_OUTCOME_LABEL[r.outcome] ?? r.outcome}
                      </td>
                      <td style={td}>
                        <Link
                          href={`/admin/pacientes/${r.patientId}`}
                          style={{ color: '#2743A6', textDecoration: 'none' }}
                        >
                          {p?.name ?? 'Paciente removido'}
                        </Link>
                      </td>
                      <td style={td}>
                        {treatmentName.get(r.treatmentTypeId) ?? '—'}
                      </td>
                      <td style={td}>{r.note ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 500 && (
              <p
                style={{
                  margin: 0,
                  padding: '10px 16px',
                  fontSize: '12px',
                  color: '#9AA1B4',
                }}
              >
                A mostrar os 500 mais recentes — a exportação para Excel leva
                todos os {rows.length}.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
