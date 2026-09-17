// 📄 src/lib/seed/organization.ts
// =============================================================================
// CDC Manager — Seed: Organização (idempotente)
// -----------------------------------------------------------------------------
// Cria o registo singleton com os valores que estavam hardcoded no código
// (DEFAULT_BRAND). Corre uma vez por instalação; nunca sobrescreve o que o
// administrador já editou em Configurações → Organização.
// Também preenche shortName/color das clínicas Colombo/Buraca se estiverem
// vazios (as cores que as pastilhas sempre tiveram).
// =============================================================================

import Organization, { DEFAULT_BRAND } from '@/models/Organization';
import Clinic from '@/models/Clinic';

export async function seedOrganization(): Promise<void> {
  const existing = await Organization.findOne();
  if (!existing) {
    const { id: _id, ...fields } = DEFAULT_BRAND;
    void _id;
    await Organization.create(fields);
    console.log(
      `✔ Organização: ${DEFAULT_BRAND.name} (${DEFAULT_BRAND.appName})`,
    );
  } else {
    console.log(`· Organização já existe: ${existing.name}`);
  }

  // Identidade visual das clínicas históricas — só onde estiver vazio
  const legacy: Record<string, { shortName: string; color: string }> = {
    colombo: { shortName: 'Colombo', color: '#1B2A6B' },
    buraca: { shortName: 'Buraca', color: '#5B2E91' },
  };
  for (const [slug, v] of Object.entries(legacy)) {
    const r = await Clinic.updateOne(
      { slug, $or: [{ shortName: null }, { shortName: { $exists: false } }] },
      { $set: { shortName: v.shortName, color: v.color } },
    );
    if (r.modifiedCount)
      console.log(`✔ Clínica ${slug}: nome curto e cor definidos`);
  }
  // Clínica principal: Colombo (era o default hardcoded) — só se nenhuma o for
  const hasDefault = await Clinic.exists({ isDefault: true });
  if (!hasDefault) {
    const r = await Clinic.updateOne(
      { slug: 'colombo' },
      { $set: { isDefault: true } },
    );
    if (r.modifiedCount)
      console.log('✔ Clínica colombo marcada como principal');
  }
}
