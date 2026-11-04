import type { NextConfig } from "next";

/**
 * A Vercel guarda as credenciais públicas do Supabase como URL / ANON_KEY
 * (sem o prefixo NEXT_PUBLIC_). Sem este mapeamento o bundle do navegador não
 * enxerga o Supabase e o login Google cai no fluxo simulado. A anon key é
 * pública por definição (protegida por RLS); a service role nunca é exposta.
 */
const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.URL || "";
const publicSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.ANON_KEY || "";

/**
 * Content-Security-Policy (pentest M1). Só em produção: o `next dev` precisa de
 * eval e websocket de HMR. 'unsafe-inline' em script/style é exigência dos
 * scripts de hidratação do Next sem nonce. Imagens e vídeos aceitam qualquer
 * https porque logos/capas de parceiros e CDN vêm de hosts variados; o login
 * Google é redirect no servidor, então não precisa de script nem iframe do Google.
 */
const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: cspHeader }] : []),
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicSupabaseAnonKey,
  },
  poweredByHeader: false,
  // Só estes hosts passam pelo otimizador (pentest M2). Manter igual a lib/media/image-hosts.ts;
  // imagens de outros hosts são renderizadas sem otimização (PrxImage / Avatar).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "cdn.prx.app.br" },
    ],
  },
  devIndicators: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
