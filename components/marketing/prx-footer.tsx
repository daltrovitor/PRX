"use client";

import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";

/** Secondary, in-flow footer. Main app navigation remains separate. */
export function PrxFooter({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <footer className={cn("w-full border-t bg-transparent", onDark ? "border-white/10 text-white/50" : "border-line text-muted-foreground", className)}>
      <div className="mx-auto max-w-[1120px] px-4 py-8 text-center text-[11px] sm:px-8 sm:py-10 sm:text-[12px]">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <span className="text-[12px] font-medium tracking-[0.3em]">PRX</span>
          <span aria-hidden className="h-5 border-l border-current opacity-30" />
          <nav aria-label="Informações institucionais" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href={`mailto:${COMPANY.supportEmail}`} className="inline-flex min-h-11 items-center hover:underline">Atendimento</a>
            <Link href="/privacidade" className="inline-flex min-h-11 items-center hover:underline">Privacidade</Link>
            <Link href="/termos" className="inline-flex min-h-11 items-center hover:underline">Termos</Link>
            <Link href="/apresentacao" className="inline-flex min-h-11 items-center hover:underline">Sobre</Link>
          </nav>
        </div>
        <p className="mt-4 text-[11px]">Desenvolvimento: <span className="font-medium">ViraWeb</span></p>
      </div>
    </footer>
  );
}
