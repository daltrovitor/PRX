// Hello World

/** Chamadas do painel às rotas /api/admin: a mensagem do servidor vira o erro mostrado no toast. */
const OFFLINE = "Sem internet agora. Confira sua conexão e tente de novo.";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new Error(OFFLINE);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || "Não foi possível concluir agora.");
  return json;
}

export const adminGet = <T>(url: string) => call<T>(url);

export const adminPost = <T>(url: string, body: unknown) => call<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const errorText = (err: unknown) => (err instanceof Error ? err.message : OFFLINE);

/** CNPJ com máscara: 11.222.333/0001-81. */
export const formatCnpj = (d: string) => (d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d);
