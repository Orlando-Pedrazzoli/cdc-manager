// 📄 src/lib/provisional-patient.ts
// =============================================================================
// CDC Manager — Pré-marcação sem ficha (5.ª ronda/13, Victor, nov. 2026)
// -----------------------------------------------------------------------------
// "Muitos pacientes que ligam pela primeira vez ainda não têm ficha." A
// receção regista só o nome, o apelido e o telemóvel; fica criada uma ficha
// PROVISÓRIA (Patient.provisional = true), para a marcação nunca ficar sem
// paciente — o resto do sistema (lembretes, sala de espera, cobrança)
// continua a funcionar sem casos especiais. A marca sai quando a ficha
// completa é gravada.
//
// 6.ª ronda/01 (Victor, nov. 2026): a ficha provisória NÃO tem nº de
// processo ("pode acontecer de a pessoa não vir à consulta"). O número é
// atribuído em updatePatientAction, quando a ficha completa é gravada.
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
): Promise<{ id: string; name: string; processNumber: number | null } | null> {
  const p = await Patient.findOne({ phone, status: { $ne: 'anonymized' } })
    .sort({ processNumber: -1 })
    .select('name processNumber')
    .lean();
  return p
    ? { id: String(p._id), name: p.name, processNumber: p.processNumber ?? null }
    : null;
}

export async function createProvisionalPatient(input: {
  firstName: string;
  lastName: string;
  phone: string; // já normalizado (E.164)
  referralSource?: string | null;
  referralDetail?: string | null;
}): Promise<{ id: string; name: string; processNumber: null }> {
  const name = provisionalName(input.firstName, input.lastName);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await Patient.create({
        processNumber: null, // 6.ª ronda/01: só com a ficha completa
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
        processNumber: null,
      };
    } catch (err) {
      if (isDuplicateKeyError(err) && attempt < 2) continue;
      if (isDuplicateKeyError(err)) {
        // Índice único antigo (não parcial) em processNumber: rejeita a 2.ª
        // ficha sem número. Corrige-se uma vez por base com o script.
        console.error(
          '[pré-marcação] índice processNumber_1 antigo — correr scripts/fix-process-number-index.ts nesta base',
        );
      }
      throw err;
    }
  }
  throw new Error('Não foi possível criar a ficha provisória.');
}
