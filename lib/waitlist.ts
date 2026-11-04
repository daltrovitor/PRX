// Hello World
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/client";
import { dbError, isMissingColumn } from "@/lib/partners/errors";
import { MIN_ACCOUNT_AGE, UNDER_AGE_MESSAGE } from "@/lib/family/types";

/**
 * Lista de Espera VIP do prx.app.br (pré-cadastro). Guarda só o necessário
 * (e-mail, nome, celular, idade e o momento do consentimento) e nunca revela se
 * o e-mail já estava na lista: a resposta é sempre a mesma.
 */

export const waitlistSchema = z.object({
  // Na ordem do formulário: o primeiro erro que o visitante vê é o do primeiro campo.
  name: z.string().trim().min(2, "Informe seu nome.").max(80, "Nome muito longo."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(120)
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Informe um e-mail válido."),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((d) => d.length === 10 || d.length === 11, "Informe o celular com DDD."),
  age: z
    .number({ error: "Informe sua idade." })
    .int("Informe sua idade em anos.")
    .min(MIN_ACCOUNT_AGE, UNDER_AGE_MESSAGE)
    .max(120, "Informe uma idade válida."),
  consent: z.literal(true, { error: "Autorize o contato para entrar na lista." }),
});

/** Um lead da Lista VIP como o painel admin mostra. `consentAt` é o aceite de contato (LGPD). */
export interface WaitlistEntry {
  email: string;
  name?: string | null;
  /** Só dígitos (DDD + número). Vazio nos leads antigos, que deixaram só o e-mail. */
  phone?: string | null;
  age?: number | null;
  source: string;
  createdAt: string;
  consentAt: string;
}

interface MemoryLead {
  name: string;
  phone: string;
  age: number;
  source: string;
  createdAt: string;
}

const globalState = globalThis as unknown as { __prxWaitlist?: Map<string, MemoryLead> };
const memory = (): Map<string, MemoryLead> => (globalState.__prxWaitlist ??= new Map());

export async function joinWaitlist(input: z.output<typeof waitlistSchema>, source = "prx.app.br"): Promise<void> {
  const db = supabaseAdmin;
  if (db) {
    const insert = (row: Record<string, unknown>) => db.from("waitlist_signups").upsert(row, { onConflict: "email", ignoreDuplicates: true });
    const base = { email: input.email, name: input.name, source };
    let { error } = await insert({ ...base, phone: input.phone, age: input.age });
    // Migração 20261104_prx_waitlist_prereg.sql ainda não aplicada: o lead não se perde,
    // entra com e-mail e nome e celular/idade só passam a ser gravados depois dela.
    if (isMissingColumn(error)) ({ error } = await insert(base));
    if (error) throw dbError(error, "Não foi possível entrar na lista agora");
    return;
  }
  if (!memory().has(input.email)) memory().set(input.email, { name: input.name, phone: input.phone, age: input.age, source, createdAt: new Date().toISOString() });
}

export function waitlistMemorySize(): number {
  return memory().size;
}

interface WaitlistRow {
  email: string;
  name: string | null;
  phone?: string | null;
  age?: number | null;
  source: string | null;
  consent_at: string | null;
  created_at: string;
}

const BASE_COLUMNS = "email, name, source, consent_at, created_at";

/**
 * Leads da Lista VIP para o painel admin, do mais recente ao mais antigo:
 * Supabase (quando configurado) somado à memória do servidor, sem e-mails repetidos.
 * O cadastro exige o aceite, então todo lead tem `consentAt`.
 */
export async function getWaitlistSignups(): Promise<WaitlistEntry[]> {
  const byEmail = new Map<string, WaitlistEntry>();
  const db = supabaseAdmin;
  if (db) {
    const load = (columns: string) => db.from("waitlist_signups").select(columns).order("created_at", { ascending: false }).limit(5000);
    let { data, error } = await load(`${BASE_COLUMNS}, phone, age`);
    if (isMissingColumn(error)) ({ data, error } = await load(BASE_COLUMNS));
    if (error) throw dbError(error, "Não foi possível carregar a lista de espera");
    for (const r of (data ?? []) as unknown as WaitlistRow[]) {
      byEmail.set(r.email, {
        email: r.email,
        name: r.name,
        phone: r.phone ?? null,
        age: r.age ?? null,
        source: r.source || "prx.app.br",
        createdAt: r.created_at,
        consentAt: r.consent_at || r.created_at,
      });
    }
  }
  for (const [email, lead] of memory()) {
    if (!byEmail.has(email)) byEmail.set(email, { email, name: lead.name || null, phone: lead.phone, age: lead.age, source: lead.source, createdAt: lead.createdAt, consentAt: lead.createdAt });
  }
  return [...byEmail.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
