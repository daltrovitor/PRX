// Hello World
import type { Metadata } from "next";
import { TeaserPage } from "@/components/marketing/teaser/teaser-page";
import { TEASER_URL } from "@/lib/domains";

export const metadata: Metadata = {
  title: "PRX · O futuro não se assiste. Se constrói. Em breve em prx.app.br",
  description: "A PRX chega em breve: conta digital, benefícios, eventos, investimentos, saúde mental e conexões num só ecossistema para as gerações Z e Alpha. Entre na Lista de Espera VIP.",
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
  return <TeaserPage />;
}
