// 📄 src/lib/odontogram-events.ts
// =============================================================================
// CDC Manager — Odontograma: carrega os EVENTOS que pintam o mapa dentário de
// um paciente (server-only; usa mongoose). Três origens → três camadas:
//   · existing  — versão gravada do Odontogram (estado inicial / achados
//                 marcados à mão; inclui a v1 migrada do Dentoral)
//   · completed — Procedures completed/invoiced com dente (efeito via
//                 TreatmentType.chartEffect; faces de `faces` ou das notas
//                 legacy "Faces: O, M")
//   · planned   — itens de TreatmentPlan (proposed/approved/in-progress) ainda
//                 sem procedureId + Procedures 'planned'
// O resultado é serializável (datas em ISO) para viajar até ao Client
// Component, que aplica deriveToothStates() com os filtros do utilizador
// (camadas visíveis, data da linha temporal).
// =============================================================================

import Odontogram from '@/models/Odontogram';
import Procedure from '@/models/Procedure';
import TreatmentPlan from '@/models/TreatmentPlan';
import TreatmentType from '@/models/TreatmentType';
import type { ChartEffect, ChartLayer, ToothFaceKey } from '@/lib/odontogram-chart';

export type SerializedChartEvent = {
  layer: ChartLayer;
  effect: ChartEffect | 'root-only' | 'to-extract';
  tooth: string;
  faces: ToothFaceKey[];
  at: string | null; // ISO
  label: string;
  refKind: 'procedure' | 'plan-item' | 'initial';
  refId: string;
  /** só para 'initial': condição de face registada à mão (cárie, fratura…) */
  condition?: 'caries' | 'restoration' | 'fracture' | 'sealant' | 'wear';
  status?: string; // só para 'initial': estado do dente na versão gravada
};

const LEGACY_FACES_RE = /Faces?:\s*([OMDVL](?:\s*,\s*[OMDVL])*)/i;

function facesOf(p: { faces?: string[] | null; notes?: string | null }): ToothFaceKey[] {
  if (p.faces?.length) return p.faces as ToothFaceKey[];
  const m = p.notes?.match(LEGACY_FACES_RE);
  return m ? (m[1].toUpperCase().split(/\s*,\s*/) as ToothFaceKey[]) : [];
}

export async function loadChartEvents(patientId: string, opts: { odontogramVersion?: number | null } = {}): Promise<SerializedChartEvent[]> {
  const [procs, plans, odo] = await Promise.all([
    Procedure.find({ patientId, status: { $in: ['planned', 'completed', 'invoiced'] }, 'toothNumbers.0': { $exists: true } })
      .select('treatmentTypeId nameSnapshot status toothNumbers faces notes executedAt createdAt')
      .lean(),
    TreatmentPlan.find({ patientId, status: { $in: ['proposed', 'approved', 'in-progress'] } })
      .select('items proposedAt approvedAt createdAt')
      .lean(),
    opts.odontogramVersion === null
      ? null
      : Odontogram.findOne(opts.odontogramVersion ? { patientId, version: opts.odontogramVersion } : { patientId })
          .sort({ version: -1 })
          .lean(),
  ]);

  const ttIds = new Set<string>();
  for (const p of procs) if (p.treatmentTypeId) ttIds.add(String(p.treatmentTypeId));
  for (const pl of plans) for (const it of pl.items ?? []) if (it.treatmentTypeId) ttIds.add(String(it.treatmentTypeId));
  const effects = new Map<string, ChartEffect>();
  if (ttIds.size) {
    for (const t of await TreatmentType.find({ _id: { $in: [...ttIds] } }).select('chartEffect').lean()) {
      effects.set(String(t._id), ((t as { chartEffect?: ChartEffect }).chartEffect ?? 'none') as ChartEffect);
    }
  }

  const out: SerializedChartEvent[] = [];

  // existing — versão gravada: estado do dente + condições por face
  if (odo) {
    for (const t of odo.teeth ?? []) {
      const base = { layer: 'existing' as const, tooth: t.number, at: null, refKind: 'initial' as const, refId: `${odo.version}:${t.number}` };
      if (t.status && t.status !== 'present') {
        const effect: SerializedChartEvent['effect'] = t.status === 'missing' ? 'extraction' : t.status === 'implant' ? 'implant' : t.status === 'crown' ? 'crown' : t.status === 'bridge-pontic' ? 'bridge' : t.status === 'root-only' ? 'root-only' : t.status === 'to-extract' ? 'to-extract' : 'none';
        out.push({ ...base, effect, faces: [], label: `Estado registado: ${t.status}`, status: t.status });
      }
      for (const f of t.faces ?? []) {
        out.push({ ...base, effect: f.condition === 'sealant' ? 'sealant' : 'restoration', faces: [f.face as ToothFaceKey], label: `Registado: ${f.condition} (${f.face})`, condition: f.condition as SerializedChartEvent['condition'] });
      }
    }
  }

  // completed / planned (procedures)
  for (const p of procs) {
    const effect: ChartEffect = p.treatmentTypeId ? (effects.get(String(p.treatmentTypeId)) ?? 'none') : 'none';
    if (effect === 'none') continue;
    const layer: ChartLayer = p.status === 'planned' ? 'planned' : 'completed';
    const at = (p.executedAt ?? p.createdAt) as Date | null;
    for (const tooth of p.toothNumbers ?? []) {
      out.push({ layer, effect, tooth, faces: facesOf(p), at: at ? new Date(at).toISOString() : null, label: p.nameSnapshot, refKind: 'procedure', refId: String(p._id) });
    }
  }

  // planned (itens de plano ainda não executados)
  for (const pl of plans) {
    const at = (pl.approvedAt ?? pl.proposedAt ?? pl.createdAt) as Date | null;
    for (const it of pl.items ?? []) {
      if (it.procedureId) continue;
      const effect = it.treatmentTypeId ? (effects.get(String(it.treatmentTypeId)) ?? 'none') : 'none';
      if (effect === 'none') continue;
      for (const tooth of it.toothNumbers ?? []) {
        out.push({ layer: 'planned', effect, tooth, faces: [], at: at ? new Date(at).toISOString() : null, label: it.nameSnapshot, refKind: 'plan-item', refId: `${pl._id}:${it._id}` });
      }
    }
  }
  return out;
}
