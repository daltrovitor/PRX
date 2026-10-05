// Hello World
import type { Metadata } from "next";
import { headers } from "next/headers";
import { InsiderApp } from "@/components/insider/insider-app";
import { baseUrlFor, resolveInsiderAuth, type InsiderAuthResult } from "@/lib/resenha/session";

export const metadata: Metadata = {
  title: "Insider",
  description: "Portal dos Insiders da Resenha: seu link, seus PASSes e os pedidos que chegaram por ele.",
  robots: { index: false, follow: false },
};

async function resolve(): Promise<InsiderAuthResult> {
  try {
    return await resolveInsiderAuth(baseUrlFor(await headers()));
  } catch {
    return { status: "denied", message: "Não foi possível abrir o portal agora. Tente de novo em instantes." };
  }
}

/** A sessão é verificada no servidor: o HTML já chega com o login ou com os pedidos. */
export default async function InsiderPage() {
  return <InsiderApp initial={await resolve()} />;
}
