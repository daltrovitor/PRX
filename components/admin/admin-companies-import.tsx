// Hello World
"use client";

import { useState, type ChangeEvent } from "react";
import { Button, Notice, Sheet, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { adminPost, errorText, formatCnpj } from "@/components/admin/admin-api";
import { parsePasted, readCompaniesFile, type CompanyRow } from "@/lib/behaviors/sheet-parse";
import type { CompanyInput, ImportRun } from "@/lib/behaviors/types";

type Report = Omit<ImportRun, "id" | "createdAt"> & { id: string | null };

/**
 * Importação em lote: lê CSV/XLSX (ou a lista colada) aqui no navegador, o
 * servidor confere cada linha e devolve o relatório antes de gravar. Só
 * depois da conferência o admin confirma.
 */
export function AdminCompaniesImport({ onImported }: { onImported: () => Promise<void> | void }) {
  const { showToast } = useConfirmToast();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<{ run: Report; preview: CompanyInput[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRows(null);
    setReport(null);
    setError(null);
    setFileName("");
    setPasted("");
  }

  async function check(next: CompanyRow[], name: string) {
    setBusy(true);
    setError(null);
    try {
      setRows(next);
      setFileName(name);
      setReport(await adminPost<{ run: Report; preview: CompanyInput[] }>("/api/admin/behaviors/companies", { action: "import", fileName: name, rows: next, dryRun: true }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setError("Arquivo acima de 8 MB. Divida a planilha.");
    try {
      await check(await readCompaniesFile(file), file.name);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function confirm() {
    if (!rows) return;
    setBusy(true);
    try {
      const done = await adminPost<{ run: Report }>("/api/admin/behaviors/companies", { action: "import", fileName, rows, dryRun: false });
      showToast("success", `Importação concluída: ${done.run.created} nova(s) e ${done.run.updated} atualizada(s).`);
      setOpen(false);
      reset();
      await onImported();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const run = report?.run;
  return (
    <>
      <Button variant="secondary" onClick={() => (reset(), setOpen(true))}>
        Importar planilha
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Importar empresas"
        description="CSV ou XLSX com as colunas CNPJ, Razão social, Nome fantasia, Categoria e Chaves Pix (separe várias com |)."
        size="lg"
        footer={
          run ? (
            <Button block disabled={busy || run.created + run.updated === 0} onClick={() => void confirm()}>
              {busy ? "Importando…" : `Importar ${run.created + run.updated} empresa(s)`}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-5">
          <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[14px] text-ink hover:bg-surface">
            {busy && !run ? "Conferindo…" : "Escolher arquivo .csv ou .xlsx"}
            <input type="file" accept=".csv,.txt,.xlsx" className="sr-only" aria-label="Escolher planilha de empresas" onChange={(e) => void pick(e)} disabled={busy} />
          </label>
          <div className="space-y-2">
            <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4} placeholder={"Ou cole a lista, uma por linha:\n11.222.333/0001-81;Empresa Exemplo Ltda;Exemplo;mercado"} aria-label="Colar lista de empresas" />
            <Button variant="secondary" size="sm" disabled={busy || !pasted.trim()} onClick={() => void check(parsePasted(pasted), "Lista colada")}>
              Conferir lista colada
            </Button>
          </div>

          {error && <Notice tone="error">{error}</Notice>}

          {run && (
            <section aria-label="Relatório da conferência" className="space-y-3">
              <Notice tone={run.errors.length > 0 ? "warning" : "success"}>
                {run.total} linha(s) em {fileName}: {run.created} nova(s), {run.updated} para atualizar, {run.unchanged} igual(is), {run.duplicates} repetida(s) no arquivo, {run.errors.length} com
                erro. Nada foi gravado ainda.
              </Notice>
              {run.errors.length > 0 && (
                <ul className="max-h-48 space-y-0.5 overflow-auto rounded-2xl bg-surface p-3 text-[13px] text-muted-foreground">
                  {run.errors.slice(0, 200).map((e, i) => (
                    <li key={i}>
                      Linha {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              {report.preview.length > 0 && (
                <ul className="space-y-1 text-[13px] text-ink">
                  {report.preview.slice(0, 10).map((c) => (
                    <li key={c.cnpj}>
                      {formatCnpj(c.cnpj)} · {c.tradeName || c.legalName}
                      {c.category ? ` · ${c.category}` : ""}
                    </li>
                  ))}
                  {report.preview.length > 10 && <li className="text-muted-foreground">…e mais {report.preview.length - 10}</li>}
                </ul>
              )}
            </section>
          )}
        </div>
      </Sheet>
    </>
  );
}
