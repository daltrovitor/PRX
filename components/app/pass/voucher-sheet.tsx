// Hello World
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Benefit, UserVoucher } from "@/lib/pass-data";
import { PassVoucherCard } from "@/components/tickets/pass-voucher-card";
import { useDynamicPassQr } from "@/components/tickets/use-dynamic-pass-qr";
import { Button, Sheet, Tag } from "@/components/app/ui";
import { IconCheck, IconCopy } from "@/components/icons/prx-icons";

/** QR em PNG gerado no cliente, com margem branca para leitura no balcão. */
export function useQrDataUrl(payload: string | null | undefined, size = 280): string {
  const [generated, setGenerated] = useState<{ payload: string; url: string } | null>(null);
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    QRCode.toDataURL(payload, { width: size, margin: 1, color: { dark: "#0b0b10", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setGenerated({ payload, url });
      })
      .catch(() => {
        if (!cancelled) setGenerated(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payload, size]);
  // Só devolve o QR do payload atual; enquanto o novo é gerado, nada é exibido.
  return payload && generated?.payload === payload ? generated.url : "";
}

export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
      {copied ? "Copiado" : label}
    </Button>
  );
}

export function VoucherSheet({ voucher, onClose, holderName, benefit }: { voucher: UserVoucher | null; onClose: () => void; holderName: string; benefit?: Benefit | null }) {
  const qr = useDynamicPassQr(voucher?.status === "valid" ? voucher.code : null, Boolean(voucher && voucher.status === "valid"));
  return (
    <Sheet open={Boolean(voucher)} onClose={onClose} title={voucher?.partnerName ?? "Voucher"} description={voucher?.benefitTitle}>
      {voucher && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-3xl font-semibold tracking-[-0.035em] text-primary">{voucher.discountLabel}</span>
            {voucher.status === "valid" ? <Tag tone="success">Pronto para usar</Tag> : <Tag>Já utilizado</Tag>}
          </div>

          {voucher.status === "valid" ? (
            <PassVoucherCard
              qr={qr}
              data={{
                partnerName: voucher.partnerName,
                partnerLocation: benefit?.partnerLocation,
                product: voucher.benefitTitle,
                benefit: voucher.discountLabel,
                holderName,
                voucherCode: voucher.code,
                originalPrice: benefit?.originalPrice ?? null,
                promotionalPrice: benefit?.promotionalPrice ?? null,
                expiresAt: voucher.expiresAt ?? null,
                terms: voucher.terms,
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Validado no estabelecimento. Resgatado em {voucher.redeemedAt}.</p>
          )}

          {voucher.status === "valid" && (
            <div className="flex items-center justify-between gap-4 rounded-3xl bg-surface p-4">
              <div>
                <p className="text-[13px] text-muted-foreground">Código do voucher</p>
                <p className="mt-1 font-mono text-lg tracking-[0.12em] text-ink">{voucher.code}</p>
              </div>
              <CopyButton value={voucher.code} />
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
