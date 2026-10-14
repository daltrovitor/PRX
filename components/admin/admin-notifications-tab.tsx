// Hello World
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, EmptyState, Notice, Tag } from "@/components/app/ui";
import { IconRefresh } from "@/components/icons/prx-icons";
import { APP_HOST, isLocalHost } from "@/lib/domains";
import { emailErrorHint, senderDomain } from "@/lib/notifications/hints";
import type { DeliveryRecord, DeliveryResult, DeliveryStatus, NotificationTemplate } from "@/lib/notifications/types";

interface Overview {
  channels: { email: { configured: boolean; from: string }; whatsapp: { configured: boolean; template: string } };
  siteUrl: string;
  deliveries: DeliveryRecord[];
  logAvailable: boolean;
}

const TEMPLATE_LABEL: Record<NotificationTemplate, string> = {
  welcome_email: "Boas-vindas",
  phone_code: "Código do celular",
  resenha_list: "Você tá na lista (Resenha)",
  minor_event_authorization: "Liberação de menor (Evento)",
};

const STATUS: Record<DeliveryStatus, { label: string; tone: "success" | "neutral" | "warning" }> = {
  sent: { label: "Enviado", tone: "success" },
  simulated: { label: "Simulado", tone: "neutral" },
  skipped: { label: "Não enviado", tone: "warning" },
  failed: { label: "Falhou", tone: "warning" },
};

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Os links do e-mail devem levar ao app (teste.prx.app.br), não ao teaser nem a um endereço antigo. */
function siteUrlIsApp(siteUrl: string): boolean {
  try {
    const host = new URL(siteUrl).hostname;
    return host === APP_HOST || isLocalHost(host);
  } catch {
    return false;
  }
}

function Row({ title, tag, children }: { title: string; tag: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-[14px] text-ink">{title}</p>
        <div className="mt-0.5 break-words text-[13px] leading-relaxed text-muted-foreground">{children}</div>
      </div>
      {tag}
    </li>
  );
}

function TestOutcome({ result, from }: { result: DeliveryResult; from: string }) {
  if (result.status === "sent") {
    return (
      <Notice tone="success">
        O Resend aceitou o e-mail de teste. Confira a caixa de entrada e o spam do e-mail do admin. Se não chegar, o Resend → Emails mostra o que aconteceu com ele (delivered, bounced, suppressed…).
      </Notice>
    );
  }
  if (result.status === "simulated") return <Notice>Simulado: sem chave do provedor, nada saiu do servidor (só acontece em desenvolvimento).</Notice>;
  const detail = result.status === "skipped" ? result.reason : result.error;
  const hint = emailErrorHint(detail, from);
  return (
    <Notice tone={result.status === "skipped" ? "warning" : "error"}>
      {result.status === "skipped" ? "Não enviado: " : "O Resend recusou o envio: "}
      <span className="break-words">{detail}</span>
      {hint && <span className="mt-1 block font-medium">{hint}</span>}
    </Notice>
  );
}

/**
 * Notificações: mostra se o e-mail (Resend) e o WhatsApp estão ligados e o que aconteceu com cada
 * envio (boas-vindas, código do celular, Resenha). Quando um e-mail "não chega", a resposta está aqui.
 */
export function AdminNotificationsTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [outcome, setOutcome] = useState<DeliveryResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Partial<Overview> & { error?: string };
      if (!res.ok || !json.channels) throw new Error(json.error || "Não foi possível carregar as notificações.");
      setOverview({ channels: json.channels, siteUrl: json.siteUrl ?? "", deliveries: json.deliveries ?? [], logAvailable: json.logAvailable !== false });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  async function sendTest() {
    setTesting(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/admin/notifications", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { result?: DeliveryResult; error?: string };
      if (!json.result) throw new Error(json.error || "Não foi possível enviar o e-mail de teste.");
      setOutcome(json.result);
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setTesting(false);
    }
  }

  const email = overview?.channels.email;
  const whatsapp = overview?.channels.whatsapp;
  const from = email?.from ?? "";
  // "Enviado" só existe quando o Resend aceitou a chamada: prova que a chave vale e o domínio do remetente está verificado.
  const worked = overview?.deliveries.some((d) => d.channel === "email" && d.status === "sent") ?? false;
  const siteOk = overview ? siteUrlIsApp(overview.siteUrl) : false;

  return (
    <section aria-labelledby="notifications-title" className="glass space-y-5 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="notifications-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Notificações
        </h2>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading} aria-label="Atualizar a lista de envios">
          <IconRefresh size={16} />
          {loading ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {overview && (
        <ul className="divide-y divide-line">
          <Row title="E-mail (Resend): chave no servidor" tag={<Tag tone={email?.configured ? "success" : "warning"}>{email?.configured ? "Ligado" : "Sem chave"}</Tag>}>
            {email?.configured
              ? "A chave RESEND_API_KEY está no servidor."
              : 'Sem chave nenhum e-mail sai. No Resend: API Keys → Create API Key, permissão "Sending access". Depois, na Vercel: Settings → Environment Variables → RESEND_API_KEY, e um novo deploy.'}
          </Row>
          <Row title="Remetente" tag={<Tag tone={worked ? "success" : "neutral"}>{worked ? "Funcionou" : "Testar"}</Tag>}>
            {from}
            <br />O domínio {senderDomain(from) ?? "do remetente"} precisa estar &quot;Verified&quot; em Resend → Domains. O teste abaixo confirma.
          </Row>
          <Row title="Endereço dos links do e-mail" tag={<Tag tone={siteOk ? "success" : "warning"}>{siteOk ? "Ok" : "Corrigir"}</Tag>}>
            {overview.siteUrl || "não definido"}
            {!siteOk && (
              <>
                <br />O botão do e-mail leva para este endereço. Defina NEXT_PUBLIC_SITE_URL=https://{APP_HOST} na Vercel e faça um novo deploy.
              </>
            )}
          </Row>
          <Row title="Registro de envios" tag={<Tag tone={overview.logAvailable ? "success" : "warning"}>{overview.logAvailable ? "Ok" : "Corrigir"}</Tag>}>
            {overview.logAvailable
              ? "A lista abaixo mostra cada tentativa."
              : "A tabela notification_log não existe ou não pôde ser lida. Aplique supabase/migrations/20260930_prx_notifications.sql no Supabase (SQL Editor)."}
          </Row>
          <Row title="WhatsApp (código do celular)" tag={<Tag tone={whatsapp?.configured ? "success" : "warning"}>{whatsapp?.configured ? "Ligado" : "Desligado"}</Tag>}>
            {whatsapp?.configured ? `Modelo: ${whatsapp.template}` : "Sem token ou número: o código não é enviado."}
          </Row>
        </ul>
      )}

      <div className="space-y-3 rounded-2xl border border-line bg-surface/50 p-4">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Manda o e-mail de boas-vindas para o e-mail da sua conta de admin e mostra a resposta do Resend, com o que fazer se ele recusar. A chamada também aparece em Resend → Logs, com a
          resposta completa.
        </p>
        <Button size="sm" onClick={() => void sendTest()} disabled={testing || loading}>
          {testing ? "Enviando…" : "Enviar e-mail de teste para mim"}
        </Button>
        {outcome && <TestOutcome result={outcome} from={from} />}
      </div>

      <div>
        <h3 className="text-[15px] font-semibold text-ink">Últimos envios</h3>
        {overview && !overview.logAvailable && (
          <Notice tone="warning" className="mt-2">
            Sem o registro de envios, esta lista fica vazia mesmo com e-mails sendo enviados. Use o teste acima e o Resend → Logs para conferir.
          </Notice>
        )}
        {overview && overview.logAvailable && overview.deliveries.length === 0 && (
          <EmptyState
            title="Nenhum envio registrado"
            body="Cada cadastro, código do celular e aviso da Resenha aparece aqui, com o resultado do provedor. Se um cadastro novo não aparece, o envio não foi tentado (ou o registro falhou: veja os logs da Vercel)."
          />
        )}
        {overview && overview.deliveries.length > 0 && (
          <ul className="mt-2 divide-y divide-line">
            {overview.deliveries.map((d) => {
              const hint = d.channel === "email" ? emailErrorHint(d.error, from) : null;
              return (
                <li key={d.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-[14px] text-ink">
                      {TEMPLATE_LABEL[d.template] ?? d.template} <span className="text-muted-foreground">· {d.channel === "email" ? "e-mail" : "WhatsApp"}</span>
                    </p>
                    <p className="mt-0.5 break-words text-[13px] text-muted-foreground">
                      {d.recipient} · {when(d.createdAt)}
                    </p>
                    {d.error && <p className="mt-0.5 break-words text-[13px] leading-relaxed text-warning">{d.error}</p>}
                    {hint && <p className="mt-0.5 break-words text-[13px] leading-relaxed text-ink">{hint}</p>}
                  </div>
                  <Tag tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Tag>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
