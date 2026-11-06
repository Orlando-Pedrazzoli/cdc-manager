# Migração Dentoral (MySQL 5.5 `drdata`) → CDC Manager (MongoDB Atlas)

Scripts TypeScript corridos com `tsx` a partir da raiz do projeto. Todos são **idempotentes**
(chave `legacyId`): podem correr-se várias vezes; só inserem o que falta. Com `--update`
reescrevem o que já existe.

## 1. Preparação (uma vez)

```powershell
npm i mysql2   # cloudinary e tsx já estão no projeto
```

`.env.local` (raiz do projeto) — acrescentar:

```
DENTORAL_MYSQL_URL=mysql://root@127.0.0.1:3308/drdata
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
```

`MONGODB_URI` já lá está (Atlas `cdc-manager`). **Aponta para o cluster certo antes de correr.**

MySQL local tem de estar a correr (terminal 1):

```powershell
& C:\cdc\mysql55-local\mysql\bin\mysqld.exe --defaults-file=C:\cdc\mysql55-local\my.ini --console
```

## 2. Ordem de execução

| # | Script | Origem → Destino | Volume | Tempo estimado |
|---|--------|------------------|--------|----------------|
| 00 | `00-setup.ts` | verifica ligações; cria utilizador-sistema, médico-placeholder, 2 tipos de ato legacy | — | segundos |
| 01 | `01-treatment-types.ts` | `tabelat` (Entidade 12) → `TreatmentType` (match por `dentoralCode`) | ~1.4k | segundos |
| 02 | `02-doctors.ts` | `medicos` + `agdconf` → `Doctor` / `Employee` | dezenas | segundos |
| 03 | `03-patients.ts` | `paciente` + `segsoc` + `autoriza` → `Patient` | 89 925 | 2–5 min |
| 04 | `04-appointments.ts` | `agenda` (com paciente) + `faltas` → `Appointment` | ~815k | 15–40 min |
| 05 | `05-procedures.ts` | `tratexec` → `Procedure` | ~640k | 10–30 min |
| 06 | `06-treatment-plans.ts` | `planotrat` + `orclivre` → `TreatmentPlan` (+ liga `Procedure.treatmentPlanId`) | 15k planos | 2–5 min |
| 07 | `07-clinical-records.ts` | `obsger` + `obsdent` + `anmtexto/anmtitulo` → `ClinicalRecord` | 164k notas | 5–10 min |
| 08 | `08-legacy-invoices.ts` | `ccorrentes` + `doclin` + `defdocs` + `ccconcilia` → `LegacyInvoice` | 329k | 10–20 min |
| 8b | `08b-concilia.ts` | `ccconcilia` → `LegacyInvoice.relatedLegacyIds` (recibo ↔ fatura) | 11.7k | segundos |
| 09 | `09-documents.ts` | `documents` + `documentspac` (BLOB) → Cloudinary + `Document` | 11k / 2.2 GB | horas (retomável) |
| 10 | `10-photos.ts` | `paciente.PFoto` → Cloudinary + `Patient.photoPublicId` | 77k | horas (retomável) |
| 11 | `11-users.ts` | `data/medicos-ativos.json` (lista do Victor) → `Doctor.active` + `User` (invited) | 22 | segundos |
| 99 | `99-verify.ts` | contagens MySQL vs Mongo, integridade, amostra | — | 1 min |

Correr sempre pela ordem. Primeiro **a seco e com limite**:

```powershell
npx tsx --env-file=.env.local scripts/migracao/00-setup.ts
npx tsx --env-file=.env.local scripts/migracao/01-treatment-types.ts --dry-run
npx tsx --env-file=.env.local scripts/migracao/03-patients.ts --dry-run --limit 200
```

Depois a sério, um de cada vez:

```powershell
npx tsx --env-file=.env.local scripts/migracao/00-setup.ts
npx tsx --env-file=.env.local scripts/migracao/01-treatment-types.ts
npx tsx --env-file=.env.local scripts/migracao/02-doctors.ts
npx tsx --env-file=.env.local scripts/migracao/03-patients.ts
npx tsx --env-file=.env.local scripts/migracao/04-appointments.ts
npx tsx --env-file=.env.local scripts/migracao/05-procedures.ts
npx tsx --env-file=.env.local scripts/migracao/06-treatment-plans.ts
npx tsx --env-file=.env.local scripts/migracao/07-clinical-records.ts
npx tsx --env-file=.env.local scripts/migracao/08-legacy-invoices.ts
npx tsx --env-file=.env.local scripts/migracao/08b-concilia.ts
npx tsx --env-file=.env.local scripts/migracao/11-users.ts
npx tsx --env-file=.env.local scripts/migracao/99-verify.ts
# BLOBs — só depois de ter a conta Cloudinary da clínica:
npx tsx --env-file=.env.local scripts/migracao/09-documents.ts --limit 50     # teste
npx tsx --env-file=.env.local scripts/migracao/09-documents.ts
npx tsx --env-file=.env.local scripts/migracao/10-photos.ts --limit 50        # teste
npx tsx --env-file=.env.local scripts/migracao/10-photos.ts
npx tsx --env-file=.env.local scripts/migracao/99-verify.ts
```

Flags comuns: `--dry-run` (não escreve) · `--limit N` · `--batch N` (default 2000) · `--update`
(reescreve existentes) · `--since AAAA-MM-DD` (04 e 09).

## 3. Repor e recomeçar (se for preciso)

Na base Atlas, apagar só o que veio do Dentoral:

```js
db.patients.deleteMany({ legacyId: /^dentoral:/ })
db.appointments.deleteMany({ legacyId: /^(agenda|faltas):/ })
db.procedures.deleteMany({ legacyId: /^tratexec:/ })
db.treatmentplans.deleteMany({ legacyId: /^(planotrat|orclivre):/ })
db.clinicalrecords.deleteMany({})          // só se ainda não houver registos novos
db.legacyinvoices.deleteMany({})
db.documents.deleteMany({ legacyId: /^documents:/ })
```

Os assets no Cloudinary ficam (os scripts 09/10 detetam-nos e não voltam a enviar).

## 4. Decisões tomadas

- **Tudo vai para a clínica `colombo`** (só `RefClinica=1` existe no Dentoral).
- **Histórico clínico e financeiro completo** (2010→) — obrigação legal de conservação (processo
  clínico; documentos fiscais 10 anos).
- **Faturação antiga é arquivo só-leitura** (`LegacyInvoice`) — nunca se reemite nem altera.
  Faturação nova sai do `Invoice` do CDC.
- **Consentimentos não são fabricados**: só os PDFs RGPD digitalizados (ItemNumber 4) entram
  como `Document` categoria `consent`; `Patient.consents` fica a `null` → a clínica recolhe de
  novo na app. Autorizações do Dentoral (`autoriza`) ficam em `legacyData`.
- **Agenda sem paciente (2.3M linhas)** = bloqueios/slots vazios → não migrada.
- **Ficha de anamnese nova (questionnaire)** não é preenchida — os 14 Sim/Não do Dentoral vão
  para `anamnesisNotes` + `legacyData.anamnese`; o paciente volta a preencher a ficha.
- **Odontograma** (tratexec `Inicial='Sim'`, toothstat) — fase 2.
- **Não migrados**: `log`, `sms`, `avisosagd`, `tabelatomd`, `salas` (centros de custo),
  `toothstat` (estado de UI), `listaespera` (fila de chamada do dia, não é lista de espera),
  `urgencias`, `pacalternativo`, `telefones` (já absorvidos na ficha), `tratrecall`.
- Médicos **sem `User`** (não têm email no Dentoral) — criar contas à mão na app.

## 5. Pressupostos a validar com o Victor

1. **Dias da semana em `agdconf`**: assumi `DiaSemana` 1 = segunda-feira.
2. **Bitmask de faces** (`tratexec.Face`, `doclin.Faces`): 1=O, 2=M, 4=D, 16=V, 32=L.
3. **`tratexec.SitFac`**: 0 por faturar, 1 faturado, 2 faturado parcial, 50 ?, 99 anulado.
4. **`obsger.Tipo`**: 22 = observação geral, 15 = alerta (vai com prefixo `[Alerta]`).
5. **`ccorrentes.TipPag`**: 1 dinheiro, 2 cheque, 3 multibanco.
6. **`defdocs`**: tipos 120–129 (série CL) — nomes/siglas são lidos da tabela se existir.
7. **`TipoAcesso` 5/6 ou `Cedula` preenchida** = médico; resto = funcionário.
8. `obsdent`, `anmtexto`, `anmtitulo`, `defdocs`, `ccconcilia` têm mapeamento **dinâmico**
   (o script imprime as colunas que escolheu no arranque — confirmar no log).

## 6. Depois da migração

- Atlas: subir para **Flex/M10** e ligar backups antes do go-live (M0 não tem backup).
- Rodar password `contacto_db_user` (ficou exposta num screenshot) e atualizar `.env.local` + Vercel.
- Criar `User` para cada médico/funcionário e ligar a `doctorId`/`employeeId`.
- Rever médicos-placeholder (`dentoral:0`): consultas/atos cujo código de médico não existe em `medicos`.
