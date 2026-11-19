// 📄 src/lib/rx-launch.ts
// =============================================================================
// CDC Manager — Raio-X: abrir o paciente no software de imagem do posto
// -----------------------------------------------------------------------------
// Paridade com o Dentoral: a ficha do paciente abre esse paciente no iRYS
// (MyRay, intraoral) ou no CS Imaging (Carestream, panorâmica). As imagens
// ficam onde estão; nada é importado.
//
// O CDC Manager é web, por isso não lança programas: constrói um endereço
// `cdcrx://` que o LANÇADOR instalado no posto (scripts/rx-agent) recebe,
// valida e converte na mesma linha de comandos que o Dentoral usa.
//
// Formatos confirmados no posto GABINETE4 a 19/11/2026 (captura das chamadas
// do Dentoral — projeto: raio-x/captura-pontes-gabinete-2026-11-19.md):
//
//   iRYS   NNTBridge.exe /PATID P0069163 /NAME "APELIDO" /SURNAME "NOME"
//          · PATID = "P" + n.º de processo com 7 dígitos (o PRXLink do Dentoral)
//          · /NAME leva o apelido e /SURNAME o nome próprio
//   Kodak  TW.exe -P<raiz>\<inicial>.RVG\<código> -N<NOME COMPLETO>
//          · <código> = pasta do paciente (tabela rx_kodak do Dentoral)
//
// POR CONFIRMAR: a regra com que o Dentoral parte o nome completo. Nos
// ficheiros antigos da ponte cada parte tem uma só palavra; aqui usa-se a
// primeira palavra (nome próprio) e a última (apelido).
//
// Módulo puro (sem imports do projeto) — testado em scripts/tests.
// =============================================================================

/** Caracteres aceites pelo lançador num nome (o resto é descartado) */
const NAME_DROP = /[^\p{L}\p{M} .'-]/gu;
const NAME_MAX = 60;

/** Nome limpo, em maiúsculas, como o Dentoral o envia às pontes */
export function rxCleanName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFC')
    .replace(NAME_DROP, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('pt-PT')
    .slice(0, NAME_MAX)
    .trim();
}

/** Nome próprio (1.ª palavra) e apelido (última) — ver nota POR CONFIRMAR */
export function rxSplitName(
  name: string | null | undefined,
): { first: string; last: string } | null {
  const words = rxCleanName(name).split(' ').filter(Boolean);
  if (words.length === 0) return null;
  return { first: words[0], last: words[words.length - 1] };
}

/** "P" + n.º de processo com 7 dígitos; null se não houver número válido */
export function irysPatId(processNumber: number | null | undefined): string | null {
  if (processNumber == null || !Number.isInteger(processNumber)) return null;
  if (processNumber < 1 || processNumber > 9_999_999) return null;
  return `P${String(processNumber).padStart(7, '0')}`;
}

/**
 * Endereço que abre o paciente no iRYS do posto. null quando a ficha não
 * tem n.º de processo (pré-marcação) ou nome utilizável — sem botão.
 */
export function irysLaunchUrl(patient: {
  processNumber: number | null | undefined;
  name: string | null | undefined;
}): string | null {
  const patid = irysPatId(patient.processNumber);
  const parts = rxSplitName(patient.name);
  if (!patid || !parts) return null;
  return (
    `cdcrx://irys/?patid=${patid}` +
    `&name=${encodeURIComponent(parts.last)}` +
    `&surname=${encodeURIComponent(parts.first)}`
  );
}

/** Código de pasta do CS Imaging: inicial (letra, dígito ou "(") + 7 dígitos */
const KODAK_FOLDER = /^[\p{L}\d(]\d{7}$/u;

/**
 * Endereço que abre o paciente no CS Imaging do posto, a partir do código
 * da pasta (ex.: "J0002369" → J.RVG\J0002369). null se o código for inválido.
 * A raiz (Z:\ nos gabinetes) é configuração do posto, não vai no endereço.
 */
export function kodakLaunchUrl(patient: {
  folder: string | null | undefined;
  name: string | null | undefined;
}): string | null {
  const folder = (patient.folder ?? '').trim().toLocaleUpperCase('pt-PT');
  const name = rxCleanName(patient.name);
  if (!KODAK_FOLDER.test(folder) || !name) return null;
  const dir = `${folder[0]}.RVG\\${folder}`;
  return (
    `cdcrx://kodak/?dir=${encodeURIComponent(dir)}` +
    `&name=${encodeURIComponent(name)}`
  );
}
