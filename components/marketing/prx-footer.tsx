"use client";

import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { VIRAWEB_URL } from "@/components/brand/viraweb-credit";
import { cn } from "@/lib/utils";

/** Rodapé institucional compartilhado pela landing e pelo aplicativo. */
export function PrxFooter({ className }: { onDark?: boolean; className?: string }) {
  return (
    <footer className={cn("relative isolate w-full overflow-hidden bg-[#090711] text-white/60", className)}>
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-0 -z-10 h-52 w-80 rounded-full bg-[#6c0cf0]/15 blur-3xl" />
      <div className="mx-auto max-w-[1120px] px-5 pb-12 pt-10 sm:px-12 sm:pb-14 sm:pt-12">
        <div className="border-t border-white/20 pt-5 sm:pt-6">
          <div className="flex items-center justify-center gap-x-4 text-[12px] min-[380px]:gap-x-5 sm:gap-x-8 sm:text-[15px]">
            <span className="shrink-0 text-[15px] font-medium tracking-[0.28em] text-white/90 sm:text-[18px]">PRX</span>
            <span aria-hidden className="h-6 shrink-0 border-l border-white/40" />
            <nav aria-label="Informações institucionais" className="flex min-w-0 items-center justify-center gap-x-4 min-[380px]:gap-x-5 sm:gap-x-9">
              <a href={`mailto:${COMPANY.supportEmail}`} className="inline-flex min-h-11 items-center transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-400">Atendimento</a>
              <Link href="/privacidade" className="inline-flex min-h-11 items-center transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-400">Privacidade</Link>
              <Link href="/termos" className="inline-flex min-h-11 items-center transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-400">Termos</Link>
            </nav>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1 text-[12px] sm:mt-5 sm:text-[14px]">
            Desenvolvido por
            <a href={VIRAWEB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-white/75 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-400" aria-label="ViraWeb (abre em nova aba)">ViraWeb</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
