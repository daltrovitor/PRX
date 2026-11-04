// Hello World
"use client";

import { useState } from "react";
import { Button } from "@/components/app/ui";
import type { PixQr } from "@/lib/billing/gateway";

/** QR Code e Pix copia e cola de uma cobrança da PRX (assinatura ou ingresso). */
export function PixInvoice({ pix }: { pix: PixQr }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="glass-soft flex flex-col items-center gap-3 rounded-3xl p-5 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- QR em base64 devolvido pelo parceiro de pagamentos */}
      <img src={`data:image/png;base64,${pix.encodedImage}`} alt="QR Code Pix da cobrança" width={192} height={192} className="h-48 w-48 rounded-xl bg-white p-2" />
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(pix.payload);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Código copiado" : "Copiar Pix copia e cola"}
      </Button>
      <p className="text-[12px] text-muted-foreground">Pague pelo app do seu banco ou pela sua conta PRX BANK (Pix → Pagar com QR Code). A confirmação chega aqui sozinha.</p>
    </div>
  );
}
