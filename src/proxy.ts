// 📄 src/proxy.ts
// =============================================================================
// CDC Manager — Proxy de proteção de rotas (Edge Runtime)
// (Next 16 renomeou a convenção "middleware" para "proxy")
// =============================================================================

import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
