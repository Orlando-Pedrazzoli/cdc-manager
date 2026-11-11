// 📄 src/lib/provisional-patient.ts
// =============================================================================
// CDC Manager — Pré-marcação sem ficha (5.ª ronda/13, Victor, nov. 2026)
// -----------------------------------------------------------------------------
// "Muitos pacientes que ligam pela primeira vez ainda não têm ficha." A
// receção regista só o nome, o apelido e o telemóvel; fica criada uma ficha
// PROVISÓRIA (Patient.provisional = true) com nº de processo, para a
// marcação nunca ficar sem paciente — o resto do sistema (lembretes, sala de
// espera, cobrança) continua a funcionar sem casos especiais. A marca sai
// quando a ficha completa é gravada.
// =============================================================================

import Patient from '@/models/Patient';

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}

/** "ana  maria" + "SILVA" → "Ana Maria Silva" não: mantém o que a receção
 *  escreveu, só limpa espaços (a ficha migrada do Dentoral está em
 *  maiúsculas e a receção escreve como quer). */
export function provisionalName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();
}

/** Ficha já existente com o mesmo telemóvel (para avisar antes de duplicar) */
export async function findPatientByPhone(
  phone: string,
): Promise<{ id: string; name: string; processNumber: number } | null> {
  const p = await Patient.findOne({ phone, status: { $ne: 'anonymized' } })
    .sort({ processNumber: -1 })
    .select('name processNumber')
    .lean();
  return p
    ? { id: String(p._id), name: p.name, processNumber: p.processNumber }
    : null;
}

export async function createProvisionalPatient(input: {
  firstName: string;
  lastName: string;
  phone: string; // já normalizado (E.164)
  referralSource?: string | null;
  referralDetail?: string | null;
}): Promise<{ id: string; name: string; processNumber: number }> {
  const name = provisionalName(input.firstName, input.lastName);
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await Patient.findOne()
      .sort({ processNumber: -1 })
      .select('processNumber');
    try {
      const created = await Patient.create({
        processNumber: (last?.processNumber ?? 0) + 1,
        name,
        phone: input.phone,
        // Sem consentimentos: ninguém assinou nada — os lembretes por
        // email/WhatsApp só arrancam depois de a ficha estar completa
        consents: {},
        referralSource: input.referralSource ?? null,
        referralDetail: input.referralDetail ?? null,
        provisional: true,
        status: 'active',
      });
      return {
        id: String(created._id),
        name,
        processNumber: created.processNumber,
      };
    } catch (err) {
      if (isDuplicateKeyError(err) && attempt < 2) continue;
      throw err;
    }
  }
  throw new Error('Não foi possível criar a ficha provisória.');
}
