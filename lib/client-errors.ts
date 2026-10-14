// Hello World
import { technicalErrorMessage } from "@/lib/error-messages";

/**
 * Erros que só o navegador vê, no mesmo padrão dos erros do servidor: a tela
 * mostra "Deu um erro ao fazer isso" com um código, e o detalhe é registrado
 * (POST /api/incidents). Sem registro (sem internet, limite), o código é o
 * identificador da chamada na Vercel (x-vercel-id), achado nos logs.
 */

type Fetch = typeof window.fetch;

interface ClientIncident {
  kind: "render" | "request";
  path: string;
  status?: number;
  digest?: string;
  requestId?: string;
  message?: string;
}

/** Código curto a partir do x-vercel-id (o trecho final identifica a chamada nos logs). */
function requestCode(requestId: string | null | undefined): string {
  const tail = (requestId ?? "").split("-").pop()?.replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase();
  return `REQ-${tail || Date.now().toString(36).toUpperCase()}`;
}

/** Registra o erro e devolve a frase com o código. Nunca lança. */
export async function reportClientIncident(incident: ClientIncident, fetchImpl: Fetch = fetch): Promise<string> {
  try {
    const res = await fetchImpl("/api/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(incident) });
    const json = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (res.ok && typeof json.error === "string") return json.error;
  } catch {
    // sem registro: fica o identificador da chamada
  }
  return technicalErrorMessage(requestCode(incident.requestId));
}

declare global {
  interface Window {
    __prxApiErrorGuard?: boolean;
  }
}

/**
 * Quando a API do PRX cai sem responder JSON (ex.: tempo esgotado na Vercel),
 * cada tela mostraria o próprio texto genérico, sem código. Este guarda troca
 * essa resposta por { error: "Deu um erro… código X" }, que as telas já
 * mostram. Só mexe em /api/ do próprio site com status 5xx sem JSON.
 */
export function installApiErrorGuard(): void {
  if (typeof window === "undefined" || window.__prxApiErrorGuard) return;
  window.__prxApiErrorGuard = true;
  const original: Fetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    try {
      if (res.status < 500 || (res.headers.get("content-type") ?? "").includes("application/json")) return res;
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || url.pathname === "/api/incidents") return res;
      const message = await reportClientIncident({ kind: "request", path: url.pathname, status: res.status, requestId: res.headers.get("x-vercel-id") ?? undefined }, original);
      return new Response(JSON.stringify({ error: message }), { status: res.status, headers: { "Content-Type": "application/json" } });
    } catch {
      return res;
    }
  };
}
