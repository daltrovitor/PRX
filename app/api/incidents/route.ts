// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security";
import { clientIp } from "@/lib/partners/http";
import { getCurrentUser } from "@/lib/auth";
import { reportIncident } from "@/lib/incidents";

const schema = z.object({
  /** render: a tela quebrou; request: uma chamada à API falhou sem resposta legível. */
  kind: z.enum(["render", "request"]),
  path: z.string().trim().max(200).default(""),
  status: z.coerce.number().int().min(0).max(599).optional(),
  digest: z.string().trim().max(100).optional(),
  requestId: z.string().trim().max(120).optional(),
  message: z.string().trim().max(300).optional(),
});

/**
 * POST /api/incidents — erro que só a tela viu (página quebrou, servidor caiu
 * sem responder JSON). Gera o código que a tela mostra e guarda o detalhe como
 * os erros do servidor. Público e limitado por IP: não aceita código pronto.
 */
// nosemgrep: prx-mutation-route-without-auth — registro de erro da própria tela, sem efeito em dados do membro
export async function POST(req: NextRequest) {
  const rate = checkRateLimit(`incident_${clientIp(req) ?? "?"}`, 10, 60);
  // Limite estourado: a tela usa o próprio identificador da chamada.
  if (!rate.allowed) return NextResponse.json({ code: null }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos.", code: null }, { status: 400 });
  const data = parsed.data;
  const user = await getCurrentUser(req).catch(() => null);
  const detail = [
    data.kind === "render" ? "Tela quebrou no navegador" : "Chamada à API sem resposta legível",
    data.status !== undefined ? `HTTP ${data.status}` : null,
    data.digest ? `digest=${data.digest}` : null,
    data.requestId ? `x-vercel-id=${data.requestId}` : null,
    data.message ? `mensagem: ${data.message}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const { code, message } = await reportIncident(new Error(detail), data.kind === "render" ? `Tela: ${data.path}` : `Chamada: ${data.path}`, {
    status: data.status ?? 500,
    userId: user?.id ?? null,
    path: data.path.startsWith("/api") ? data.path : "/api/incidents",
  });
  return NextResponse.json({ error: message, code });
}
