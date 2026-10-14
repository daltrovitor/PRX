// Hello World
"use client";

import { useMemo, useState } from "react";
import type { SystemVoucher } from "@/lib/pass-store";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Button, EmptyState, Input, Segmented, Tag } from "@/components/app/ui";
import { IconSearch } from "@/components/icons/prx-icons";

interface AdminVouchersTabProps {
  vouchers: SystemVoucher[];
  onRefresh: () => Promise<void>;
}

type StatusFilter = "all" | "valid" | "used";

interface ApiResult {
  success?: boolean;
  error?: string;
}

export function AdminVouchersTab({ vouchers, onRefresh }: AdminVouchersTabProps) {
  const { confirmDelete, showToast } = useConfirmToast();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (status !== "all" && v.status !== status) return false;
      if (!q) return true;
      return [v.code, v.partnerName, v.userName, v.userEmail, v.benefitTitle].some((field) => field?.toLowerCase().includes(q));
    });
  }, [vouchers, status, query]);

  async function toggle(voucher: SystemVoucher) {
    const next = voucher.status === "valid" ? "used" : "valid";
    try {
      const res = await fetch("/api/admin/vouchers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: voucher.id, status: next }),
      });
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.success) {
        showToast("error", data.error || "Não foi possível alterar o voucher.");
        return;
      }
      showToast("success", `${voucher.code} marcado como ${next === "used" ? "utilizado" : "válido"}.`);
      await onRefresh();
    } catch {
      showToast("error", "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }

  async function revoke(voucher: SystemVoucher) {
    const confirmed = await confirmDelete({
      title: "Revogar voucher",
      message: `O voucher ${voucher.code} deixa de valer no balcão. Esta ação não pode ser desfeita.`,
      confirmText: "Revogar",
      cancelText: "Cancelar",
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/admin/vouchers?id=${encodeURIComponent(voucher.id)}`, { method: "DELETE" });
      const data = (await res.json()) as ApiResult;
      if (res.ok && data.success) {
        showToast("success", `${voucher.code} revogado.`);
        await onRefresh();
      } else {
        showToast("error", data.error || "Não foi possível revogar.");
      }
    } catch {
      showToast("error", "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }

  return (
    <section aria-labelledby="vouchers-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="vouchers-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Vouchers
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Auditoria dos resgates e validação manual no caixa.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="voucher-search" className="sr-only">
            Buscar voucher
          </label>
          <Input id="voucher-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Código, membro ou parceiro" className="pl-11" />
        </div>
      </div>

      <Segmented
        label="Status do voucher"
        value={status}
        onChange={setStatus}
        options={[
          { value: "all", label: "Todos", count: vouchers.length },
          { value: "valid", label: "Válidos", count: vouchers.filter((v) => v.status === "valid").length },
          { value: "used", label: "Utilizados", count: vouchers.filter((v) => v.status === "used").length },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum voucher" body={query ? "Nada corresponde à busca." : "Os resgates dos membros aparecem aqui."} />
      ) : (
        <div className="glass overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Código</th>
                <th scope="col" className="px-4 py-3 font-medium">Membro</th>
                <th scope="col" className="px-4 py-3 font-medium">Parceiro · oferta</th>
                <th scope="col" className="px-4 py-3 font-medium">Resgate</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((voucher) => (
                <tr key={voucher.id} className="transition-colors hover:bg-surface/60">
                  <td className="px-4 py-3 font-mono text-ink">{voucher.code}</td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{voucher.userName || "Membro"}</p>
                    {voucher.userEmail && <p className="text-[13px] text-muted-foreground">{voucher.userEmail}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{voucher.partnerName}</p>
                    <p className="text-[13px] text-muted-foreground">{voucher.benefitTitle || voucher.discountLabel}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{voucher.redeemedAt}</td>
                  <td className="px-4 py-3">
                    <Tag tone={voucher.status === "valid" ? "success" : "neutral"}>{voucher.status === "valid" ? "Válido" : "Utilizado"}</Tag>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => toggle(voucher)}>
                        {voucher.status === "valid" ? "Validar" : "Reativar"}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => revoke(voucher)}>
                        Revogar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
