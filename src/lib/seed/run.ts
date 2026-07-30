// 📄 src/lib/seed/run.ts
// =============================================================================
// CDC Manager — Runner do seed
// Uso:  npx tsx --env-file=.env.local src/lib/seed/run.ts
// =============================================================================

import { dbConnect } from '@/lib/mongodb';
import '@/models'; // regista todos os schemas
import { seedClinics } from './clinics';
import { seedTreatmentTypes } from './treatment-types';
import { seedDoctors } from './doctors';
import { seedPatients } from './patients';

async function main() {
  console.log('CDC Manager — seed a iniciar…');
  await dbConnect();
  await seedClinics();
  await seedTreatmentTypes();
  await seedDoctors();
  await seedPatients();
  console.log('Seed concluído com sucesso.');
  process.exit(0);
}

main().catch(err => {
  console.error('Seed falhou:', err);
  process.exit(1);
});
