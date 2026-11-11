// 📄 src/lib/doctor-colors.ts
// =============================================================================
// CDC Manager — Cor de cada médico na agenda
// -----------------------------------------------------------------------------
// 4.ª ronda (Victor, nov. 2026), ponto 04: "os médicos aparecem quase todos
// com a mesma cor". Os médicos importados do Dentoral ficaram com a cor por
// omissão do modelo. Aqui:
//   · DOCTOR_PALETTE — cores fortes e distintas entre si, todas com contraste
//     suficiente para texto escuro por cima de um fundo a 20%;
//   · doctorColor() — a cor a mostrar: a que foi escolhida na ficha do médico
//     ou, se ainda tem a cor por omissão, uma da paleta (sempre a mesma para
//     o mesmo médico, sem tocar na base de dados);
//   · assignDistinctColors() — atribuição sem repetições enquanto a paleta
//     chegar; usada por scripts/assign-doctor-colors.ts para GRAVAR as cores.
// Sem mongoose: partilhado por server e client.
// =============================================================================

export const DEFAULT_DOCTOR_COLOR = '#2743A6';

export const DOCTOR_PALETTE = [
  '#00ACC1', // ciano (sem vermelho na paleta: o vermelho é das URGÊNCIAS)
  '#1976D2', // azul
  '#2E7D32', // verde
  '#F57C00', // laranja
  '#7B1FA2', // roxo
  '#00838F', // azul-petróleo
  '#C2185B', // magenta
  '#5D4037', // castanho
  '#AFB42B', // lima
  '#303F9F', // índigo
  '#00897B', // verde-água
  '#E64A19', // tijolo
  '#6D4C41', // café
  '#0277BD', // azul-céu escuro
  '#8E24AA', // violeta
  '#558B2F', // verde-azeitona
] as const;

const isDefault = (color: string | null | undefined) =>
  !color || color.toUpperCase() === DEFAULT_DOCTOR_COLOR;

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Cor a mostrar para um médico (escolhida na ficha, ou da paleta) */
export function doctorColor(id: string, stored: string | null | undefined): string {
  if (!isDefault(stored)) return stored as string;
  return DOCTOR_PALETTE[hash(id) % DOCTOR_PALETTE.length];
}

/**
 * Atribui cores sem repetição (enquanto a paleta chegar) aos médicos que
 * ainda têm a cor por omissão; quem já escolheu uma cor fica com ela.
 * Devolve só os que mudam: id → cor nova. A ordem de entrada decide quem
 * recebe primeiro (passar por ordem alfabética para ser previsível).
 */
export function assignDistinctColors(
  doctors: { id: string; color: string | null | undefined }[],
): Map<string, string> {
  const used = new Set(doctors.filter(d => !isDefault(d.color)).map(d => (d.color as string).toUpperCase()));
  const free = DOCTOR_PALETTE.filter(c => !used.has(c.toUpperCase()));
  const pool: string[] = free.length > 0 ? [...free] : [...DOCTOR_PALETTE];
  const out = new Map<string, string>();
  let i = 0;
  for (const d of doctors) {
    if (!isDefault(d.color)) continue;
    out.set(d.id, pool[i % pool.length]);
    i++;
  }
  return out;
}
