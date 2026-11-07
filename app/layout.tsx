// Hello World
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Barlow, Bricolage_Grotesque, Inter, JetBrains_Mono, Roboto, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { APP_URL } from "@/lib/domains";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider, ThemeScript } from "@/components/theme-provider";
import { ConfirmToastProvider } from "@/components/ui/confirm-toast";
import { PwaRegister } from "@/components/pwa-register";
import { ApiErrorGuard } from "@/components/api-error-guard";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/* Títulos da landing (mantidos como estão). */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "600", "700"],
  display: "swap",
  // Só a landing usa: sem preload nas demais páginas (Inter é a única fonte crítica).
  preload: false,
});

/* Display editorial do app. */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
  preload: false,
});

/* Tipografia monumental Cyber-Luxury Obsidian (manifesto, rótulos em caixa alta). */
const barlow = Barlow({
  subsets: ["latin"],
  variable: "--font-obsidian",
  weight: ["300", "400", "500", "600"],
  display: "swap",
  preload: false,
});

/* Roboto Light: nome do perfil, níveis, PRX Coins e "Abra sua conta digital". */
const robotoLight = Roboto({
  subsets: ["latin"],
  variable: "--font-light",
  weight: "300",
  display: "swap",
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || APP_URL),
  title: {
    default: "PRX · Next is Yours",
    template: "%s · PRX",
  },
  description:
    "PRX reúne benefícios, conta digital e eventos para as gerações Z e Alpha. PRX PASS, PRX BANK e PRX LIVE em um app. Build. Don't bet.",
  applicationName: "PRX",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "PRX",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "PRX",
    title: "PRX · Next is Yours",
    description: "Benefícios, conta digital e eventos para as gerações Z e Alpha, em um app.",
  },
  twitter: {
    card: "summary",
    title: "PRX · Next is Yours",
    description: "Benefícios, conta digital e eventos para as gerações Z e Alpha, em um app.",
  },
};

// Zoom bloqueado (pedido do produto): o app se comporta como app nativo, sem pinça nem duplo toque.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050508",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={cn("dark h-full antialiased", inter.variable, spaceGrotesk.variable, bricolage.variable, barlow.variable, robotoLight.variable, jetbrainsMono.variable)}
    >
      <head>
        <ThemeScript />
        {/* nosemgrep: prx-dangerous-html — script 100% estático do próprio código; nenhum dado externo entra aqui. */}
        <script
          // O Safari do iPhone ignora user-scalable=no: a pinça é barrada pelos eventos de gesto e de dois dedos.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stop=function(e){e.preventDefault();};['gesturestart','gesturechange','gestureend'].forEach(function(t){document.addEventListener(t,stop,{passive:false});});document.addEventListener('touchmove',function(e){if(e.touches&&e.touches.length>1)e.preventDefault();},{passive:false});}catch(_){}})();`,
          }}
        />
        {/* nosemgrep: prx-dangerous-html — script 100% estático do próprio código; nenhum dado externo entra aqui. */}
        <script
          // Guarda o convite de instalação do Chrome antes do React carregar: no celular ele chega
          // cedo e, perdido, deixava o app sem botão de instalar (só o passo a passo).
          dangerouslySetInnerHTML={{
            __html: `(function(){try{window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__prxInstallPrompt=e;window.dispatchEvent(new Event('prx-installprompt'));});}catch(_){}})();`,
          }}
        />
        {/* nosemgrep: prx-dangerous-html — script 100% estático do próprio código (silencia o console em produção); nenhum dado externo entra aqui. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var noop=function(){};var w=typeof window!=="undefined"?window:globalThis;var c=w.console||{};var m=['log','info','warn','debug','error','table','trace','dir','group','groupCollapsed','groupEnd','time','timeEnd','timeLog','assert','clear','count','countReset'];for(var i=0;i<m.length;i++){try{Object.defineProperty(c,m[i],{value:noop,writable:true,configurable:true});}catch(_){c[m[i]]=noop;}}w.console=c;}catch(_){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground">
        <PwaRegister />
        <ThemeProvider>
          <AuthProvider>
            <ConfirmToastProvider>{children}</ConfirmToastProvider>
            <ApiErrorGuard />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
