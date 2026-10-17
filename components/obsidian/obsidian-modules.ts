// Hello World
import type { ObsidianPillar } from "@/components/obsidian/obsidian-ui";
import cardMetalImg from "@/public/brand/showcase/prx-card-metal.png";
import bankCardImg from "@/public/brand/showcase/prx-bank-card.jpg";
import liveConcertImg from "@/public/brand/showcase/prx-live-concert.png";
import investCopperImg from "@/public/brand/showcase/prx-invest-copper.jpg";
import meHorizonImg from "@/public/brand/showcase/prx-me-horizon.jpg";
import foundersImg from "@/public/brand/showcase/prx-founders.jpg";
import levelImg from "@/public/brand/showcase/prx-level.jpg";
import carImg from "@/public/brand/showcase/prx-car.jpg";
import homeImg from "@/public/brand/showcase/prx-home.jpg";
import circleImg from "@/public/brand/showcase/prx-circle.jpg";

/**
 * Todos os módulos da PRX como cards (Início do app), cada um com a sua imagem
 * oficial, a mesma da página em breve. Os que ainda não abrem no app levam
 * `soon` e mostram "Em breve".
 */
export const PRX_MODULES: ReadonlyArray<ObsidianPillar> = [
  { id: "bank", name: "BANK", caption: ["Conta digital", "Pix e cartão"], image: bankCardImg, focus: "object-[50%_45%]" },
  { id: "pass", name: "PASS", caption: ["Benefícios", "exclusivos"], image: cardMetalImg, focus: "object-[50%_32%]" },
  { id: "live", name: "LIVE", caption: ["Eventos", "experiências"], image: liveConcertImg, focus: "object-[50%_62%]" },
  { id: "founders", name: "FOUNDERS", caption: ["Comunidade", "de fundadores"], image: foundersImg, focus: "object-[50%_45%]" },
  { id: "level", name: "LEVEL", caption: ["Seu nível", "e missões"], image: levelImg, focus: "object-[50%_50%]" },
  { id: "car", name: "CAR", caption: ["Seu primeiro", "carro"], image: carImg, focus: "object-[50%_40%]" },
  { id: "home", name: "HOME", caption: ["Seu primeiro", "apê"], image: homeImg, focus: "object-[50%_50%]" },
  { id: "invest", name: "INVEST", caption: ["Invista", "nos seus planos"], image: investCopperImg, focus: "object-[50%_45%]", soon: true },
  { id: "me", name: "ME", caption: ["Saúde mental", "pra ir mais longe"], image: meHorizonImg, focus: "object-[60%_62%]", soon: true },
  { id: "circle", name: "CIRCLE", caption: ["Conexões", "sem swipe"], image: circleImg, focus: "object-[50%_50%]", soon: true },
];
