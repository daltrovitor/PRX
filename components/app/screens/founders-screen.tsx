// Hello World
"use client";

import { useEffect, useState } from "react";
import type { User } from "@/hooks/use-auth";
import { useAppNav } from "@/components/app/app-nav";
import { useLiveData } from "@/components/app/use-prx-stores";
import { FoundersPanel } from "@/components/app/founders/founders-submit";
import { EventDate } from "@/components/app/shared";
import { Button, EmptyState, Notice, Segmented, Tag } from "@/components/app/ui";
import { formatDateTime } from "@/lib/live/format";
import { RELATIONSHIP_LABEL, STARTUP_STAGE_TEXT, UPDATE_KIND_LABEL, type FoundersHub, type FoundersUpdate } from "@/lib/founders/types";

/**
 * PRX FOUNDERS: área própria para a frente de startups. Mostra só o que o
 * admin publicou (encontros, startups, novidades, oportunidades, materiais) e
 * a inscrição da startup. Sem conteúdo real, estados vazios honestos.
 */

type Section = "inicio" | "encontros" | "startups" | "novidades" | "inscrever";
const SECTIONS: ReadonlyArray<Section> = ["inicio", "encontros", "startups", "novidades", "inscrever"];

function useFoundersHub() {
  const [hub, setHub] = useState<FoundersHub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    fetch("/api/founders", { cache: "no-store" })
      .then((r) => r.json() as Promise<Partial<FoundersHub> & { error?: string }>)
      .then((json) => {
        if (!active) return;
        if (json.meetings && json.startups && json.updates) {
          setHub({ nextMeeting: json.nextMeeting ?? null, meetings: json.meetings, startups: json.startups, updates: json.updates });
          setError(null);
        } else setError(json.error || "Não foi possível carregar o PRX Founders.");
      })
      .catch(() => active && setError("Sem conexão com o servidor."));
    return () => {
      active = false;
    };
  }, [version]);
  return { hub, error, reload: () => setVersion((v) => v + 1) };
}

export function FoundersScreen({ member }: { member: User }) {
  const { sub, go } = useAppNav();
  const section: Section = SECTIONS.includes(sub as Section) ? (sub as Section) : "inicio";
  const { hub, error, reload } = useFoundersHub();
  const live = useLiveData(member.id);
  const submissions = live.data?.wallet.submissions ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <h1 className="ob-display text-[28px] text-ink sm:text-[40px]">PRX FOUNDERS</h1>
        <p className="max-w-xl text-sm text-muted-foreground sm:text-[15px]">
          O palco das startups da PRX: encontros, startups acompanhadas, oportunidades e a sua inscrição. O time de Rafael Molina avalia cada projeto; selecionados sobem ao palco do
          Founders Demo Day e ganham mentoria.
        </p>
      </header>

      <Segmented
        label="Seções do PRX Founders"
        value={section}
        onChange={(value) => go("founders", value === "inicio" ? null : value)}
        options={[
          { value: "inicio", label: "Início" },
          { value: "encontros", label: "Encontros", count: hub?.meetings.length },
          { value: "startups", label: "Startups", count: hub?.startups.length },
          { value: "novidades", label: "Novidades", count: hub?.updates.length },
          { value: "inscrever", label: "Inscrever startup" },
        ]}
      />

      {section === "inscrever" ? (
        live.data ? (
          <FoundersPanel submissions={submissions} submit={live.submitFounders} />
        ) : (
          <div role="status" aria-label="Carregando" className="h-48 rounded-3xl bg-surface" />
        )
      ) : !hub ? (
        error ? (
          <EmptyState title="Não foi possível carregar o PRX Founders" body={error} action={<Button onClick={reload}>Tentar de novo</Button>} />
        ) : (
          <div role="status" aria-label="Carregando o PRX Founders" className="h-48 rounded-3xl bg-surface" />
        )
      ) : (
        <>
          {section === "inicio" && <Overview hub={hub} onGo={(s) => go("founders", s)} />}
          {section === "encontros" && <Meetings hub={hub} />}
          {section === "startups" && <Startups hub={hub} />}
          {section === "novidades" && <Updates updates={hub.updates} />}
        </>
      )}
    </div>
  );
}

function Overview({ hub, onGo }: { hub: FoundersHub; onGo: (section: Section) => void }) {
  const next = hub.nextMeeting;
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section aria-labelledby="next-meeting" className="space-y-4 rounded-3xl glass p-6 lg:col-span-7">
        <h2 id="next-meeting" className="text-[13px] font-semibold text-muted-foreground">
          Próximo encontro
        </h2>
        {next ? (
          <div className="flex items-start gap-5">
            <EventDate iso={next.startsAt} />
            <div className="min-w-0 space-y-1.5">
              <p className="text-xl font-semibold tracking-[-0.02em] text-ink">{next.title}</p>
              <p className="text-sm text-muted-foreground">{[next.venue, next.city].filter(Boolean).join(" · ") || "Local a confirmar"}</p>
              <Button variant="secondary" size="sm" onClick={() => onGo("encontros")}>
                Ver programação
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[15px] text-muted-foreground">Nenhum encontro marcado ainda. A data aparece aqui assim que for confirmada.</p>
        )}
      </section>
      <section aria-labelledby="latest" className="space-y-4 rounded-3xl glass p-6 lg:col-span-5">
        <h2 id="latest" className="text-[13px] font-semibold text-muted-foreground">
          Últimas atualizações
        </h2>
        {hub.updates.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">Sem novidades publicadas por enquanto.</p>
        ) : (
          <ul className="space-y-3">
            {hub.updates.slice(0, 3).map((u) => (
              <li key={u.id}>
                <p className="text-[12px] font-semibold text-primary">{UPDATE_KIND_LABEL[u.kind]}</p>
                <p className="text-[15px] font-medium text-ink">{u.title}</p>
              </li>
            ))}
          </ul>
        )}
        <Button variant="ghost" size="sm" className="-ml-3" onClick={() => onGo("inscrever")}>
          Inscrever minha startup
        </Button>
      </section>
    </div>
  );
}

function Meetings({ hub }: { hub: FoundersHub }) {
  if (hub.meetings.length === 0) return <EmptyState title="Nenhum encontro marcado" body="Datas, local e programação aparecem aqui quando forem confirmados." />;
  return (
    <ul className="space-y-3">
      {hub.meetings.map((m) => (
        <li key={m.id} className="space-y-4 rounded-3xl glass p-6">
          <div className="flex items-start gap-5">
            <EventDate iso={m.startsAt} />
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink">
                {m.title}
                {m.status === "cancelled" && <Tag tone="warning">Cancelado</Tag>}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(m.startsAt)}
                {m.endsAt ? ` até ${formatDateTime(m.endsAt)}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">{[m.venue, m.address, m.city].filter(Boolean).join(" · ") || "Local a confirmar"}</p>
            </div>
          </div>
          {m.agenda && (
            <div>
              <p className="text-[13px] font-semibold text-ink">Programação</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {m.agenda.split(/\r?\n/).filter(Boolean).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Startups({ hub }: { hub: FoundersHub }) {
  if (hub.startups.length === 0) return <EmptyState title="Nenhuma startup publicada" body="As startups acompanhadas pela PRX aparecem aqui quando forem anunciadas." />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {hub.startups.map((s) => (
        <li key={s.id} className="space-y-3 rounded-3xl glass p-6">
          <div className="flex flex-wrap gap-1.5">
            <Tag tone={s.relationship === "investida" ? "success" : "accent"}>{RELATIONSHIP_LABEL[s.relationship]}</Tag>
            <Tag>{STARTUP_STAGE_TEXT[s.stage]}</Tag>
            {s.sector && <Tag>{s.sector}</Tag>}
          </div>
          <p className="text-lg font-semibold text-ink">{s.name}</p>
          {s.oneLiner && <p className="text-sm text-ink">{s.oneLiner}</p>}
          {s.description && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{s.description}</p>}
          <div className="flex flex-wrap gap-3 text-sm">
            {s.websiteUrl && (
              <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 cursor-pointer items-center font-medium text-primary underline-offset-4 hover:underline">
                Site da {s.name}
              </a>
            )}
            {s.pitchUrl && (
              <a href={s.pitchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 cursor-pointer items-center font-medium text-primary underline-offset-4 hover:underline">
                Apresentação da {s.name}
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Updates({ updates }: { updates: FoundersUpdate[] }) {
  if (updates.length === 0) return <EmptyState title="Sem novidades por enquanto" body="Novidades, oportunidades e materiais do PRX Founders aparecem aqui." />;
  const hasOpportunity = updates.some((u) => u.kind === "oportunidade");
  return (
    <div className="space-y-4">
      {hasOpportunity && (
        <Notice>Conteúdo informativo. Não é oferta pública de valores mobiliários nem recomendação de investimento; condições e riscos são apresentados em material próprio.</Notice>
      )}
      <ul className="space-y-3">
        {updates.map((u) => (
          <li key={u.id} className="space-y-2 rounded-3xl glass p-6">
            <p className="text-[12px] font-semibold text-primary">
              {UPDATE_KIND_LABEL[u.kind]}
              {u.publishedAt ? ` · ${formatDateTime(u.publishedAt)}` : ""}
            </p>
            <p className="text-lg font-semibold text-ink">{u.title}</p>
            {u.body && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{u.body}</p>}
            {u.linkUrl && (
              <a href={u.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 cursor-pointer items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
                {u.linkLabel || "Abrir link"}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
