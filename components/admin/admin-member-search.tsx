// Hello World
"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/app/ui";
import { useDebounced } from "@/components/admin/pager";
import { adminGet } from "@/components/admin/admin-api";
import type { DirectoryMember } from "@/lib/admin/members";

/** Busca uma conta real pelo nome ou e-mail (Founders, sorteios, liberações). */
export function AdminMemberSearch({ label, onPick }: { label: string; onPick: (m: Pick<DirectoryMember, "id" | "name" | "email">) => void }) {
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [found, setFound] = useState<DirectoryMember[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (q.trim().length < 2) return alive && setFound([]);
      const res = await adminGet<{ members: DirectoryMember[] }>(`/api/admin/members?q=${encodeURIComponent(q)}&pageSize=8&sort=name`).catch(() => ({ members: [] }));
      if (alive) setFound(res.members);
    })();
    return () => {
      alive = false;
    };
  }, [q]);

  return (
    <div className="space-y-2">
      <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar conta por nome ou e-mail" aria-label={label} />
      {found.length > 0 && (
        <ul className="space-y-1">
          {found.map((m) => (
            <li key={m.id}>
              <Button
                variant="ghost"
                className="w-full justify-start text-left"
                onClick={() => {
                  onPick({ id: m.id, name: m.name, email: m.email });
                  setQuery("");
                  setFound([]);
                }}
              >
                {m.name} · <span className="text-muted-foreground">{m.email}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
