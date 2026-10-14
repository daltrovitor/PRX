// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocumentKind, DocumentRef } from "@/lib/family/types";
import type { FamilyState } from "@/lib/family/service";

/** Envia um documento para a pasta privada do usuário e devolve a referência para anexar ao pedido. */
export async function uploadFamilyDocument(kind: DocumentKind, file: File): Promise<DocumentRef> {
  const res = await fetch("/api/family/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
  });
  const json = (await res.json().catch(() => ({}))) as { mode?: "signed" | "direct"; signedUrl?: string; path?: string; error?: string };
  if (!res.ok) throw new Error(json.error || "Falha no envio do documento.");

  if (json.mode === "signed" && json.signedUrl && json.path) {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const put = await fetch(json.signedUrl, { method: "PUT", headers: { "x-upsert": "false", ...(anon ? { apikey: anon } : {}) }, body });
    if (!put.ok) throw new Error(`O envio foi recusado (${put.status}). Tente de novo.`);
    return { kind, path: json.path, name: file.name.slice(0, 160) };
  }

  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  const direct = await fetch("/api/family/uploads", { method: "POST", body: form });
  const data = (await direct.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!direct.ok || !data.path) throw new Error(data.error || "Falha no envio do documento.");
  return { kind, path: data.path, name: file.name.slice(0, 160) };
}

export async function postJson<T>(url: string, payload: unknown, method = "POST"): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string | null }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string | null };
    if (!res.ok) return { ok: false, error: json.error || "Não foi possível concluir.", code: json.code ?? null };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "Sem internet agora. Confira sua conexão e tente de novo." };
  }
}

/** Situação da conta na família (tipo, pendências, limites). null enquanto carrega. */
export function useFamilyState(userId: string | null) {
  // Guardado junto com o dono: ao trocar de conta, o estado da conta anterior nunca vale para a nova.
  const [stored, setStored] = useState<{ userId: string; state: FamilyState } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Sem dados de família (banco sem a migração ou falha de rede): o app segue sem as telas de família. */
  const [unavailableFor, setUnavailableFor] = useState<string | null>(null);
  const state = stored && stored.userId === userId ? stored.state : null;
  const unavailable = Boolean(userId) && unavailableFor === userId;

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/family/me", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { state?: FamilyState | null; unavailable?: boolean; error?: string };
      if (res.ok && json.unavailable) {
        setUnavailableFor(userId);
        return;
      }
      if (!res.ok || !json.state) throw new Error(json.error || "Não foi possível carregar sua conta.");
      setStored({ userId, state: json.state });
      setUnavailableFor(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
      setUnavailableFor(userId);
    }
  }, [userId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await reload();
    })();
    return () => {
      alive = false;
    };
  }, [reload]);

  return { state, error, unavailable, reload };
}
