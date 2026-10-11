// Hello World
"use client";

import Image from "next/image";
import { useQrDataUrl } from "@/components/app/pass/voucher-sheet";
import { Perforation, TicketBackdrop, TicketField, VariantBanner, VariantStamp, type TicketVariant } from "@/components/tickets/ticket-art";
import { formatBRL } from "@/components/app/ui";

/**
 * Ingresso digital do PRX LIVE. O mesmo desenho serve ao membro (ingresso
 * real), à simulação do admin (TESTE) e ao modelo ilustrativo (dados
 * fictícios). Só o ingresso real e o de teste levam o QR verdadeiro.
 */

export interface LiveTicketData {
  seriesLabel: string;
  eventTitle: string;
  startsAt: string;
  venue: string;
  city: string;
  category: string;
  holderName: string;
  purchaseCode: string;
  ticketCode: string;
  organizer: string;
  ageRating: string;
  idCheckRequired: boolean;
  entryRequirements?: string;
  price?: number;
  originalPrice?: number | null;
  discount?: number;
  statusLabel?: string;
  guardianStatus?: "pending" | "approved" | "rejected" | null;
  guardianName?: string | null;
  guardianEmail?: string | null;
}

/** Conteúdo do QR do modelo: não segue o formato de ingresso, então nenhuma portaria o aceita. */
export const ILLUSTRATIVE_TICKET_QR = "PRX LIVE - MODELO ILUSTRATIVO - SEM VALIDADE";

const DATE: Intl.DateTimeFormatOptions = { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "short", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" };

export function LiveTicketCard({ data, qrPayload, variant = "live" }: { data: LiveTicketData; qrPayload: string | null; variant?: TicketVariant }) {
  const isGuardianPending = data.guardianStatus === "pending";
  const payload = variant === "illustrative" ? ILLUSTRATIVE_TICKET_QR : isGuardianPending ? null : qrPayload;
  const qr = useQrDataUrl(payload, 320);
  const when = new Date(data.startsAt);
  const notices = [
    "Ingresso pessoal: vale uma única entrada e é conferido na hora pela portaria.",
    data.idCheckRequired ? "Leve documento oficial com foto. O nome precisa conferir com o do ingresso." : null,
    data.ageRating !== "Livre" ? `Classificação: ${data.ageRating}.` : null,
    data.guardianStatus === "pending"
      ? "Aguardando liberação do responsável legal (link enviado por e-mail)."
      : data.guardianStatus === "approved"
      ? `Liberado pelo responsável legal: ${data.guardianName || "Confirmado"}.`
      : data.guardianStatus === "rejected"
      ? "Entrada recusada pelo responsável legal."
      : null,
    data.entryRequirements && !(data.idCheckRequired && /^documento oficial com foto\.?$/i.test(data.entryRequirements.trim())) ? data.entryRequirements : null,
    "Não compartilhe prints: depois da primeira leitura, o QR deixa de valer.",
  ].filter(Boolean) as string[];

  return (
    <article aria-label={`Ingresso ${data.eventTitle}`} className="relative isolate overflow-hidden rounded-[22px] bg-[#07070c] text-white shadow-[0_24px_60px_-28px_rgba(20,12,60,0.85)] ring-1 ring-white/10">
      <TicketBackdrop accent="live" />
      <div className="relative space-y-5 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="ob-label text-[12px] tracking-[0.28em] text-[#9db4ff]">PRX LIVE</p>
            <p className="mt-1 text-[12px] text-white/60">{data.seriesLabel}</p>
          </div>
          {data.statusLabel && <span className="rounded-[6px] bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white ring-1 ring-white/15">{data.statusLabel}</span>}
        </header>

        <VariantBanner variant={variant} />

        <h3 className="ob-display break-words text-[28px] uppercase leading-[0.95] text-white sm:text-[34px]">{data.eventTitle}</h3>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <TicketField label="Data">{when.toLocaleDateString("pt-BR", DATE)}</TicketField>
          <TicketField label="Horário">{when.toLocaleTimeString("pt-BR", TIME)}</TicketField>
          <TicketField label="Local" className="col-span-2">
            {data.venue}
            {data.city ? ` · ${data.city}` : ""}
          </TicketField>
          <TicketField label="Categoria">{data.category}</TicketField>
          <TicketField label="Classificação">{data.ageRating}</TicketField>
          <TicketField label="Participante" className="col-span-2">
            {data.holderName}
          </TicketField>
          <TicketField label="Organização" className="col-span-2">
            {data.organizer || "A definir"}
          </TicketField>
          {data.price !== undefined && (
            <TicketField label="Valor" className="col-span-2">
              {data.price === 0 ? "Gratuito" : formatBRL(data.price)}
              {data.discount ? <span className="text-white/60">{` · desconto de ${formatBRL(data.discount)} sobre ${formatBRL(data.originalPrice ?? data.price + data.discount)}`}</span> : null}
            </TicketField>
          )}
        </dl>
      </div>

      <Perforation />

      <div className="relative space-y-5 px-5 pb-6 pt-2 sm:px-6">
        {payload ? (
          <div className="relative mx-auto w-full max-w-[248px] rounded-[14px] bg-white p-3">
            {qr ? (
              <Image src={qr} alt={variant === "illustrative" ? "QR Code ilustrativo, sem validade" : `QR Code do ingresso ${data.ticketCode}`} width={320} height={320} unoptimized className="h-auto w-full" />
            ) : (
              <div className="aspect-square w-full rounded-[8px] bg-neutral-100" />
            )}
            <VariantStamp variant={variant} />
          </div>
        ) : (
          <p className="rounded-[12px] bg-white/[0.06] px-4 py-6 text-center text-[13px] text-white/70">O QR Code aparece quando o ingresso estiver confirmado.</p>
        )}

        <dl className="grid grid-cols-2 gap-4">
          <TicketField label="Código da compra" mono>
            {data.purchaseCode}
          </TicketField>
          <TicketField label="Código do ingresso" mono>
            {data.ticketCode}
          </TicketField>
        </dl>

        <ul className="space-y-1.5 border-t border-white/10 pt-4 text-[12px] leading-relaxed text-white/65">
          {notices.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
