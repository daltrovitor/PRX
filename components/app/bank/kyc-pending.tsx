// Hello World
"use client";

import { useEffect, useState } from "react";
import { Button, Notice, Tag } from "@/components/app/ui";
import { DocumentPicker } from "@/components/family/document-picker";
import { postJson, uploadFamilyDocument } from "@/components/family/family-client";
import { SelfieCapture } from "@/components/app/bank/selfie-capture";
import { canUseBiometrics, registerPasskey } from "@/lib/passkeys/client";
import { readKnownAccount } from "@/lib/known-account";
import { IconLock } from "@/components/icons/prx-icons";
import { DOC_REVIEW_LABEL, type BankKycState, type IdentityDocumentItem } from "@/lib/kyc/types";
import type { DocumentRef } from "@/lib/family/types";

/**
 * Abertura salva e ainda não aprovada pela PRX. A etapa vem do servidor: a
 * pessoa vê o que já fez, o que a equipe está conferindo e, se algum documento
 * foi recusado, troca só aquele arquivo (nunca refaz a abertura inteira).
 */
export function KycPending({ kyc, onChanged }: { kyc: BankKycState; onChanged: () => Promise<void> | void }) {
  const waitingPeople = kyc.awaitingGuardian || kyc.awaitingEmancipation;
  const sent = kyc.submittedAt ? new Date(kyc.submittedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
  const toFix = kyc.documents.filter((d) => d.status === "rejected" || d.status === "missing");

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-32 sm:pb-36">
      <h1 className="ob-display text-[28px] text-ink sm:text-[40px]">PRX BANK</h1>
      <section className="glass space-y-5 rounded-[28px] p-6">
        <Tag tone={toFix.length > 0 ? "warning" : "neutral"}>{toFix.length > 0 ? "Falta um documento" : "Em análise"}</Tag>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{toFix.length > 0 ? "Envie de novo o que pedimos" : "Conta em análise"}</h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {toFix.length > 0
            ? "A equipe da PRX conferiu seus documentos e precisa que você troque o item abaixo. O resto continua salvo: você não refaz a abertura."
            : waitingPeople
              ? "Assim que a etapa abaixo for concluída, a equipe da PRX confere seus documentos. Você recebe o aviso aqui."
              : `Seus dados e documentos${sent ? `, enviados em ${sent},` : ""} estão salvos. A equipe da PRX confere sua identidade e, depois, a conta segue para a aprovação do banco. Você não precisa enviar nada de novo: o aviso chega aqui.`}
        </p>

        <ol className="space-y-2" aria-label="Etapas da abertura">
          <Stage done label="Dados e documentos enviados" />
          <Stage done={false} current label={toFix.length > 0 ? "Análise da PRX: aguardando o seu reenvio" : "Análise de identidade pela PRX"} />
          <Stage done={false} label="Aprovação da conta pelo banco" />
        </ol>

        {kyc.awaitingGuardian && <Notice tone="warning">Como você tem menos de 18 anos, seu responsável precisa aceitar o vínculo na Conta Pai dele. Peça para ele abrir a PRX e aprovar.</Notice>}
        {kyc.awaitingEmancipation && <Notice>Sua certidão de emancipação também está em análise.</Notice>}

        {kyc.documents.length > 0 && (
          <ul className="space-y-2" aria-label="Seus documentos">
            {kyc.documents.map((d) => (
              <DocumentRow key={d.kind} item={d} onChanged={onChanged} />
            ))}
          </ul>
        )}

        <Biometrics />
      </section>
    </div>
  );
}

function Stage({ label, done, current = false }: { label: string; done: boolean; current?: boolean }) {
  return (
    <li className="flex items-center gap-3 text-[14px]">
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${done ? "bg-primary text-white" : current ? "border-2 border-primary text-primary" : "border border-line text-muted-foreground"}`}
      >
        {done ? "✓" : ""}
      </span>
      <span className={done || current ? "text-ink" : "text-muted-foreground"}>
        {label}
        <span className="sr-only">{done ? " (concluída)" : current ? " (em andamento)" : " (próxima)"}</span>
      </span>
    </li>
  );
}

/** Um documento da abertura: situação, motivo da recusa e a troca só dele. */
function DocumentRow({ item, onChanged }: { item: IdentityDocumentItem; onChanged: () => Promise<void> | void }) {
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<DocumentRef | null>(null);
  const [busy, setBusy] = useState(false);
  const needsNew = item.status === "rejected" || item.status === "missing";

  async function send(ref: DocumentRef) {
    setBusy(true);
    setError(null);
    const res = await postJson<{ success: boolean }>("/api/bank/kyc/documents", { kind: item.kind, document: ref });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await onChanged();
  }

  return (
    <li className="space-y-3 rounded-2xl glass-soft px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-medium text-ink">{item.label}</p>
        <Tag tone={item.status === "approved" ? "success" : needsNew ? "warning" : "neutral"}>{item.status === "received" ? "Em análise" : DOC_REVIEW_LABEL[item.status]}</Tag>
      </div>
      {item.reason && <p className="text-[13px] text-muted-foreground">Motivo: {item.reason}</p>}
      {needsNew &&
        (item.kind === "selfie" ? (
          <SelfieCapture taken={false} label="Tirar a foto do rosto de novo" onCapture={async (photo) => send(await uploadFamilyDocument("selfie", photo))} />
        ) : (
          <div className="space-y-2">
            <DocumentPicker kind={item.kind} value={picked} onChange={setPicked} hint="Foto nítida, com as informações legíveis" />
            <Button className="min-h-12" disabled={!picked || busy} onClick={() => picked && void send(picked)}>
              {busy ? "Enviando…" : "Enviar este documento"}
            </Button>
          </div>
        ))}
      {error && <Notice tone="error">{error}</Notice>}
    </li>
  );
}

/** Oferece a biometria do aparelho enquanto a conta é analisada (uma vez por aparelho). */
function Biometrics() {
  const [canBio, setCanBio] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioDone, setBioDone] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const ok = await canUseBiometrics();
      const localAccepted = typeof window !== "undefined" && localStorage.getItem("prx_bank_biometrics_accepted") === "true";
      const known = readKnownAccount()?.passkey === true;
      if (localAccepted || known) {
        if (alive) setCanBio(false);
        return;
      }
      try {
        const res = await fetch("/api/auth/passkeys", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as { passkeys?: unknown[] };
          if (data.passkeys && data.passkeys.length > 0) {
            localStorage.setItem("prx_bank_biometrics_accepted", "true");
            if (alive) setCanBio(false);
            return;
          }
        }
      } catch {
        // Ignora falhas de rede na checagem
      }
      if (alive) setCanBio(ok);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function activate() {
    setBioBusy(true);
    setBioError(null);
    const res = await registerPasskey();
    setBioBusy(false);
    if (res.ok) {
      setBioDone(true);
      localStorage.setItem("prx_bank_biometrics_accepted", "true");
    } else {
      setBioError(res.error || "Não foi possível ativar neste momento.");
    }
  }

  if (bioDone) return <Notice tone="success">Sua biometria está ativada e pronta para proteger o PRX BANK neste aparelho.</Notice>;
  if (!canBio) return null;
  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-line bg-surface p-4 text-left">
      <div className="flex items-center gap-2 text-ink">
        <IconLock size={18} className="text-primary" />
        <p className="text-[14px] font-medium">Segurança biométrica do PRX BANK</p>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">Ative o Face ID, Touch ID ou a digital do aparelho para aprovar pagamentos Pix e acessar seu banco com rapidez e proteção.</p>
      {bioError && <Notice tone="error">{bioError}</Notice>}
      <Button size="sm" className="min-h-12 cursor-pointer" disabled={bioBusy} onClick={() => void activate()}>
        {bioBusy ? "Ativando…" : "Ativar biometria neste aparelho"}
      </Button>
    </div>
  );
}
