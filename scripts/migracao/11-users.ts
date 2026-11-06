// 📄 scripts/migracao/11-users.ts
// =============================================================================
// Passo 11 — lista de médicos ativos (Victor, 6 nov 2026) → Doctor.active +
// User (role 'doctor', status 'invited') ligado por doctorId.
//
// · Lê scripts/migracao/data/medicos-ativos.json (nome + email).
// · Faz match por nome contra os Doctors migrados (dentoral:<Codigo>):
//   normaliza acentos/maiúsculas e exige que TODOS os tokens do nome curto
//   da lista existam no nome do Dentoral (ex.: "Jerusa Teixeira Levandoski"
//   bate em "JERUSA TEIXEIRA LEVANDOSKI" ou "DRA JERUSA T. LEVANDOSKI" se
//   --loose). `dentoralCode` no JSON força o match (ex.: Jerusa tem 2 fichas).
//   Ambiguidades e não-encontrados são impressos para resolver à mão.
// · Doctors migrados que NÃO estão na lista ficam active=false (histórico
//   continua visível, mas não aparecem na agenda).
// · User criado só se não existir um com o mesmo email; sem password
//   (status 'invited' → o médico define a password pelo fluxo de ativação da
//   app). Nunca se apagam Users.
// Correr depois do 02-doctors. Flags: --dry-run, --loose (match por 2 tokens).
// =============================================================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runScript, log } from './lib/common';

type Entry = { name: string; email: string; title?: string; dentoralCode?: number };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\b(dr|dra|doutor|doutora)\b/g, '').split(/\s+/).filter(t => t.length > 1);

void runScript('11-users', async args => {
  const { Doctor, User } = await import('@/models');
  const loose = process.argv.includes('--loose');
  const list: Entry[] = JSON.parse(readFileSync(resolve('scripts/migracao/data/medicos-ativos.json'), 'utf8'));
  const doctors = await Doctor.find({ legacyId: /^dentoral:[1-9]/ }, { name: 1, legacyId: 1, active: 1 }).lean();
  log(`lista: ${list.length} médicos · doctors migrados: ${doctors.length}`);

  const matched = new Map<string, { doctor: any; entry: Entry }>();
  const unmatched: Entry[] = [];
  for (const e of list) {
    const toks = norm(e.name);
    const need = loose ? Math.min(2, toks.length) : toks.length;
    const hits = e.dentoralCode
      ? doctors.filter(d => d.legacyId === `dentoral:${e.dentoralCode}`)
      : doctors.filter(d => {
          const dn = norm(String(d.name));
          return toks.filter(t => dn.includes(t)).length >= need;
        });
    if (hits.length === 1) matched.set(String(hits[0]._id), { doctor: hits[0], entry: e });
    else {
      unmatched.push(e);
      log(hits.length ? `AMBÍGUO "${e.name}" → ${hits.map(h => `${h.legacyId} ${h.name}`).join(' | ')}` : `NÃO ENCONTRADO "${e.name}"`);
    }
  }
  log(`match: ${matched.size}/${list.length}`, { porResolver: unmatched.map(u => u.name) });

  let usersCreated = 0, usersExisting = 0, activated = 0, deactivated = 0;
  for (const d of doctors) {
    const m = matched.get(String(d._id));
    if (m) {
      if (!d.active) activated++;
      if (!args.dryRun) await Doctor.updateOne({ _id: d._id }, { $set: { active: true } }, { timestamps: false });
      const email = m.entry.email.toLowerCase().trim();
      const existing = await User.findOne({ email }, { _id: 1, doctorId: 1 }).lean();
      if (existing) {
        usersExisting++;
        if (!existing.doctorId && !args.dryRun) await User.updateOne({ _id: existing._id }, { $set: { doctorId: d._id } });
      } else {
        usersCreated++;
        const display = `${m.entry.title ? m.entry.title + ' ' : ''}${m.entry.name}`.slice(0, 120);
        if (!args.dryRun) await User.create({ name: display, email, role: 'doctor', status: 'invited', doctorId: d._id, clinicIds: [] });
      }
    } else {
      if (d.active) deactivated++;
      if (!args.dryRun) await Doctor.updateOne({ _id: d._id }, { $set: { active: false } }, { timestamps: false });
    }
  }
  log('resultado', { ativados: activated, desativados: deactivated, usersCriados: usersCreated, usersJaExistiam: usersExisting, porResolverManualmente: unmatched.length });
});
