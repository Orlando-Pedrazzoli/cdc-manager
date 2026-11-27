// 📄 src/lib/cobranca-filters.ts
// =============================================================================
// CDC Manager — Cobranças: abre no dia de hoje (ponto 24, Giulia, 27/11/2026)
// "Ao abrir a aba de cobranças, filtrar primeiro pela data de hoje. Facilita e
// evita erros de cobrança de outros dias e de outros pacientes."
// Regra pura (testada em scripts/tests/ronda-9c.test.ts):
//   · sem ano, mês nem dia no endereço → abre em hoje;
//   · com qualquer um deles no endereço, mesmo vazio ("Todos" escolhido no
//     filtro), respeita-se o que lá está;
//   · todos=1 → fila completa (ligações do painel e da conta-corrente, que
//     falam do total por cobrar, e o botão "Ver todos os dias").
// =============================================================================

export function cobrancaOpensToday(sp: {
  ano?: string;
  mes?: string;
  dia?: string;
  todos?: string;
}): boolean {
  if (sp.todos === '1') return false;
  return sp.ano === undefined && sp.mes === undefined && sp.dia === undefined;
}
