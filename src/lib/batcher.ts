// 📄 src/lib/batcher.ts
// =============================================================================
// CDC Manager — Agrupador de pedidos (padrão "DataLoader")
// -----------------------------------------------------------------------------
// Vários pedidos individuais feitos quase ao mesmo tempo saem numa ÚNICA
// chamada. Usado na tradução dos títulos das Novidades: cada título tem a
// sua cache; os que faltam juntam-se num só pedido ao tradutor.
// `run` recebe as chaves pela ordem de chegada e devolve os valores pela
// mesma ordem. Se falhar (ou devolver tamanho errado), todos os pedidos
// desse lote falham — quem chama decide o que fazer.
// =============================================================================

export function createBatcher<K, V>(
  run: (keys: K[]) => Promise<V[]>,
  options: { windowMs?: number; maxSize?: number } = {},
): (key: K) => Promise<V> {
  const windowMs = options.windowMs ?? 40;
  const maxSize = options.maxSize ?? 50;
  type Item = { key: K; resolve: (v: V) => void; reject: (e: unknown) => void };
  let queue: Item[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const batch = queue;
    queue = [];
    if (batch.length === 0) return;
    run(batch.map(i => i.key)).then(
      values => {
        if (!Array.isArray(values) || values.length !== batch.length) {
          const err = new Error('lote devolveu um número errado de valores');
          batch.forEach(i => i.reject(err));
          return;
        }
        batch.forEach((i, n) => i.resolve(values[n]));
      },
      err => batch.forEach(i => i.reject(err)),
    );
  };

  return key =>
    new Promise<V>((resolve, reject) => {
      queue.push({ key, resolve, reject });
      if (queue.length >= maxSize) flush();
      else if (!timer) timer = setTimeout(flush, windowMs);
    });
}
