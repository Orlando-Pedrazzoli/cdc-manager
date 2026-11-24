// 📄 scripts/tests/novidades.test.ts
// Correr: npx tsx scripts/tests/novidades.test.ts
import assert from 'node:assert/strict';
import { createBatcher } from '../../src/lib/batcher';

let n = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  n++;
  console.log(`  ✓ ${name}`);
};

async function main() {
  await test('lote: pedidos simultâneos saem numa só chamada, pela ordem', async () => {
    const calls: string[][] = [];
    const load = createBatcher<string, string>(
      async keys => {
        calls.push(keys);
        return keys.map(k => k.toUpperCase());
      },
      { windowMs: 5 },
    );
    const out = await Promise.all(['a', 'b', 'c'].map(load));
    assert.deepEqual(out, ['A', 'B', 'C']);
    assert.deepEqual(calls, [['a', 'b', 'c']]);
  });

  await test('lote: pedidos tardios vão num segundo lote', async () => {
    const calls: number[][] = [];
    const load = createBatcher<number, number>(
      async keys => {
        calls.push(keys);
        return keys.map(k => k * 2);
      },
      { windowMs: 5 },
    );
    const first = Promise.all([load(1), load(2)]);
    await new Promise(r => setTimeout(r, 25));
    const second = load(3);
    assert.deepEqual(await first, [2, 4]);
    assert.equal(await second, 6);
    assert.deepEqual(calls, [[1, 2], [3]]);
  });

  await test('lote: ao atingir o tamanho máximo sai logo', async () => {
    const calls: number[][] = [];
    const load = createBatcher<number, number>(
      async keys => {
        calls.push(keys);
        return keys;
      },
      { windowMs: 10_000, maxSize: 2 },
    );
    assert.deepEqual(await Promise.all([load(1), load(2)]), [1, 2]);
    assert.deepEqual(calls, [[1, 2]]);
  });

  await test('lote: falha rejeita todos e o lote seguinte funciona', async () => {
    let fail = true;
    const load = createBatcher<string, string>(
      async keys => {
        if (fail) throw new Error('quota');
        return keys;
      },
      { windowMs: 5 },
    );
    const r = await Promise.allSettled([load('a'), load('b')]);
    assert.deepEqual(
      r.map(x => x.status),
      ['rejected', 'rejected'],
    );
    fail = false;
    assert.equal(await load('c'), 'c');
  });

  await test('lote: tamanho errado na resposta rejeita o lote', async () => {
    const load = createBatcher<string, string>(async () => ['só um'], {
      windowMs: 5,
    });
    const r = await Promise.allSettled([load('a'), load('b')]);
    assert.deepEqual(
      r.map(x => x.status),
      ['rejected', 'rejected'],
    );
  });

  console.log(`\nnovidades: ${n} testes OK`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
