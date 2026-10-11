// Hello World
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Autorização de Entrada de Menor · PRX LIVE",
  description: "Termo digital de autorização de responsável legal para entrada de menor de idade em evento da plataforma PRX.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AutorizacaoLayout({ children }: { children: ReactNode }) {
  return children;
}
