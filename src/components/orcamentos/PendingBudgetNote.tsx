// 📄 src/components/orcamentos/PendingBudgetNote.tsx
// =============================================================================
// CDC Manager — Odontograma: "Orçamento entregue no dia X, pendente"
// (8.ª ronda/12, Victor 17/11/2026). Server Component. A linha desaparece
// sozinha quando o paciente aceita, recusa ou o tratamento começa.
// =============================================================================

import TreatmentPlan from '@/models/TreatmentPlan';
import { formatCents } from '@/lib/commissions';
import { daysSince } from '@/lib/budgets';

const dayFmt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Lisbon',
});

/** Orçamentos entregues e por responder deste paciente, já com os dias */
async function loadPendingBudgets(patientId: string) {
  const plans = await TreatmentPlan.find({
    patientId,
    status: 'proposed',
    legacyId: null,
    proposedAt: { $ne: null },
  })
    .select('title totalCents discountCents proposedAt')
    .sort({ proposedAt: -1 })
    .limit(5)
    .lean()
    .catch(err => {
      console.error('[odontograma] orçamentos pendentes indisponíveis', err);
      return [];
    });
  const now = Date.now();
  return plans.map(p => {
    const at = p.proposedAt as Date;
    return {
      id: String(p._id),
      title: p.title,
      dayLabel: dayFmt.format(at),
      days: daysSince(at.getTime(), now),
      valueLabel: formatCents(
        Math.max(0, (p.totalCents ?? 0) - (p.discountCents ?? 0)),
      ),
    };
  });
}

export async function PendingBudgetNote({ patientId }: { patientId: string }) {
  const plans = await loadPendingBudgets(patientId);
  if (plans.length === 0) return null;
  return (
    <div
      role='note'
      style={{
        padding: '10px 14px',
        borderRadius: '10px',
        backgroundColor: '#FFF4D6',
        border: '1px solid #EBCB74',
        color: '#6B5200',
        fontSize: '13px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {plans.map(p => (
        <div key={p.id}>
          <strong>Orçamento entregue no dia {p.dayLabel}, pendente</strong>
          {p.days > 0 ? ` há ${p.days} dia${p.days === 1 ? '' : 's'}` : ''} · {p.title} ·{' '}
          {p.valueLabel}
        </div>
      ))}
    </div>
  );
}
