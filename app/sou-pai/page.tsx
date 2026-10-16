// Hello World
import type { Metadata } from "next";
import { SitePage } from "@/components/marketing/site-chrome";
import { ParentOnboarding } from "@/components/family/parent-onboarding";

export const metadata: Metadata = {
  title: "Sou Pai · Conta Pai PRX",
  description: "Abra a Conta Pai: mesada automática, Pix para o seu filho, limites do cartão e acompanhamento de tudo o que ele faz na PRX.",
  alternates: { canonical: "/sou-pai" },
};

/** Área dos responsáveis: cadastro da Conta Pai em passos (dados, profissão e renda, filho, documentos). */
export default function SouPaiPage() {
  return (
    <SitePage cta={false}>
      <ParentOnboarding />
    </SitePage>
  );
}
