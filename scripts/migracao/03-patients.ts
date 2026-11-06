// 📄 scripts/migracao/03-patients.ts
// =============================================================================
// Passo 3 — paciente (+ segsoc, autoriza) → Patient
//
// · processNumber = PMecano (continuidade do nº de processo)
// · legacyId      = `dentoral:${PMecano}`
// · Fotos (PFoto) NÃO são lidas aqui (6,4 GB) — ver 10-photos.ts
// · Campos sem lugar no modelo vão para legacyData (nº beneficiário, titular,
//   BI/CC, flags de pagamento, autorizações de contacto, etc.)
// · Consentimentos: o Dentoral regista autorizações SEM data → não se inventa
//   uma data de consentimento; ficam em legacyData.autoriza para a clínica
//   confirmar no fluxo RGPD do CDC (P10).
// · Estado civil: 'Solteiro' é o default do Dentoral (99,8 %) → só se migra
//   quando é outro valor.
// =============================================================================

import { runScript, q, pageByKey, str, yn, nif, postalCode, phoneE164, email, lisbonDate, log, progress, upsertByLegacyId, loadLegacyMap, type UpsertStats } from './lib/common';

type Pac = Record<string, any>;

const MARITAL: Record<string, string> = { Casado: 'casado', Divorciado: 'divorciado', Viuvo: 'viuvo' };

await runScript('03-patients', async args => {
  const { Patient, Doctor } = await import('@/models');

  const doctorMap = await loadLegacyMap(Doctor);
  const profissa = new Map((await q<{ PFCod: number; PFNome: string }>('SELECT PFCod, PFNome FROM profissa')).map(r => [Number(r.PFCod), str(r.PFNome, 80)]));
  const nac = new Map((await q<{ NacCod: number; NacDesc: string }>('SELECT NacCod, NacDesc FROM nacionalidade')).map(r => [Number(r.NacCod), str(r.NacDesc, 60)]));
  const segsoc = new Map<number, { NumSSoc: string | null; CentroSaude: string | null; CodCartao: string | null }>();
  for (const r of await q<any>('SELECT Pac, CodCartao, NumSSoc, CentroSaude FROM segsoc')) segsoc.set(Number(r.Pac), r);
  const autoriza = new Map<number, any>();
  for (const r of await q<any>('SELECT * FROM autoriza')) autoriza.set(Number(r.Pac), r);

  const [{ n: total }] = await q<{ n: number }>('SELECT COUNT(*) n FROM paciente');
  log(`paciente: ${total} linhas; segsoc ${segsoc.size}; autoriza ${autoriza.size}`);

  const stats: UpsertStats = { inserted: 0, updated: 0, skipped: 0 };
  let done = 0;
  const t0 = Date.now();

  const sql = `
    SELECT PMecano, PNome, PProcesso, PDiaProces, PMorada, PLocalid, PCodPos, PNascim, PTlfEmpr, PTlfCasa,
           PContrib, PBenefi, PTitular, PEntidade, PProfis, PMascul, PECivil, PFilhos, PPai, PMae,
           PApresent, PUltCons, PEmail, PCorresp, PMeses, PMedico, PMemoObs, PIndicadoPor, PTMovel,
           PTitulo, PNumBI, PDataBI, PPayWarning, PIsento, MotivoConsulta, PFalecido, PNacionalidade,
           PBloqueado, PAnonimo, pValidadeCC, RefClinica,
           (PFoto IS NOT NULL AND LENGTH(PFoto) > 0) AS temFoto
    FROM paciente WHERE PMecano > ? ORDER BY PMecano LIMIT ?`;

  for await (const rows of pageByKey<Pac>(sql, r => Number(r.PMecano), args.batch)) {
    const docs: Record<string, any>[] = [];
    for (const p of rows) {
      if (done >= args.limit) break;
      done++;
      const mecano = Number(p.PMecano);
      const ss = segsoc.get(mecano);
      const aut = autoriza.get(mecano);
      const birth = lisbonDate(p.PNascim);
      const created = lisbonDate(p.PDiaProces) ?? lisbonDate(p.PApresent) ?? new Date('2010-01-01T00:00:00Z');
      const anonymized = yn(p.PAnonimo);
      const deceased = yn(p.PFalecido);
      const mobile = phoneE164(p.PTMovel);
      const home = phoneE164(p.PTlfCasa);
      const work = phoneE164(p.PTlfEmpr);
      const sns = String(ss?.NumSSoc ?? '').replace(/\D/g, '');
      const notesParts = [str(p.PMemoObs), str(p.MotivoConsulta) ? `Motivo consulta (Dentoral): ${str(p.MotivoConsulta)}` : null, yn(p.PPayWarning) ? 'AVISO PAGAMENTO (Dentoral)' : null].filter(Boolean);

      docs.push({
        legacyId: `dentoral:${mecano}`,
        processNumber: mecano,
        name: anonymized ? `Paciente anonimizado ${mecano}` : (str(p.PNome, 160) ?? `Paciente ${mecano}`),
        birthDate: birth,
        nif: anonymized ? null : nif(p.PContrib),
        sex: p.PMascul === 'Feminino' ? 'F' : p.PMascul === 'Masculino' ? 'M' : null,
        snsNumber: /^\d{9}$/.test(sns) ? sns : null,
        homePhone: home ?? work ?? null,
        emergencyContact: { name: null, phone: null },
        insurance: { company: null, cardNumber: null },
        relatives: [],
        phone: anonymized ? null : (mobile ?? home ?? work ?? null),
        email: anonymized ? null : email(p.PEmail),
        address: {
          street: anonymized ? null : str(p.PMorada, 200),
          postalCode: postalCode(p.PCodPos),
          city: str(p.PLocalid, 80),
        },
        profession: profissa.get(Number(p.PProfis)) ?? null,
        maritalStatus: MARITAL[String(p.PECivil)] ?? null,
        nationality: nac.get(Number(p.PNacionalidade)) ?? null,
        referredBy: str(p.PIndicadoPor, 120),
        deceasedAt: deceased ? (lisbonDate(p.PUltCons) ?? created) : null,
        photoPublicId: null,
        preferredChannel: mobile ? 'sms' : 'phone',
        preferredDoctorId: doctorMap.get(`dentoral:${Number(p.PMedico)}`) ?? null,
        notes: notesParts.length ? notesParts.join('\n').slice(0, 2000) : null,
        consents: { dataProcessingAt: null, remindersAt: null, marketingAt: null, gdprSignedAt: null, gdprDocumentId: null },
        status: anonymized ? 'anonymized' : yn(p.PBloqueado) ? 'inactive' : 'active',
        anonymizedAt: anonymized ? created : null,
        legacyData: {
          processo: str(p.PProcesso),
          titulo: str(p.PTitulo),
          beneficiario: str(p.PBenefi),
          titular: str(p.PTitular),
          entidade: Number(p.PEntidade),
          profissaoCod: Number(p.PProfis),
          filhos: Number(p.PFilhos),
          pai: str(p.PPai),
          mae: str(p.PMae),
          apresentacao: p.PApresent,
          ultimaConsulta: p.PUltCons,
          correspondencia: p.PCorresp,
          meses: Number(p.PMeses),
          medicoCod: Number(p.PMedico),
          numBI: anonymized ? null : str(p.PNumBI),
          dataBI: p.PDataBI,
          validadeCC: p.pValidadeCC,
          payWarning: yn(p.PPayWarning),
          isento: yn(p.PIsento),
          bloqueado: yn(p.PBloqueado),
          temFoto: Number(p.temFoto) === 1,
          telefonesRaw: { movel: str(p.PTMovel), casa: str(p.PTlfCasa), empresa: str(p.PTlfEmpr) },
          nifRaw: nif(p.PContrib) ? null : str(p.PContrib),
          codPostalRaw: postalCode(p.PCodPos) ? null : str(p.PCodPos),
          segsoc: ss ? { numSSoc: str(ss.NumSSoc), centroSaude: str(ss.CentroSaude), codCartao: str(ss.CodCartao) } : null,
          autoriza: aut ? { sms: yn(aut.aut_SMS), email: yn(aut.aut_email), tel: yn(aut.aut_tel), correio: yn(aut.aut_correio), noticias: yn(aut.info_noticias), newsletters: yn(aut.info_NewsLetters), campanhas: yn(aut.info_Campanhas), inqueritos: yn(aut.info_Inqueritos), marcacoes: yn(aut.info_marcacoes) } : null,
        },
        createdAt: created,
      });
    }
    await upsertByLegacyId(Patient, docs, args, stats);
    progress('patients', done, Number(total), t0);
    if (done >= args.limit) break;
  }
  console.log();
  log('patients', stats);
});
