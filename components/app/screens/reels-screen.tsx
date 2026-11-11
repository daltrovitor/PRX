// Hello World
"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { PrxImage } from "@/components/ui/prx-image";
import { AnimatePresence, motion } from "motion/react";
import type { User } from "@/hooks/use-auth";
import { useAppNav } from "@/components/app/app-nav";
import { runReelCta } from "@/components/app/reels/reel-cta";
import { Button, EmptyState } from "@/components/app/ui";
import { IconBookmark, IconBookmarkFilled, IconHeart, IconHeartFilled, IconPlay, IconVolume, IconVolumeOff } from "@/components/icons/prx-icons";
import { REEL_COLLECTION_LABEL, type MemberReel, type ReelAction } from "@/lib/reels/types";
import { cn } from "@/lib/utils";

/*
 * Destaques: feed vertical de vídeos dos parceiros (9:16), no formato de Reels/Shorts.
 * Um vídeo por tela com snap; o que está visível toca sem som, toque pausa,
 * o botão de som vale para o feed inteiro. Cada vídeo termina num cartão com a
 * ação direta: benefício do PASS, catálogo ou loja do parceiro.
 */

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

async function post(action: ReelAction, reelId: string): Promise<{ likes: number; saves: number; liked: boolean; saved: boolean } | null> {
  try {
    const res = await fetch("/api/reels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reelId }) });
    const json = (await res.json().catch(() => ({}))) as { state?: { likes: number; saves: number; liked: boolean; saved: boolean } };
    return res.ok && json.state ? json.state : null;
  } catch {
    return null;
  }
}

export function ReelsScreen({ member }: { member: User }) {
  const { go } = useAppNav();
  const [reels, setReels] = useState<MemberReel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const viewed = useRef(new Set<string>());

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/reels", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { reels?: MemberReel[] };
      if (!res.ok || !Array.isArray(json.reels)) throw new Error("load");
      setReels(json.reels);
    } catch {
      setFailed(true);
      setReels((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Com movimento reduzido, nada toca sozinho: o vídeo abre pausado e toca no toque.
    const sync = () => {
      reduceMotionRef.current = query.matches;
      setReduceMotion(query.matches);
      if (query.matches) setPaused(true);
    };
    sync();
    query.addEventListener("change", sync);
    return () => {
      alive = false;
      query.removeEventListener("change", sync);
    };
  }, [load, member.id]);

  // Vídeo ativo = o que ocupa a maior parte da tela.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !reels?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            setActive(index);
            setPaused(reduceMotionRef.current);
          }
        }
      },
      { root, threshold: [0.6] }
    );
    root.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [reels]);

  // Toca só o ativo; os outros param e voltam ao início.
  useEffect(() => {
    if (!reels) return;
    reels.forEach((reel, index) => {
      const video = videos.current.get(reel.id);
      if (!video) return;
      video.muted = muted;
      if (index === active && !paused) {
        void video.play().catch(() => setPaused(true));
      } else {
        video.pause();
        if (index !== active) video.currentTime = 0;
      }
    });
    const current = reels[active];
    if (current && !viewed.current.has(current.id)) {
      viewed.current.add(current.id);
      void post("view", current.id);
    }
  }, [active, paused, muted, reels]);

  const patch = (id: string, next: Partial<MemberReel>) => setReels((list) => list?.map((r) => (r.id === id ? { ...r, ...next } : r)) ?? list);

  async function toggle(reel: MemberReel, kind: "like" | "save") {
    const on = kind === "like" ? !reel.liked : !reel.saved;
    // Otimista: responde ao toque na hora e confirma com o servidor.
    patch(reel.id, kind === "like" ? { liked: on, likes: Math.max(0, reel.likes + (on ? 1 : -1)) } : { saved: on, saves: Math.max(0, reel.saves + (on ? 1 : -1)) });
    const state = await post(kind === "like" ? (on ? "like" : "unlike") : on ? "save" : "unsave", reel.id);
    if (state) patch(reel.id, state);
    else patch(reel.id, { liked: reel.liked, likes: reel.likes, saved: reel.saved, saves: reel.saves });
  }

  function openCta(reel: MemberReel) {
    void post("cta", reel.id);
    runReelCta(reel, go);
  }

  function scrollTo(index: number) {
    const root = scrollerRef.current;
    if (!root || !reels) return;
    const target = Math.max(0, Math.min(reels.length - 1, index));
    root.scrollTo({ top: target * root.clientHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      scrollTo(active + 1);
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      scrollTo(active - 1);
    } else if (event.key === " " || event.key === "k") {
      event.preventDefault();
      setPaused((p) => !p);
    } else if (event.key === "m") {
      setMuted((m) => !m);
    }
  }

  const frame = "mx-auto h-[calc(100dvh-72px-62px-max(0.5rem,env(safe-area-inset-bottom)))] w-full overflow-hidden sm:rounded-2xl lg:h-[calc(100dvh-96px-24px)] lg:max-w-[440px]";

  if (reels === null) {
    return <div role="status" aria-label="Carregando Destaques" className={cn(frame, "bg-surface")} />;
  }

  if (reels.length === 0) {
    return (
      <div className="px-4 pt-3 sm:px-0">
        <h1 className="sr-only">Destaques</h1>
        <EmptyState
          title={failed ? "Não foi possível carregar os Destaques" : "Os primeiros drops estão chegando"}
          body={failed ? "Confira a conexão e tente de novo." : "Vídeos de lançamentos, bastidores e descobertas das marcas PRX aparecem aqui."}
          action={failed ? <Button onClick={() => void load()}>Tentar de novo</Button> : <Button variant="secondary" onClick={() => go("pass")}>Explorar o PASS</Button>}
        />
      </div>
    );
  }

  return (
    <section aria-label="Destaques dos parceiros" className="relative">
      <h1 className="sr-only">Destaques</h1>
      <div
        ref={scrollerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        data-lenis-prevent
        aria-label="Feed de vídeos. Setas para cima e para baixo trocam de vídeo, espaço pausa, M liga o som."
        className={cn(frame, "snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-[#0b0b10] scrollbar-none focus-visible:outline-none")}
      >
        {reels.map((reel, index) => {
          const isActive = index === active;
          return (
            <article
              key={reel.id}
              data-index={index}
              aria-roledescription="vídeo"
              aria-label={`${reel.partnerName}: ${reel.title}`}
              className="relative h-full w-full snap-start snap-always overflow-hidden bg-[#0b0b10] text-white"
            >
              <video
                ref={(el) => {
                  if (el) videos.current.set(reel.id, el);
                  else videos.current.delete(reel.id);
                }}
                src={Math.abs(index - active) <= 1 ? reel.videoUrl : undefined}
                poster={reel.posterUrl || undefined}
                muted={muted}
                loop
                playsInline
                preload={isActive ? "auto" : index === active + 1 ? "metadata" : "none"}
                className="absolute inset-0 h-full w-full object-cover"
                aria-hidden
              />

              {/* Toque na tela: pausa e retoma. */}
              <button
                type="button"
                onClick={() => (isActive ? setPaused((p) => !p) : scrollTo(index))}
                aria-label={isActive && !paused ? `Pausar ${reel.title}` : `Reproduzir ${reel.title}`}
                className="absolute inset-0 z-10 cursor-pointer"
              />

              <AnimatePresence>
                {isActive && paused && (
                  <motion.span
                    key="paused"
                    aria-hidden
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-black/45 backdrop-blur-sm"
                  >
                    <IconPlay size={26} />
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Topo: coleção e som */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between bg-gradient-to-b from-black/45 to-transparent p-3 pb-10">
                <span className="rounded-md bg-white/15 px-2.5 py-1 text-[12px] font-semibold tracking-[0.02em] backdrop-blur-sm">{REEL_COLLECTION_LABEL[reel.collection]}</span>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-pressed={!muted}
                  aria-label={muted ? "Ativar som" : "Desativar som"}
                  className="pointer-events-auto flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl bg-black/35 backdrop-blur-sm transition-colors hover:bg-black/50"
                >
                  {muted ? <IconVolumeOff size={20} /> : <IconVolume size={20} />}
                </button>
              </div>

              {/* Lateral: curtir e salvar */}
              <div className="absolute bottom-[184px] right-2 z-20 flex flex-col items-center gap-3">
                <ReactionButton
                  label={reel.liked ? "Descurtir" : "Curtir"}
                  pressed={reel.liked}
                  count={reel.likes}
                  onClick={() => void toggle(reel, "like")}
                  icon={reel.liked ? <IconHeartFilled size={24} className="text-[#b288f7]" /> : <IconHeart size={24} />}
                />
                <ReactionButton
                  label={reel.saved ? "Remover dos salvos" : "Salvar"}
                  pressed={reel.saved}
                  count={reel.saves}
                  onClick={() => void toggle(reel, "save")}
                  icon={reel.saved ? <IconBookmarkFilled size={22} className="text-[#b288f7]" /> : <IconBookmark size={22} />}
                />
              </div>

              {/* Rodapé: legenda e cartão de ação */}
              <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-3 pb-3 pt-16">
                <div className="pr-16">
                  <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.01em]">{reel.title}</h2>
                  {reel.caption && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/85">{reel.caption}</p>}
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/95 p-2.5 text-[#0b0b10] shadow-lg">
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f2f2f5] text-[13px] font-semibold">
                    {reel.partnerLogo ? <PrxImage src={reel.partnerLogo} alt="" fill sizes="44px" className="object-cover" /> : reel.partnerName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{reel.partnerName}</span>
                    {/* Identifica a marca parceira (relação comercial visível, sem rótulo de anúncio). */}
                    <span className="block truncate text-[12px] text-[#5b5b66]">Parceiro PRX</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openCta(reel)}
                    className="min-h-12 shrink-0 cursor-pointer rounded-xl bg-[#6c0cf0] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#5708c9] min-[380px]:px-4"
                  >
                    {reel.ctaLabel}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReactionButton({ label, pressed, count, onClick, icon }: { label: string; pressed: boolean; count: number; onClick: () => void; icon: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <motion.button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={`${label} (${count.toLocaleString("pt-BR")})`}
        whileTap={{ scale: 0.86 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl bg-black/35 backdrop-blur-sm transition-colors hover:bg-black/50"
      >
        {icon}
      </motion.button>
      <span aria-hidden className="text-[12px] font-semibold tabular-nums drop-shadow">
        {compact.format(count)}
      </span>
    </div>
  );
}
