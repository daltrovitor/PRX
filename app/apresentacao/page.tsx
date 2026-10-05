// Hello World
import type { Metadata } from "next";
import { PrxPresentation } from "@/components/show/prx-presentation";
import { SHOW_URL } from "@/lib/domains";

const DESCRIPTION =
  "Finanças. Oportunidades. Experiências. Conexões. Futuro. O ecossistema PRX para a próxima geração: Pass, Car, Home, Bank, Invest, Founders, Level, Live, Me e Circle.";

export const metadata: Metadata = {
  title: { absolute: "PRX · The ecosystem for the next generation" },
  description: DESCRIPTION,
  alternates: { canonical: SHOW_URL },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "PRX",
    url: SHOW_URL,
    title: "PRX · The ecosystem for the next generation",
    description: DESCRIPTION,
  },
};

/** Apresentação do ecossistema PRX, servida na raiz de show.prx.app.br (proxy.ts). */
export default function PresentationPage() {
  return <PrxPresentation />;
}
