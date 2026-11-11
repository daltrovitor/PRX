// Hello World
"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/app/pass/voucher-sheet";

/** ID PRX da conta, com cópia: é o que a pessoa passa para um Insider convidá-la. */
export function MemberId() {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/profile/code", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { code?: string | null } | null) => {
        if (alive && json?.code) setCode(json.code);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!code) return null;
  return (
    <div className="profile-member-id flex max-w-full flex-wrap items-center justify-center gap-3 rounded-2xl glass py-1.5 pl-4 pr-1.5">
      <p className="min-w-0 text-[12px] text-muted-foreground sm:text-sm">
        ID PRX <span className="break-all font-mono font-semibold tracking-[0.06em] text-ink">{code}</span>
      </p>
      <CopyButton value={code} label="Copiar ID" />
    </div>
  );
}
