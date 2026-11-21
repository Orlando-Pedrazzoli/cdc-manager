import type { NextConfig } from "next";

// Domínio oficial da aplicação. O endereço técnico da Vercel
// (cdc-manager.vercel.app) continua a existir, mas ninguém deve trabalhar
// nele: a sessão (cookie) é por domínio e os links dos emails apontam para
// o domínio oficial. Quem lá chegar (email antigo, favorito) é reencaminhado,
// mantendo o caminho e os parâmetros (ex.: /ativar?codigo=…&email=…).
// Ficam de fora /api (cron da Vercel, webhooks) e os ficheiros do Next.
const CANONICAL_ORIGIN = "https://www.cdcclinicas.com";
const VERCEL_HOST = "cdc-manager.vercel.app";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path((?!api/|_next/).*)",
        has: [{ type: "host", value: VERCEL_HOST }],
        destination: `${CANONICAL_ORIGIN}/:path`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
