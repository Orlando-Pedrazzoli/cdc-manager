// 📄 src/components/produtos/CounterSaleForm.tsx
// =============================================================================
// CDC Manager — Produtos: registar uma venda ao balcão (7.ª ronda/B2b)
// -----------------------------------------------------------------------------
// A receção escolhe a clínica, opcionalmente o paciente, os produtos e as
// quantidades, e o meio de pagamento. O total e o IVA mostrados são só para
// conferir: o servidor volta a fazer as contas com os preços do catálogo.
// =============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Minus, Plus, Search, X } from 'lucide-react';
import { createProductSaleAction } from '@/actions/product-sales';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/domain';
import { SALE_MAX_QTY, formatEuro, saleTotals } from '@/lib/product-sales';
import { usePatientSearch } from '@/components/agenda/usePatientSearch';
import { PatientSearchResult } from '@/components/pacientes/PatientSearchResult';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

export function CounterSaleForm({
  clinics,
  products,
}: {
  clinics: { id: string; label: string }[];
  products: { id: string; name: string; priceCents: number; vatRate: number }[];
}) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? '');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { patientQuery, setPatientQuery, patient, setPatient, patientResults, reset } =
    usePatientSearch();

  const chosen = products.filter(p => (qty[p.id] ?? 0) > 0);
  const totals = saleTotals(
    chosen.map(p => ({
      unitPriceCents: p.priceCents,
      quantity: qty[p.id],
      vatRate: p.vatRate,
    })),
  );
  const change = (id: string, delta: number) =>
    setQty(q => ({
      ...q,
      [id]: Math.min(SALE_MAX_QTY, Math.max(0, (q[id] ?? 0) + delta)),
    }));

  const submit = async () => {
    if (!method) return;
    setBusy(true);
    const res = await createProductSaleAction({
      clinicId,
      patientId: patient?.id ?? null,
      paymentMethod: method,
      note,
      lines: chosen.map(p => ({ productId: p.id, quantity: qty[p.id] })),
    });
    setBusy(false);
    if ('error' in res) {
      toast.error(res.error);
      return;
    }
    toast.success(`Venda registada: ${formatEuro(res.totalCents)}.`);
    setQty({});
    setMethod('');
    setNote('');
    reset();
    router.refresh();
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '16px 24px',
        alignItems: 'start',
      }}
    >
      {/* Produtos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {products.map(p => {
          const n = qty[p.id] ?? 0;
          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: '10px',
                border: n > 0 ? '1px solid #1B2A6B' : '1px solid #E3E7F1',
                backgroundColor: n > 0 ? '#F2F5FC' : '#FFFFFF',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1C2233' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: '12px', color: '#6A7186' }}>
                  {formatEuro(p.priceCents)} · IVA {p.vatRate}%
                </div>
              </div>
              <button
                type='button'
                aria-label={`Menos um: ${p.name}`}
                onClick={() => change(p.id, -1)}
                disabled={n === 0}
                style={stepBtn(n === 0)}
              >
                <Minus size={14} />
              </button>
              <span
                aria-live='polite'
                style={{ width: 22, textAlign: 'center', fontSize: '15px', fontWeight: 700, color: '#1C2233' }}
              >
                {n}
              </span>
              <button
                type='button'
                aria-label={`Mais um: ${p.name}`}
                onClick={() => change(p.id, 1)}
                style={stepBtn(false)}
              >
                <Plus size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Quem, como e total */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {clinics.length > 1 && (
          <Select
            id='sale-clinic'
            label='Clínica *'
            value={clinicId}
            onChange={e => setClinicId(e.target.value)}
          >
            {clinics.map(c => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        )}
        <div style={{ position: 'relative' }}>
          <Input
            id='sale-patient'
            label='Paciente (opcional)'
            icon={<Search size={15} />}
            value={patient ? patient.label : patientQuery}
            onChange={e => {
              setPatient(null);
              setPatientQuery(e.target.value);
            }}
            placeholder='Nome, telemóvel, NIF ou nº de processo…'
            autoComplete='off'
          />
          {patient && (
            <button
              type='button'
              aria-label='Retirar o paciente'
              onClick={() => reset()}
              style={{ position: 'absolute', right: 8, top: 30, border: 'none', background: 'none', cursor: 'pointer', color: '#6A7186' }}
            >
              <X size={16} />
            </button>
          )}
          {patientResults.length > 0 && !patient && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 10,
                marginTop: 4,
                backgroundColor: '#FFFFFF',
                border: '1px solid #D8DEEF',
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(27,42,107,0.12)',
                overflow: 'hidden',
              }}
            >
              {patientResults.map((r, i) => (
                <PatientSearchResult key={r.id} hit={r} first={i === 0} onSelect={() => setPatient(r)} />
              ))}
            </div>
          )}
        </div>

        <div>
          <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 600, color: '#3A3F4A' }}>
            Meio de pagamento *
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PAYMENT_METHODS.map(m => {
              const active = method === m;
              return (
                <button
                  key={m}
                  type='button'
                  onClick={() => setMethod(m)}
                  aria-pressed={active}
                  style={{
                    flex: '1 1 110px',
                    borderRadius: '10px',
                    border: active ? '1px solid #1B2A6B' : '1px solid #D8DEEF',
                    backgroundColor: active ? '#1B2A6B' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#3A3F4A',
                    padding: '8px 6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {PAYMENT_METHOD_LABEL[m]}
                </button>
              );
            })}
          </div>
        </div>

        <Input
          id='sale-note'
          label='Observação (opcional)'
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={300}
          autoComplete='off'
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: '#F4F6FB',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: '#6A7186' }}>Total a cobrar</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#1B2A6B' }}>
              {formatEuro(totals.totalCents)}
            </div>
            <div style={{ fontSize: '12px', color: '#6A7186' }}>
              inclui {formatEuro(totals.vatCents)} de IVA
            </div>
          </div>
          <Button
            onClick={submit}
            loading={busy}
            disabled={chosen.length === 0 || !method || !clinicId}
          >
            Registar venda
          </Button>
        </div>
      </div>
    </div>
  );
}

function stepBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: '8px',
    border: '1px solid #D8DEEF',
    backgroundColor: '#FFFFFF',
    color: '#1B2A6B',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };
}
