// Hello World
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RequestForm } from "@/components/resenha/request-form";
import { ResenhaShell } from "@/components/resenha/resenha-shell";
import { PartnerError } from "@/lib/partners/errors";
import { publicEdition, type PublicEditionView } from "@/lib/resenha/service";

type Props = { params: Promise<{ edition: string }>; searchParams: Promise<{ i?: string | string[] }> };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

async function load(slug: string, code: string | null): Promise<PublicEditionView | null> {
  try {
    return await publicEdition(slug, code);
  } catch (error) {
    if (error instanceof PartnerError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const view = await load((await params).edition, first((await searchParams).i));
  const title = view ? `${view.edition.title} · ${view.edition.slug}` : "Resenha · PRX";
  const description = "Toda resenha tem uma história. Essa tem uma lista.";
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description } };
}

/** A lista da Resenha: o convidado chega pelo link de um Insider e pede acesso. */
export default async function ResenhaPage({ params, searchParams }: Props) {
  const code = first((await searchParams).i);
  const view = await load((await params).edition, code);
  if (!view) notFound();
  return (
    <ResenhaShell>
      <RequestForm view={view} code={code} />
    </ResenhaShell>
  );
}
