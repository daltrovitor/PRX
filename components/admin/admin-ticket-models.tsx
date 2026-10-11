// Hello World
"use client";

import { Notice, Tag } from "@/components/app/ui";
import { LiveTicketCard, type LiveTicketData } from "@/components/tickets/live-ticket-card";
import { PassVoucherCard, type PassVoucherData } from "@/components/tickets/pass-voucher-card";

/**
 * Modelos visuais do ingresso PRX LIVE e do voucher PRX PASS, com dados
 * FICTÍCIOS. Os códigos usam formatos que o sistema nunca gera (zeros), e o QR
 * não segue o formato de ingresso/voucher: nenhuma portaria ou balcão aceita.
 */

const SAMPLE_TICKET: LiveTicketData = {
  seriesLabel: "PRX Session",
  eventTitle: "Evento de demonstração",
  startsAt: "2030-01-12T22:00:00-03:00",
  venue: "Local fictício",
  city: "Cidade fictícia",
  category: "Lote de exemplo",
  holderName: "Pessoa Fictícia de Exemplo",
  purchaseCode: "PED-0000000",
  ticketCode: "UP-0000-0000",
  organizer: "Organizador de exemplo",
  ageRating: "18+",
  idCheckRequired: true,
  entryRequirements: "Dados ilustrativos: este documento não vale para nenhum evento.",
  price: 72,
  originalPrice: 90,
  discount: 18,
  statusLabel: "Exemplo",
};

const SAMPLE_VOUCHER: PassVoucherData = {
  partnerName: "Parceiro de exemplo",
  partnerLocation: "Endereço fictício",
  product: "Produto ou serviço de exemplo",
  benefit: "20% OFF",
  holderName: "Pessoa Fictícia de Exemplo",
  voucherCode: "PRX-0000-0000",
  originalPrice: 50,
  promotionalPrice: 40,
  expiresAt: "2030-01-31T23:59:00-03:00",
  terms: "Modelo ilustrativo sem validade para resgate.",
};

export function AdminTicketModels({ kind }: { kind: "live" | "pass" }) {
  return (
    <section aria-labelledby={`model-${kind}`} className="space-y-6">
      <div>
        <h2 id={`model-${kind}`} className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
          {kind === "live" ? "Modelo do ingresso PRX LIVE" : "Modelo do voucher PRX PASS"}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Visual de referência com dados fictícios: como o membro vê no celular e como o admin consulta. Nada aqui é um documento válido.
        </p>
      </div>
      <Notice tone="warning">Modelo ilustrativo: códigos com zeros nunca são gerados pelo sistema e o QR não é aceito por nenhuma portaria ou balcão.</Notice>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="mx-auto w-full max-w-[400px] lg:col-span-5">
          <p className="mb-3 text-[13px] font-semibold text-muted-foreground">No app do membro</p>
          {kind === "live" ? <LiveTicketCard data={SAMPLE_TICKET} qrPayload={null} variant="illustrative" /> : <PassVoucherCard data={SAMPLE_VOUCHER} qr={null} variant="illustrative" />}
        </div>
        <div className="lg:col-span-7">
          <p className="mb-3 text-[13px] font-semibold text-muted-foreground">Na consulta do admin</p>
          {kind === "live" ? <TicketConsult /> : <VoucherConsult />}
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words text-ink">{value}</dd>
    </div>
  );
}

function TicketConsult() {
  return (
    <div className="space-y-4 rounded-3xl glass p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="success">Válido</Tag>
        <Tag tone="warning">Exemplo</Tag>
        <Tag>Compra com cupom</Tag>
      </div>
      <dl className="divide-y divide-line">
        <Row label="Evento" value={`${SAMPLE_TICKET.eventTitle} · ${SAMPLE_TICKET.seriesLabel}`} />
        <Row label="Titular" value={`${SAMPLE_TICKET.holderName} · exemplo@exemplo.com`} />
        <Row label="Ingresso" value={SAMPLE_TICKET.ticketCode} />
        <Row label="Pedido" value={SAMPLE_TICKET.purchaseCode} />
        <Row label="Lote" value={SAMPLE_TICKET.category} />
        <Row label="Valor" value="R$ 72,00 (R$ 90,00 − R$ 18,00 do cupom EXEMPLO20)" />
        <Row label="Pagamento" value="Confirmado pela equipe PRX em 01/01/2030 12:00" />
        <Row label="Classificação" value="18+ · documento com foto na entrada" />
        <Row label="Entrada" value="Ainda não validado" />
        <Row label="Organização" value={SAMPLE_TICKET.organizer} />
      </dl>
      <p className="text-[12px] text-muted-foreground">Na portaria, o operador vê só nome, lote, situação e a regra de entrada — nunca valores.</p>
    </div>
  );
}

function VoucherConsult() {
  return (
    <div className="space-y-4 rounded-3xl glass p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="success">Válido</Tag>
        <Tag tone="warning">Exemplo</Tag>
      </div>
      <dl className="divide-y divide-line">
        <Row label="Parceiro" value={SAMPLE_VOUCHER.partnerName} />
        <Row label="Benefício" value={`${SAMPLE_VOUCHER.product} · ${SAMPLE_VOUCHER.benefit}`} />
        <Row label="Titular" value={SAMPLE_VOUCHER.holderName} />
        <Row label="Voucher" value={SAMPLE_VOUCHER.voucherCode} />
        <Row label="Valor" value="R$ 40,00 (de R$ 50,00)" />
        <Row label="Validade" value="até 31/01/2030 23:59" />
        <Row label="QR" value="Dinâmico, muda a cada 60 s; a baixa exige a prova do momento" />
        <Row label="Tentativas" value="Aceitas e recusadas ficam em Configurações → Validações" />
      </dl>
      <p className="text-[12px] text-muted-foreground">No balcão, o parceiro vê só o primeiro nome do titular (LGPD).</p>
    </div>
  );
}
