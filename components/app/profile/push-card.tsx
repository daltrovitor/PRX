// Hello World
"use client";

import { Button, Notice } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { usePush } from "@/components/app/profile/use-push";

/**
 * Notificações no celular: com elas, o convite da Resenha, o Pix e as
 * liberações chegam mesmo com o app fechado. No iPhone só funciona com o app
 * instalado na tela de início (iOS 16.4+).
 */
export function PushCard() {
  const { showToast } = useConfirmToast();
  const { state, busy, error, enable, disable } = usePush();

  return (
    <section aria-labelledby="profile-push" className="space-y-4 rounded-3xl glass p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-md">
          <h2 id="profile-push" className="text-lg font-semibold tracking-[-0.02em] text-ink">
            Notificações no celular
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Convites da Resenha, Pix recebido e enviado e liberações chegam aqui mesmo com o app fechado.</p>
        </div>
        {state.kind === "off" && (
          <Button size="sm" onClick={() => void enable().then((ok) => ok && showToast("success", "Notificações ativadas neste celular."))} disabled={busy}>
            {busy ? "Ativando…" : "Ativar"}
          </Button>
        )}
        {state.kind === "on" && (
          <Button size="sm" variant="ghost" onClick={() => void disable()} disabled={busy}>
            Desativar
          </Button>
        )}
      </div>
      {state.kind === "on" && <p className="text-sm font-medium text-ink">Ativas neste aparelho.</p>}
      {state.kind === "unsupported" && <Notice tone="neutral">{state.reason}</Notice>}
      {state.kind === "blocked" && <Notice tone="warning">As notificações estão bloqueadas para a PRX neste aparelho. Libere nas configurações do navegador ou do celular e volte aqui.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
