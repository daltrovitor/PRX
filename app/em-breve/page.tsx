// Hello World
import type { Metadata } from "next";
import { ComingSoon } from "@/components/marketing/coming-soon";
import { TEASER_URL } from "@/lib/domains";

export const metadata: Metadata = {
  title: "PRX · O futuro não se assiste. Se constrói. Em breve em prx.app.br",
  description: "PRX: benefícios, conta digital, eventos e cultura para as gerações Z e Alpha. Entre na Lista de Espera VIP e seja avisado primeiro.",
  alternates: { canonical: TEASER_URL },
  openGraph: {
    title: "PRX · O futuro não se assiste. Se constrói.",
    description: "Em breve em prx.app.br. Entre na Lista de Espera VIP.",
    locale: "pt_BR",
    type: "website",
    url: TEASER_URL,
  },
};

export default function ComingSoonPage() {
  return <ComingSoon />;
}
