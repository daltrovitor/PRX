// Hello World
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestStatus } from "@/components/resenha/guest-status";
import { ResenhaShell } from "@/components/resenha/resenha-shell";
import { PartnerError } from "@/lib/partners/errors";
import { guestView } from "@/lib/resenha/service";
import type { GuestView } from "@/lib/resenha/types";

export const metadata: Metadata = {
  title: "Seu pedido · Resenha",
  description: "Veja se o seu nome entrou na lista.",
  robots: { index: false, follow: false },
};

async function load(token: string): Promise<GuestView | null> {
  try {
    return await guestView(token);
  } catch (error) {
    if (error instanceof PartnerError && error.status === 404) return null;
    throw error;
  }
}

/** Página do pedido, protegida pelo token do link: quem tem o link vê o próprio ingresso. */
export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await load(token);
  if (!view) notFound();
  return (
    <ResenhaShell>
      <GuestStatus token={token} initial={view} />
    </ResenhaShell>
  );
}
