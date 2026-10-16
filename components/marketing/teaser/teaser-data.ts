// Hello World
import type { StaticImageData } from "next/image";
import crystalImg from "@/public/brand/showcase/prx-3d-crystal.png";
import cardMetalImg from "@/public/brand/showcase/prx-card-metal.png";
import bankCardImg from "@/public/brand/showcase/prx-bank-card.jpg";
import liveConcertImg from "@/public/brand/showcase/prx-live-concert.png";
import investCopperImg from "@/public/brand/showcase/prx-invest-copper.jpg";
import meHorizonImg from "@/public/brand/showcase/prx-me-horizon.jpg";
import foundersImg from "@/public/brand/showcase/prx-founders.jpg";
import levelImg from "@/public/brand/showcase/prx-level.jpg";
import circleImg from "@/public/brand/showcase/prx-circle.jpg";
import carImg from "@/public/brand/showcase/prx-car.jpg";
import homeImg from "@/public/brand/showcase/prx-home.jpg";

/*
 * Textos do teaser do prx.app.br. Os módulos e as frases vêm da apresentação
 * oficial do ecossistema (show.prx.app.br, components/show/show-slides.tsx);
 * PRX CAR e PRX HOME seguem os media kits de 2026. Cada módulo usa a sua
 * imagem oficial (BANK: o cartão preto sobre obsidiana; PASS: o cartão de metal
 * com o símbolo). Nada aqui promete data de lançamento.
 */

export const TEASER_IMAGES = { crystal: crystalImg } as const;

export interface TeaserModule {
  /** Âncora da seção (#bank). */
  id: string;
  /** Nome depois de "PRX". */
  name: string;
  /** O momento de vida que o módulo cobre. */
  moment: string;
  title: readonly [string, string];
  lead: string;
  points: readonly string[];
  signature?: string;
  image: StaticImageData;
  /** Descrição da foto para leitores de tela. */
  alt: string;
  /** object-position da foto no quadro. */
  focus: string;
}

export const TEASER_MODULES: readonly TeaserModule[] = [
  {
    id: "bank",
    name: "BANK",
    moment: "vida financeira",
    title: ["Um banco que recompensa", "quem sabe escolher."],
    lead: "Uma experiência financeira pensada para a Geração Z, construída por meio de parceiros regulados e infraestrutura BaaS. Na PRX, comportamento financeiro positivo pode virar vantagem.",
    points: ["Conta", "Pix", "Cartão", "Pagamentos", "Benefícios", "Educação financeira"],
    image: bankCardImg,
    alt: "Cartão PRX preto apoiado em uma pedra de obsidiana",
    focus: "object-[50%_50%]",
  },
  {
    id: "pass",
    name: "PASS",
    moment: "benefícios",
    title: ["Seu comportamento", "vale mais."],
    lead: "O clube de benefícios da PRX conecta membros a marcas, produtos, serviços e experiências com condições exclusivas dentro do app.",
    points: ["Descontos", "Cashback", "Condições especiais", "Acesso antecipado", "Experiências members only"],
    signature: "The future pays more.",
    image: cardMetalImg,
    alt: "Cartão de metal com o símbolo da PRX",
    focus: "object-[50%_32%]",
  },
  {
    id: "live",
    name: "LIVE",
    moment: "experiências",
    title: ["O digital conecta.", "O presencial transforma."],
    lead: "Eventos criados para tirar uma geração das telas e colocá-la diante de pessoas, ideias, esporte, música, negócios e novas experiências.",
    points: ["PRX UP: coffee party premium", "PRX RUN: corrida e comunidade", "PRX SESSION: members only"],
    image: liveConcertImg,
    alt: "Público de um show com as mãos para o alto sob luzes violeta",
    focus: "object-[50%_55%]",
  },
  {
    id: "invest",
    name: "INVEST",
    moment: "patrimônio",
    title: ["Não comece pelo produto.", "Comece pelo sonho."],
    lead: "A PRX INVEST transforma objetivos de vida em portas de entrada para educação financeira e investimentos, com produtos de instituições parceiras, conforme perfil e elegibilidade.",
    points: ["Quero viajar", "Quero meu carro", "Quero meu apê", "Quero liberdade"],
    image: investCopperImg,
    alt: "Fita de luz cobre sobre fundo escuro",
    focus: "object-[50%_45%]",
  },
  {
    id: "me",
    name: "ME",
    moment: "saúde mental",
    title: ["Mental health is", "part of the plan."],
    lead: "Saúde mental acessível, privada e integrada à vida digital da nova geração. Porque construir o futuro também exige cuidar de quem vai vivê-lo.",
    points: ["Escolha o profissional", "Agende", "Faça sua sessão online"],
    signature: "Your mind matters.",
    image: meHorizonImg,
    alt: "Pessoa de costas diante de um horizonte violeta",
    focus: "object-[60%_60%]",
  },
  {
    id: "founders",
    name: "FOUNDERS",
    moment: "empreendedorismo",
    title: ["Where the next", "generation builds."],
    lead: "O ambiente PRX para jovens que não querem apenas encontrar oportunidades: querem criá-las. Empreendedores, futuros fundadores, investidores e novas lideranças conectados.",
    points: ["Cadastre sua ideia", "Apresente seu negócio", "Encontre pessoas", "Construa conexões"],
    image: foundersImg,
    alt: "Escultura do X da PRX em obsidiana com luz violeta e azul",
    focus: "object-[50%_45%]",
  },
  {
    id: "level",
    name: "LEVEL",
    moment: "desenvolvimento",
    title: ["Da ideia para", "o próximo nível."],
    lead: "A frente de desenvolvimento de jovens empreendedores da PRX.",
    points: ["Mentorias", "Preparação de pitch", "Modelo de negócio", "Posicionamento", "Conexões", "Acesso ao ecossistema"],
    signature: "Build. Pitch. Grow.",
    image: levelImg,
    alt: "Escada de obsidiana com um feixe de luz violeta subindo os degraus",
    focus: "object-[50%_50%]",
  },
  {
    id: "car",
    name: "CAR",
    moment: "primeiro carro",
    title: ["Meu primeiro carro.", "Minha primeira liberdade."],
    lead: "O PRX CAR conecta a nova geração a montadoras, concessionárias e grupos automotivos com condições exclusivas para membros comprarem o primeiro carro, com o custo real na ponta do lápis.",
    points: ["PRX PRICE: preço ou bônus exclusivo", "PRX ENTRY: entrada facilitada", "PRX FLOW: parcelas para quem começa", "PRX UPGRADE: acessórios e upgrades"],
    signature: "Your first car starts here.",
    image: carImg,
    alt: "Jovem com a chave na mão ao lado do carro, com a cidade ao fundo",
    focus: "object-[50%_40%]",
  },
  {
    id: "home",
    name: "HOME",
    moment: "primeiro apê",
    title: ["Meu primeiro apê.", "Seu primeiro patrimônio começa aqui."],
    lead: "A PRX seleciona compactos, studios e apartamentos pensados para o primeiro imóvel e negocia com as construtoras uma Condição PRX exclusiva para membros.",
    points: ["PRX ENTRY: entrada reduzida ou parcelada", "PRX FLOW: parcelas iniciais menores", "PRX START: sinal reduzido", "PRX UPGRADE: acabamento ou mobiliário"],
    signature: "First home. Next chapter.",
    image: homeImg,
    alt: "Jovem caminhando por um caminho de luz até um prédio residencial",
    focus: "object-[50%_50%]",
  },
  {
    id: "circle",
    name: "CIRCLE",
    moment: "conexões",
    title: ["Social, without", "the swipe."],
    lead: "Uma nova proposta de conexão dentro da PRX: menos aparência, mais conversa.",
    points: ["Texto antes da foto", "Conversa antes do match", "Conexão antes da performance"],
    image: circleImg,
    alt: "Anel de metal com luz violeta e azul",
    focus: "object-[50%_50%]",
  },
];

/** As jornadas que a PRX conecta (manifesto). */
export const TEASER_JOURNEYS: ReadonlyArray<readonly [string, string]> = [
  ["Do primeiro investimento", "ao primeiro carro."],
  ["Do primeiro apê", "ao primeiro negócio."],
  ["Da saúde mental", "às conexões certas."],
];

/** Como a PRX recompensa (texto da landing e do deck). */
export const TEASER_LOOP: ReadonlyArray<{ title: string; text: string }> = [
  { title: "Pague com Pix nos parceiros", text: "Cada compra é reconhecida na hora e organizada por categoria." },
  { title: "Ganhe PRX Coins e XP", text: "Compras em parceiros, metas cumpridas e eventos rendem coins e fazem você subir de nível." },
  { title: "Desbloqueie o ecossistema", text: "Quanto melhores as escolhas, maiores podem ser os benefícios, as experiências e as oportunidades." },
];

export const TEASER_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "O que é a PRX?", a: "Um ecossistema para as gerações Z e Alpha que junta conta digital, clube de benefícios, eventos, investimentos, saúde mental e conexões, e transforma boas escolhas em vantagens reais." },
  { q: "Quando a PRX abre?", a: "Em breve, aqui em prx.app.br. Quem está na Lista de Espera VIP recebe o aviso primeiro, por e-mail." },
  { q: "Menor de idade pode usar?", a: "Pode, a partir de 12 anos. Para abrir a conta digital, quem tem menos de 18 precisa do responsável, como manda a lei." },
  { q: "Tem tarifa ou anuidade?", a: "O Pix não tem tarifa por transação e o cartão não terá anuidade. Os benefícios maiores chegam conforme você evolui no ecossistema." },
  { q: "O que faço com o meu e-mail na lista?", a: "Só avisamos do lançamento, conforme a Política de Privacidade. Você pode pedir a remoção quando quiser." },
];
