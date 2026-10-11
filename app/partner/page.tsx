// Hello World
import type { Metadata } from "next";
import { PartnerApp, type PartnerAuthResult } from "@/components/partner/partner-app";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Portal do parceiro",
  description: "Validação de vouchers PRX PASS e ingressos PRX LIVE nos estabelecimentos parceiros.",
  robots: { index: false, follow: false },
};

async function resolvePartner(): Promise<PartnerAuthResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: "unauthenticated", user: null };
    const view = { id: user.id, email: user.email, name: user.fullName, role: user.role };
    return user.role === "partner" ? { status: "authenticated", user: view } : { status: "wrong_role", user: view };
  } catch {
    return { status: "unauthenticated", user: null };
  }
}

/** A sessão é verificada no servidor: o HTML já chega com o login ou com o validador. */
export default async function PartnerPage() {
  return <PartnerApp initial={await resolvePartner()} />;
}
