// Hello World
"use client";

import { useState } from "react";
import { Button, Field, Notice, Sheet, Textarea } from "@/components/app/ui";
import { ImagePicker, useImageUpload } from "@/components/admin/image-picker";
import { TemporaryCredential } from "@/components/admin/admin-partner-access";
import { ImportReview } from "@/components/admin/admin-partner-import-review";
import { createBenefitsStep, createPartnerStep, type BenefitFailure, type PartnerStepResult } from "@/components/admin/admin-partner-import-run";
import { onlyDigits } from "@/lib/partners/documents";
import { draftIssues, parseImport, type ImportDraft } from "@/lib/partners/import-parse";
import type { Partner } from "@/lib/partners/types";

type Stage = "input" | "review" | "done";
type Outcome = PartnerStepResult & { reused: boolean; created: number; failed: BenefitFailure[] };

const PARTNER_PLACEHOLDER = `Dados da empresa
• Nome fantasia ...
• Razão social ...
• CNPJ ...

Quem assina o contrato
• Nome completo ...
• CPF ...
• Cargo ...
• E-mail ...
• Telefone ...

Acesso ao Portal do Parceiro
• Qual e-mail você quer usar para fazer login: ...`;

const BENEFITS_PLACEHOLDER = "Um benefício por linha.\nTítulo: descrição\nOutro benefício: o que o membro ganha";

/**
 * Cadastro rápido: cola o modelo do parceiro, a lista de benefícios e a imagem;
 * confere a prévia e cria parceiro, login e benefícios de uma vez.
 */
export function AdminPartnerImport({ existing, onFinished }: { existing: ReadonlyArray<Partner>; onFinished: (partner: Partner) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("input");
  const [partnerText, setPartnerText] = useState("");
  const [benefitsText, setBenefitsText] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const banner = useImageUpload(setBannerUrl, setError);
  const logo = useImageUpload(setLogoUrl, setError);

  const digits = draft ? onlyDigits(draft.document) : "";
  const twin = digits.length >= 11 ? existing.find((p) => p.document === digits) : undefined;
  const issues = draft ? draftIssues(draft) : [];
  const uploading = banner.busy || logo.busy;

  function start() {
    setStage("input");
    setPartnerText("");
    setBenefitsText("");
    setBannerUrl("");
    setLogoUrl("");
    setDraft(null);
    setOutcome(null);
    setError(null);
    setOpen(true);
  }

  function check() {
    setError(null);
    setDraft(parseImport(partnerText, benefitsText));
    setStage("review");
  }

  async function confirm() {
    if (!draft || issues.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const step: PartnerStepResult = twin ? { partner: twin, credential: null, linked: false } : await createPartnerStep(draft, { logoUrl, bannerUrl });
      const { created, failed } = await createBenefitsStep(step.partner.id, draft.categoryId, draft.benefits);
      setOutcome({ ...step, reused: Boolean(twin), created, failed });
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir agora.");
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    if (!draft || !outcome) return;
    setBusy(true);
    const keys = new Set(outcome.failed.map((f) => f.key));
    const again = await createBenefitsStep(outcome.partner.id, draft.categoryId, draft.benefits.filter((b) => keys.has(b.key)));
    setOutcome({ ...outcome, created: outcome.created + again.created, failed: again.failed });
    setBusy(false);
  }

  async function finish() {
    const partner = outcome?.partner;
    setOpen(false);
    if (partner) await onFinished(partner);
  }

  const count = draft?.benefits.length ?? 0;
  const footer =
    stage === "input" ? (
      <Button block disabled={!partnerText.trim() || uploading} onClick={check}>
        {uploading ? "Enviando imagem…" : "Conferir"}
      </Button>
    ) : stage === "review" ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={busy} onClick={() => setStage("input")}>
          Voltar
        </Button>
        <Button disabled={busy || issues.length > 0} onClick={() => void confirm()}>
          {busy ? "Criando…" : twin ? `Adicionar ${count} benefício(s) a ${twin.tradeName}` : `Criar parceiro e ${count} benefício(s)`}
        </Button>
      </div>
    ) : (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {outcome && outcome.failed.length > 0 && (
          <Button variant="secondary" disabled={busy} onClick={() => void retryFailed()}>
            {busy ? "Tentando…" : `Tentar de novo (${outcome.failed.length})`}
          </Button>
        )}
        <Button disabled={busy} onClick={() => void finish()}>
          Abrir parceiro
        </Button>
      </div>
    );

  return (
    <>
      <Button variant="secondary" onClick={start}>
        Importar parceiro
      </Button>
      <Sheet
        open={open}
        onClose={() => (stage === "done" ? void finish() : setOpen(false))}
        size="lg"
        title="Importar parceiro"
        description="Cole os dados do parceiro e a lista de benefícios, envie a imagem e confira antes de criar."
        footer={footer}
      >
        {stage === "input" && (
          <div className="space-y-5">
            <Field label="Dados do parceiro" hint="O modelo de cadastro preenchido pelo parceiro.">
              {(id, d) => <Textarea id={id} aria-describedby={d} rows={11} value={partnerText} onChange={(e) => setPartnerText(e.target.value)} placeholder={PARTNER_PLACEHOLDER} />}
            </Field>
            <Field label="Benefícios" hint="Uma linha por benefício; linhas repetidas viram um só.">
              {(id, d) => <Textarea id={id} aria-describedby={d} rows={7} value={benefitsText} onChange={(e) => setBenefitsText(e.target.value)} placeholder={BENEFITS_PLACEHOLDER} />}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <ImagePicker label="Imagem de capa" value={bannerUrl} busy={banner.busy} onChange={(e) => banner.upload(e, "banner")} />
              <ImagePicker label="Logo (opcional, quadrado)" value={logoUrl} busy={logo.busy} onChange={(e) => logo.upload(e, "logo")} square />
            </div>
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        )}

        {stage === "review" && draft && (
          <div className="space-y-5">
            <ImportReview draft={draft} setDraft={setDraft} twin={twin} issues={issues} />
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        )}

        {stage === "done" && outcome && (
          <div className="space-y-5">
            <Notice tone={outcome.failed.length > 0 ? "warning" : "success"}>
              {outcome.reused ? "Benefícios adicionados a" : "Parceiro criado:"} <strong>{outcome.partner.tradeName}</strong>. {outcome.created} benefício(s) criado(s)
              {outcome.failed.length > 0 ? `, ${outcome.failed.length} com erro.` : "."}
            </Notice>
            {outcome.credential && <TemporaryCredential email={outcome.credential.email} password={outcome.credential.password} />}
            {outcome.linked && <Notice>Este e-mail já tinha conta PRX: ela foi vinculada como login do parceiro, com a senha que já usa.</Notice>}
            {outcome.failed.length > 0 && (
              <ul className="space-y-1 rounded-2xl bg-surface p-3 text-[13px] text-ink">
                {outcome.failed.map((f) => (
                  <li key={f.key}>
                    <strong>{f.title}</strong>: {f.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
