// 📄 src/lib/mongodb.ts
// =============================================================================
// CDC Manager — Conexão MongoDB (Mongoose 9) com cache global
// -----------------------------------------------------------------------------
// Em serverless (Vercel), cada invocação pode reutilizar o mesmo processo Node.
// Guardamos a conexão numa variável global para que hot-reloads em dev e
// invocações consecutivas em produção reutilizem a mesma ligação, em vez de
// abrir novas até esgotar o pool do Atlas.
//
// Uso em qualquer Server Action / Route Handler / página server:
//   import { dbConnect } from '@/lib/mongodb';
//   await dbConnect();
// =============================================================================

import mongoose from 'mongoose';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Extende o objeto global do Node para tipar a cache sem usar `any`
declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

global.mongooseCache = cached;

export async function dbConnect(): Promise<typeof mongoose> {
  // Já conectado → devolve imediatamente
  if (cached.conn) {
    return cached.conn;
  }

  // Validação lazy (dentro da função, não no top-level do módulo) para não
  // rebentar o `next build`, que importa módulos sem ter as env vars de runtime
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI não definida. Adiciona a variável ao .env.local (dev) ou às Environment Variables da Vercel (produção).',
    );
  }

  // Conexão em curso → aguarda a mesma promise (evita corrida entre requests)
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        // Sem buffering: se a conexão falhar, as queries falham imediatamente
        // com erro claro, em vez de ficarem penduradas 10s à espera
        bufferCommands: false,
        // Pool ajustado a serverless: poucas conexões por instância
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
      })
      .then(m => m)
      .catch(err => {
        // Falhou → limpa a promise para permitir nova tentativa no próximo request
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
