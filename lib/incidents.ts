// Hello World
import crypto from "crypto";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth";
import { scrubText } from "@/lib/asaas/sanitize";
import { deployTag } from "@/lib/asaas/log";
import { TechnicalError, technicalErrorMessage } from "@/lib/error-messages";

/**
 * Ocorrências técnicas: cada erro que a pessoa não tem como resolver ganha um
 * código curto (ex.: BNK-7K3F9Q). A tela mostra só "Deu um erro ao fazer isso"
 * com o código; o detalhe (rota, ação, motivo sanitizado, deploy) vai para os
 * logs da Vercel (JSON "app.incident") e para a tabela app_incidents. O prefixo
 * diz a área: BNK banco, AUT login, ADM admin, PAR parceiro, LIV eventos…
 */

export interface Incident {
  code: string;
  createdAt: string;
  path: string | null;
  action: string;
  status: number;
  detail: string;
  userId: string | null;
  deploy: string;
}

const AREAS: ReadonlyArray<readonly [string, string]> = [
  ["/api/bank", "BNK"],
  ["/api/auth", "AUT"],
  ["/api/admin", "ADM"],
  ["/api/partner", "PAR"],
  ["/api/staff", "STF"],
  ["/api/live", "LIV"],
  ["/api/pass", "PAS"],
  ["/api/points", "PTS"],
  ["/api/family", "FAM"],
  ["/api/insider", "INS"],
  ["/api/resenha", "RES"],
  ["/api/incidents", "TEL"],
];

export function areaOf(path: string | null): string {
  return (path && AREAS.find(([prefix]) => path.startsWith(prefix))?.[1]) || "PRX";
}

/** Sem 0/O e 1/I: fácil de ditar e de digitar. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function incidentCode(area = "PRX"): string {
  return `${area}-${Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function describe(error: unknown): string {
  if (error instanceof TechnicalError) return error.detail;
  if (error instanceof Error) {
    const status = (error as { status?: unknown }).status;
    const code = (error as { code?: unknown }).code;
    const where = (error.stack ?? "").split("\n").slice(1, 4).map((l) => l.trim()).join(" | ");
    return `${error.name}${typeof status === "number" ? ` ${status}` : ""}${typeof code === "string" ? ` ${code}` : ""}: ${error.message}${where ? ` @ ${where}` : ""}`;
  }
  return String(error);
}

/** Últimas ocorrências na memória (desenvolvimento ou tabela ainda não criada). */
const recent = ((globalThis as { __prxIncidents?: Incident[] }).__prxIncidents ??= []);

async function requestPath(): Promise<string | null> {
  try {
    return (await headers()).get("x-prx-path");
  } catch {
    return null;
  }
}

function writeLine(incident: Incident): void {
  if ((process.env.PRX_BANK_LOG ?? "").trim().toLowerCase() === "off") return;
  try {
    process.stderr.write(`${JSON.stringify({ ts: incident.createdAt, level: "error", scope: "prx-app", event: "app.incident", ...incident })}\n`);
  } catch {
    // sem saída: fica a tabela
  }
}

/** Registra a ocorrência e devolve o código e a frase para a tela. Nunca lança. */
export async function reportIncident(error: unknown, action: string, extra: { status?: number; userId?: string | null; path?: string | null } = {}): Promise<{ code: string; message: string }> {
  const path = extra.path ?? (await requestPath());
  // Quem estava logado (id interno), para o suporte achar o membro; sem sessão, fica vazio.
  const userId = extra.userId !== undefined ? extra.userId : ((await getCurrentUser().catch(() => null))?.id ?? null);
  const incident: Incident = {
    code: incidentCode(areaOf(path)),
    createdAt: new Date().toISOString(),
    path: path?.slice(0, 200) ?? null,
    action: scrubText(action).slice(0, 200),
    status: extra.status ?? (error instanceof TechnicalError ? error.status : 500),
    detail: scrubText(describe(error)).slice(0, 2000),
    userId: userId && UUID.test(userId) ? userId : null,
    deploy: deployTag(),
  };
  writeLine(incident);
  recent.unshift(incident);
  recent.length = Math.min(recent.length, 200);
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("app_incidents").insert({
        code: incident.code,
        created_at: incident.createdAt,
        path: incident.path,
        action: incident.action,
        status: incident.status,
        detail: incident.detail,
        user_id: incident.userId,
        deploy: incident.deploy,
      });
    } catch {
      // tabela ainda não criada: fica a linha nos logs da Vercel
    }
  }
  return { code: incident.code, message: technicalErrorMessage(incident.code) };
}

/** Resposta de erro técnico: frase simples com o código; o motivo fica nos logs. */
export async function incidentResponse(error: unknown, action: string, status?: number): Promise<NextResponse> {
  const finalStatus = status ?? (error instanceof TechnicalError ? error.status : 500);
  const { code, message } = await reportIncident(error, action, { status: finalStatus });
  return NextResponse.json({ error: message, code }, { status: finalStatus });
}

/** Busca para o admin (o código que o membro informou). */
export async function findIncident(code: string): Promise<Incident | null> {
  const wanted = code.trim().toUpperCase();
  if (!/^[A-Z]{3}-[2-9A-Z]{6}$/.test(wanted)) return null;
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin.from("app_incidents").select("*").eq("code", wanted).maybeSingle();
    if (data) {
      const row = data as Record<string, unknown>;
      return {
        code: String(row.code),
        createdAt: String(row.created_at),
        path: (row.path as string | null) ?? null,
        action: String(row.action ?? ""),
        status: Number(row.status ?? 500),
        detail: String(row.detail ?? ""),
        userId: (row.user_id as string | null) ?? null,
        deploy: String(row.deploy ?? ""),
      };
    }
  }
  return recent.find((i) => i.code === wanted) ?? null;
}
