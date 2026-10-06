// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Notice, Tag } from "@/components/app/ui";
import { IconRefresh } from "@/components/icons/prx-icons";
import type { DeliveryRecord, DeliveryResult, DeliveryStatus, NotificationTemplate } from "@/lib/notifications/types";

interface Overview {
  channels: { email: { configured: boolean; from: string }; whatsapp: { configured: boolean; template: string } };
  deliveries: DeliveryRecord[];
}

const TEMPLATE_LABEL: Record<NotificationTemplate, string> = {
  welcome_email: "Boas-vindas",
  phone_code: "Código do celular",
  resenha_list: "Você tá na lista (Resenha)",
};

const STATUS: Record<DeliveryStatus, { label: string; tone: "success" | "neutral" | "warning" }> = {
  sent: { label: "Enviado", tone: "success" },
  simulated: { label: "Simulado", tone: "neutral" },
  skipped: { label: "Não enviado", tone: "warning" },
  failed: { label: "Falhou", tone: "warning" },
};

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function TestOutcome({ result }: { result: DeliveryResult }) {
  if (result.status === "sent") return <Notice tone="success">O provedor aceitou o e-mail de teste. Confira a caixa de entrada e o spam do seu e-mail de admin.</Notice>;
  if (result.status === "simulated") return <Notice>Simulado: sem chave do provedor, nada saiu do servidor (só acontece em desenvolvimento).</Notice>;
  if (result.status === "skipped") return <Notice tone="warning">Não enviado: {result.reason}</Notice>;
  return <Notice tone="error">O provedor recusou o envio: {result.error}</Notice>;
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
      setOverview({ channels: json.channels, deliveries: json.deliveries ?? [] });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem conexão.");
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
      setError(err instanceof Error ? err.message : "Sem conexão.");
    } finally {
      setTesting(false);
    }
  }

  const email = overview?.channels.email;
  const whatsapp = overview?.channels.whatsapp;

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
          <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-[14px] text-ink">E-mail (Resend)</p>
              <p className="mt-0.5 break-words text-[13px] leading-relaxed text-muted-foreground">
                {email?.configured
                  ? `Remetente: ${email.from}`
                  : "Sem chave: nenhum e-mail sai. Defina RESEND_API_KEY na Vercel (Environment Variables), faça o redeploy e clique em Atualizar."}
              </p>
            </div>
            <Tag tone={email?.configured ? "success" : "warning"}>{email?.configured ? "Ligado" : "Sem chave"}</Tag>
          </li>
          <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-[14px] text-ink">WhatsApp (código do celular)</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                {whatsapp?.configured ? `Modelo: ${whatsapp.template}` : "Sem token ou número: o código não é enviado."}
              </p>
            </div>
            <Tag tone={whatsapp?.configured ? "success" : "warning"}>{whatsapp?.configured ? "Ligado" : "Desligado"}</Tag>
          </li>
        </ul>
      )}

      <div className="space-y-3 rounded-2xl border border-line bg-surface/50 p-4">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Manda o e-mail de boas-vindas para o e-mail da sua conta de admin e mostra a resposta do provedor. Se der erro, o texto diz o motivo (por exemplo, domínio do
          remetente não verificado no Resend).
        </p>
        <Button size="sm" onClick={() => void sendTest()} disabled={testing || loading}>
          {testing ? "Enviando…" : "Enviar e-mail de teste para mim"}
        </Button>
        {outcome && <TestOutcome result={outcome} />}
      </div>

      <div>
        <h3 className="text-[15px] font-semibold text-ink">Últimos envios</h3>
        {overview && overview.deliveries.length === 0 && (
          <EmptyState title="Nenhum envio registrado" body="Cada cadastro, código do celular e aviso da Resenha aparece aqui, com o resultado do provedor. Se um cadastro novo não aparece, o envio nem foi tentado." />
        )}
        {overview && overview.deliveries.length > 0 && (
          <ul className="mt-2 divide-y divide-line">
            {overview.deliveries.map((d) => (
              <li key={d.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-[14px] text-ink">
                    {TEMPLATE_LABEL[d.template] ?? d.template} <span className="text-muted-foreground">· {d.channel === "email" ? "e-mail" : "WhatsApp"}</span>
                  </p>
                  <p className="mt-0.5 break-words text-[13px] text-muted-foreground">
                    {d.recipient} · {when(d.createdAt)}
                  </p>
                  {d.error && <p className="mt-0.5 break-words text-[13px] leading-relaxed text-warning">{d.error}</p>}
                </div>
                <Tag tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Tag>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
