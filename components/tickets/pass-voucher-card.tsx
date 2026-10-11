// Hello World
"use client";

import Image from "next/image";
import Link from "next/link";
import { useQrDataUrl } from "@/components/app/pass/voucher-sheet";
import { formatBRL } from "@/components/app/ui";
import { Perforation, TicketBackdrop, TicketField, VariantBanner, VariantStamp, type TicketVariant } from "@/components/tickets/ticket-art";
import type { DynamicQr } from "@/components/tickets/use-dynamic-pass-qr";

/**
 * Voucher do PRX PASS: parceiro, produto/serviço, benefício, titular, valor,
 * validade e o QR dinâmico (muda a cada 60 s). Logo abaixo do QR, o link para
 * os Termos de Uso do QR Code. O modelo ilustrativo usa dados fictícios e um
 * QR que nenhum balcão aceita.
 */

export interface PassVoucherData {
  partnerName: string;
  partnerLocation?: string;
  product: string;
  benefit: string;
  holderName: string;
  voucherCode: string;
  originalPrice?: number | null;
  promotionalPrice?: number | null;
  expiresAt?: string | null;
  terms?: string;
}

export const ILLUSTRATIVE_VOUCHER_QR = "PRX PASS - MODELO ILUSTRATIVO - SEM VALIDADE";
export const QR_TERMS_PATH = "/termos-qrcode";

const VALID_UNTIL: Intl.DateTimeFormatOptions = { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };

const STATE_TEXT: Record<DynamicQr["state"], string> = {
  loading: "Gerando o QR Code…",
  valid: "QR válido",
  expired: "QR expirado: atualizando…",
  offline: "Sem conexão: o QR não pode ser atualizado agora.",
  used: "Este voucher já foi utilizado.",
  voucher_expired: "Este voucher expirou.",
  error: "QR indisponível no momento.",
};

export function PassVoucherCard({ data, qr, variant = "live" }: { data: PassVoucherData; qr: DynamicQr | null; variant?: TicketVariant }) {
  const payload = variant === "illustrative" ? ILLUSTRATIVE_VOUCHER_QR : (qr?.payload ?? null);
  const image = useQrDataUrl(payload, 320);
  const state = variant === "illustrative" ? "valid" : (qr?.state ?? "loading");
  const progress = qr && qr.period > 0 ? Math.min(1, qr.secondsLeft / qr.period) : 0;

  return (
    <article aria-label={`Voucher ${data.partnerName}`} className="relative isolate overflow-hidden rounded-[22px] bg-[#07070c] text-white shadow-[0_24px_60px_-28px_rgba(20,12,60,0.85)] ring-1 ring-white/10">
      <TicketBackdrop accent="pass" />
      <div className="relative space-y-5 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <p className="ob-label text-[12px] tracking-[0.28em] text-[#c4b5fd]">PRX PASS</p>
          <span className="rounded-[6px] bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ring-1 ring-white/15">Pessoal e intransferível</span>
        </header>

        <VariantBanner variant={variant} />

        <div>
          <p className="ob-label text-[11px] tracking-[0.16em] text-white/55">Parceiro</p>
          <h3 className="ob-display mt-1 break-words text-[28px] uppercase leading-[0.95] sm:text-[32px]">{data.partnerName}</h3>
          {data.partnerLocation && <p className="mt-1 text-[13px] text-white/60">{data.partnerLocation}</p>}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <TicketField label="Produto ou serviço" className="col-span-2">
            {data.product}
          </TicketField>
          <TicketField label="Benefício">{data.benefit}</TicketField>
          <TicketField label="Valor">
            {data.promotionalPrice ? (
              <>
                {formatBRL(data.promotionalPrice)}
                {data.originalPrice ? <span className="ml-1 text-white/50 line-through">{formatBRL(data.originalPrice)}</span> : null}
              </>
            ) : data.originalPrice ? (
              formatBRL(data.originalPrice)
            ) : (
              "Conforme o parceiro"
            )}
          </TicketField>
          <TicketField label="Titular" className="col-span-2">
            {data.holderName}
          </TicketField>
          <TicketField label="Validade" className="col-span-2">
            {data.expiresAt ? `Até ${new Date(data.expiresAt).toLocaleString("pt-BR", VALID_UNTIL)}` : "Enquanto o benefício estiver ativo"}
          </TicketField>
        </dl>
      </div>

      <Perforation />

      <div className="relative space-y-4 px-5 pb-6 pt-2 sm:px-6">
        <div className="relative mx-auto w-full max-w-[248px] rounded-[14px] bg-white p-3">
          {payload && image ? (
            <Image src={image} alt={variant === "illustrative" ? "QR Code ilustrativo, sem validade" : "QR Code dinâmico do voucher"} width={320} height={320} unoptimized className="h-auto w-full" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-[8px] bg-neutral-100 px-4 text-center text-[13px] font-medium text-neutral-600">{STATE_TEXT[state]}</div>
          )}
          <VariantStamp variant={variant} />
        </div>

        {variant !== "illustrative" && qr && (
          <div className="mx-auto max-w-[248px] space-y-2" aria-live="polite">
            <div className="flex items-center justify-between text-[12px]">
              <span className={state === "valid" ? "text-[#86efac]" : "text-[#fca5a5]"}>{STATE_TEXT[state]}</span>
              {state === "valid" && <span className="font-mono tabular-nums text-white/70">{qr.secondsLeft}s</span>}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <div className="h-full origin-left bg-[#a78bfa] transition-transform duration-1000 ease-linear motion-reduce:transition-none" style={{ transform: `scaleX(${state === "valid" ? progress : 0})` }} />
            </div>
            {(state === "error" || state === "offline" || state === "expired") && (
              <button type="button" onClick={qr.refresh} className="min-h-12 w-full cursor-pointer rounded-[10px] bg-white/10 px-4 text-[14px] font-medium text-white ring-1 ring-white/15 transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a78bfa]">
                Atualizar QR Code
              </button>
            )}
          </div>
        )}

        <p className="text-center text-[12px] leading-relaxed text-white/70">
          <Link href={QR_TERMS_PATH} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 cursor-pointer items-center underline decoration-white/40 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a78bfa]">
            Ao utilizar este QR Code, você concorda com nossos Termos de Uso
          </Link>
        </p>

        <dl className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
          <TicketField label="Código do voucher" mono>
            {data.voucherCode}
          </TicketField>
          <TicketField label="Código do momento" mono>
            {variant === "illustrative" ? "000000" : (qr?.momentCode ?? "——————")}
          </TicketField>
        </dl>
        <p className="text-[12px] leading-relaxed text-white/60">
          Sem câmera no balcão? O atendente digita o código do voucher e os 6 dígitos do momento. O código muda a cada 60 segundos e o benefício vale uma única vez.
        </p>
        {data.terms && <p className="text-[12px] leading-relaxed text-white/60">Regras do parceiro: {data.terms}</p>}
      </div>
    </article>
  );
}
