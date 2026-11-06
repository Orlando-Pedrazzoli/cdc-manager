// 📄 scripts/migracao/02-doctors.ts
// =============================================================================
// Passo 2 — medicos → Doctor (clínicos) e Employee (restante staff)
//
// Regra de classificação (perfil 05/11/2026):
//   · clínico  = TipoAcesso 5 ou 6 ("Medico/Medica Dentista") OU tem Cedula
//   · staff    = TipoAcesso 2 RECEPCIONISTA, 3 ADMINISTRADOR, 4 ASSISTENTE
//                DENTÁRIA, 1 (não descrito) e restantes
// Horários (agdconf, só configurações em vigor) → Doctor.clinicSchedules.
//   ASSUNÇÃO a validar: agdconf.DiaSemana 1 = segunda … 6 = sábado, 7 = domingo
//   (amostra tem 1,2,3,4,6 — coerente com clínica de centro comercial aberta
//   ao sábado). Se afinal 1 = domingo, basta trocar WEEKDAY_BASE para 'sunday'.
// Nenhum médico activo tem email no Dentoral → NÃO se criam Users; a clínica
// convida cada um pelo fluxo de ativação do CDC.
// =============================================================================

import { runScript, q, str, yn, nif, phoneE164, email, lisbonDate, cents, log, upsertByLegacyId, type UpsertStats } from './lib/common';

const WEEKDAY_BASE = 'sunday' as 'monday' | 'sunday'; // validado 6 nov 2026 (agdconf da Dra. Jerusa: 1 = domingo)

type Medico = {
  Codigo: number; Activo: string; Nome: string; TipoAcesso: number; Espec: number;
  CalcPerc: string | null; ValPerc: string | null; ValTrat: string | null; Cedula: string | null;
  CodComissao: number; Telefone: string | null; eMail: string | null; TMV: string | null;
  NIF: string; DiaEntrada: string; DiaSaida: string; DiaAltComissao: string; NomeTipo: string | null;
};
type Agd = { Medico: number; DiaSemana: number; MInicio: string; MFim: string; MMin: number; TInicio: string; TFim: string; TMin: number; Inicio: string; Fim: string };

function hhmm(t: string): string | null {
  if (!t || t === '00:00:00') return null;
  return t.slice(0, 5);
}

void runScript('02-doctors', async args => {
  const { Doctor, Employee, Clinic } = await import('@/models');
  const clinic = await Clinic.findOne({ slug: 'colombo' }).lean();
  if (!clinic) throw new Error("Clínica 'colombo' em falta");

  const medicos = await q<Medico>(`
    SELECT m.Codigo, m.Activo, m.Nome, m.TipoAcesso, m.Espec, m.CalcPerc, m.ValPerc, m.ValTrat, m.Cedula,
           m.CodComissao, m.Telefone, m.eMail, m.TMV, m.NIF, m.DiaEntrada, m.DiaSaida, m.DiaAltComissao,
           t.NomeTipo
    FROM medicos m LEFT JOIN tipoacesso t ON t.CodTipo = m.TipoAcesso
    ORDER BY m.Codigo`);
  const agd = await q<Agd>(`
    SELECT Medico, DiaSemana, MInicio, MFim, MMin, TInicio, TFim, TMin, Inicio, Fim
    FROM agdconf
    WHERE (Fim = '0000-00-00' OR Fim >= CURDATE()) AND (Inicio = '0000-00-00' OR Inicio <= CURDATE())`);

  // horários por médico: weekday → ranges (dedupe)
  const schedules = new Map<number, Map<number, Set<string>>>();
  for (const a of agd) {
    const ds = Number(a.DiaSemana);
    const weekday = WEEKDAY_BASE === 'monday' ? ds % 7 : ds - 1; // JS: 0 = domingo
    if (weekday < 0 || weekday > 6) continue;
    const m = schedules.get(a.Medico) ?? new Map<number, Set<string>>();
    const set = m.get(weekday) ?? new Set<string>();
    const ms = hhmm(a.MInicio), me = hhmm(a.MFim), ts = hhmm(a.TInicio), te = hhmm(a.TFim);
    if (ms && me && me > ms) set.add(`${ms}-${me}`);
    if (ts && te && te > ts) set.add(`${ts}-${te}`);
    m.set(weekday, set);
    schedules.set(a.Medico, m);
  }

  const doctors: Record<string, any>[] = [];
  const employees: Record<string, any>[] = [];

  for (const m of medicos) {
    const code = Number(m.Codigo);
    const isDoctor = [5, 6].includes(Number(m.TipoAcesso)) || !!str(m.Cedula);
    const active = yn(m.Activo);
    const entrada = lisbonDate(m.DiaEntrada);
    const saida = lisbonDate(m.DiaSaida);
    const legacyData = {
      codigo: code,
      tipoAcesso: Number(m.TipoAcesso),
      tipoAcessoNome: m.NomeTipo,
      espec: Number(m.Espec),
      calcPerc: m.CalcPerc,
      valPerc: m.ValPerc,
      valTrat: m.ValTrat,
      codComissao: Number(m.CodComissao),
      diaEntrada: m.DiaEntrada,
      diaSaida: m.DiaSaida,
      diaAltComissao: m.DiaAltComissao,
      telefoneRaw: str(m.Telefone),
      tmvRaw: str(m.TMV),
      nifRaw: str(m.NIF),
    };
    const name = str(m.Nome, 120) ?? `Operador ${code}`;

    if (isDoctor) {
      const sched = schedules.get(code);
      const clinicSchedules = sched && sched.size
        ? [{
            clinicId: clinic._id,
            bookableOnline: false,
            weeklySchedule: [...sched.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([weekday, ranges]) => ({
                weekday,
                ranges: [...ranges].sort().map(r => { const [start, end] = r.split('-'); return { start, end }; }),
              })),
          }]
        : [];
      const pct = m.CalcPerc && yn(m.CalcPerc) && m.ValPerc ? Number(m.ValPerc) : null;
      doctors.push({
        legacyId: `dentoral:${code}`,
        name,
        licenseNumber: str(m.Cedula, 40),
        specialties: ['dentisteria'], // o Dentoral só tem 1 especialidade ("MEDICINA DENTÁRIA")
        clinicSchedules,
        exceptions: [],
        commissionRate: pct !== null && pct > 0 && pct <= 100 ? pct / 100 : null,
        commissionOverrides: [],
        commissionCategoryOverrides: [],
        monthlyGoalCents: null,
        color: '#2743A6',
        active,
        legacyData,
        createdAt: entrada ?? new Date('2010-01-01T00:00:00Z'),
      });
    } else {
      employees.push({
        legacyId: `dentoral:${code}`,
        name,
        category: str(m.NomeTipo, 80) ?? `Operador (tipo ${m.TipoAcesso})`,
        contractType: 'outro',
        startDate: entrada,
        endDate: saida,
        nif: nif(m.NIF),
        niss: null,
        phone: phoneE164(m.TMV) ?? phoneE164(m.Telefone),
        email: email(m.eMail),
        clinicIds: [clinic._id],
        userId: null,
        doctorId: null,
        initialSalaryCents: null,
        currentSalaryCents: null,
        socialSecurityRate: null,
        irsRate: null,
        schedule: null,
        benefits: null,
        raises: [],
        categoryChanges: [],
        warnings: [],
        notes: `Importado do Dentoral (código ${code}).`,
        active,
        createdByUserId: null,
        legacyData,
        createdAt: entrada ?? new Date('2010-01-01T00:00:00Z'),
      });
    }
  }

  log(`medicos: ${medicos.length} → ${doctors.length} Doctor, ${employees.length} Employee`);
  const sd: UpsertStats = { inserted: 0, updated: 0, skipped: 0 };
  const se: UpsertStats = { inserted: 0, updated: 0, skipped: 0 };
  await upsertByLegacyId(Doctor, doctors, args, sd);
  await upsertByLegacyId(Employee, employees, args, se);
  log('doctors', sd);
  log('employees', se);
  // valor de comissão por ato (ValTrat) e CodComissao ficam em legacyData —
  // a tabela 'comissao' do Dentoral tem 4 linhas; configurar à mão no CDC.
  void cents;
});
