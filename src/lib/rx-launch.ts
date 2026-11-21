// 📄 src/lib/rx-launch.ts
// =============================================================================
// CDC Manager — Raio-X: abrir o paciente no software de imagem do posto
// -----------------------------------------------------------------------------
// Paridade com o Dentoral: a ficha do paciente abre esse paciente no iRYS
// (MyRay) ou no Kodak / CS Imaging (Carestream: sensores dos gabinetes e
// panorâmica). As imagens ficam onde estão; nada é importado.
//
// O CDC Manager é web, por isso não lança programas: constrói um endereço
// `cdcrx://` que o LANÇADOR instalado no posto (public/rx-agent) recebe,
// valida e converte na mesma linha de comandos que o Dentoral usa.
//
// Formatos confirmados no posto GABINETE4 a 19/11/2026 (captura das chamadas
// do Dentoral — projeto: raio-x/captura-pontes-gabinete-2026-11-19.md):
//
//   iRYS   NNTBridge.exe /PATID P0069163 /NAME "APELIDO" /SURNAME "NOME"
//          · PATID = "P" + n.º de processo com 7 dígitos (o PRXLink do Dentoral)
//          · /NAME leva o apelido e /SURNAME o nome próprio
//   Kodak  TW.exe -P<raiz>\<inicial>.RVG\<código> -N<NOME COMPLETO>
//          · <código> = pasta do paciente (tabela rx_kodak do Dentoral,
//            migrada para Patient.kodakFolder)
//
// Regra do nome no iRYS (confirmada a 19/11/2026 com um paciente de quatro
// nomes): o Dentoral envia só a primeira palavra (nome próprio) e a última
// (apelido); os nomes do meio não vão.
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

/** Nome próprio (1.ª palavra) e apelido (última) — regra do Dentoral */
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
 * Código de pasta normalizado (maiúsculas, sem caminho) ou null se não tiver
 * o formato do arquivo Carestream. Aceita o código simples ("j0002369") ou um
 * caminho que termine nele ("Z:\J.RVG\J0002369") — é o que a migração da
 * rx_kodak usa para limpar os valores do Dentoral.
 */
export function normalizeKodakFolder(raw: string | null | undefined): string | null {
  const last = (raw ?? '').trim().split(/[\\/]/).filter(Boolean).pop() ?? '';
  const code = last.toLocaleUpperCase('pt-PT');
  return KODAK_FOLDER.test(code) ? code : null;
}

/**
 * Endereço que abre o paciente no CS Imaging do posto, a partir do código
 * da pasta (ex.: "J0002369" → J.RVG\J0002369). null se o código for inválido.
 * A raiz (Z:\ nos gabinetes) é configuração do posto, não vai no endereço.
 */
export function kodakLaunchUrl(patient: {
  folder: string | null | undefined;
  name: string | null | undefined;
}): string | null {
  const raw = (patient.folder ?? '').trim();
  // Só o código simples: um caminho aqui seria um erro de quem chama
  const folder = /[\\/]/.test(raw) ? null : normalizeKodakFolder(raw);
  const name = rxCleanName(patient.name);
  if (!folder || !name) return null;
  const dir = `${folder[0]}.RVG\\${folder}`;
  return (
    `cdcrx://kodak/?dir=${encodeURIComponent(dir)}` +
    `&name=${encodeURIComponent(name)}`
  );
}
