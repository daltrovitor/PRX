// Hello World
import type { StaticImageData } from "next/image";
import carImg from "@/public/brand/showcase/prx-car.jpg";
import carLogo from "@/public/brand/showcase/prx-car-logo.png";
import homeImg from "@/public/brand/showcase/prx-home.jpg";
import homeLogo from "@/public/brand/showcase/prx-home-logo.png";

/*
 * PRX CAR e PRX HOME dentro do PRX PASS. Textos e imagens dos media kits de
 * 2026 (PRX CAR.pdf e PRX HOME.pdf), na versão para o membro: o que é, as
 * condições que os parceiros podem oferecer e como a jornada funciona. Ainda
 * não há parceiro nem condição publicada, então nada aqui mostra preço,
 * modelo ou empreendimento.
 */

export interface CarHomeJourney {
  id: "car" | "home";
  name: string;
  logo: StaticImageData;
  logoAlt: string;
  image: StaticImageData;
  imageAlt: string;
  /** object-position da foto no quadro. */
  focus: string;
  title: readonly [string, string];
  lead: string;
  conditionsIntro: string;
  conditions: ReadonlyArray<readonly [string, string]>;
  steps: ReadonlyArray<readonly [string, string]>;
  extras: ReadonlyArray<readonly [string, string]>;
  notes: readonly string[];
  signature: string;
}

export const CAR_HOME: readonly CarHomeJourney[] = [
  {
    id: "car",
    name: "PRX CAR",
    logo: carLogo,
    logoAlt: "PRX CAR: your first car starts here.",
    image: carImg,
    imageAlt: "Jovem com a chave na mão ao lado do carro, com a cidade ao fundo",
    focus: "object-[50%_40%]",
    title: ["Meu primeiro carro.", "Minha primeira liberdade."],
    lead: "O PRX CAR conecta você a montadoras, concessionárias e grupos automotivos com condições exclusivas para membros comprarem o primeiro carro.",
    conditionsIntro: "Cada parceiro cria a própria condição para modelos ou unidades selecionados. Entre as possibilidades:",
    conditions: [
      ["PRX PRICE", "Preço ou bônus exclusivo para membros PRX."],
      ["PRX ENTRY", "Entrada reduzida ou facilitada."],
      ["PRX FLOW", "Plano de pagamento para quem está começando a construir renda."],
      ["PRX RATE", "Financiamento em condição diferenciada com instituições parceiras, quando disponível."],
      ["PRX UPGRADE", "Acessórios, personalização ou upgrades."],
      ["PRX INSURANCE", "Condições especiais em seguros com parceiros habilitados."],
      ["PRX CHARGE", "Para elétricos: carregamento, instalação de carregador ou créditos em redes parceiras."],
      ["PRX EXPERIENCE", "Test-drives, lançamentos e experiências exclusivas para a comunidade."],
    ],
    steps: [
      ["O PRX BANK entende o seu presente", "Com a sua autorização, a movimentação da conta vira um retrato da sua vida financeira."],
      ["O PRX CAR calcula o que cabe na sua vida", "Uma faixa de compra orientativa e o custo real do carro por mês: parcela, seguro, combustível, impostos e manutenção, não só a parcela."],
      ["O PRX INVEST ajuda a juntar a entrada", "Se o carro ainda não cabe, você define a meta e o prazo, e a instituição parceira mostra alternativas para chegar lá."],
      ["A Condição PRX é desbloqueada", "Quando você está pronto, aparecem os carros que fazem sentido para o seu momento, com a condição da concessionária parceira."],
      ["O PRX PASS continua depois da compra", "PRX OWNER: benefícios em lavagem, estacionamento, carregamento, pneus, estética, manutenção e seguro."],
    ],
    extras: [["PRX FIRST DRIVE", "Um evento para conhecer e dirigir os possíveis primeiros carros, com música, creators, tecnologia e experiências das marcas parceiras."]],
    notes: [
      "Análise de crédito, financiamento, documentação e entrega ficam com a concessionária e os parceiros dela. A PRX conecta, orienta e negocia a condição.",
      "O seu nível na PRX não é aprovação de crédito. Para menores de 18, a jornada é de planejamento e educação financeira; compra e crédito seguem a lei e as regras dos parceiros.",
    ],
    signature: "Your first car starts here.",
  },
  {
    id: "home",
    name: "PRX HOME",
    logo: homeLogo,
    logoAlt: "PRX HOME: a próxima geração de compradores começa agora.",
    image: homeImg,
    imageAlt: "Jovem caminhando por um caminho de luz até um prédio residencial",
    focus: "object-[50%_50%]",
    title: ["Meu primeiro apê.", "Seu primeiro patrimônio começa aqui."],
    lead: "A PRX seleciona compactos, studios e apartamentos pensados para o primeiro imóvel e negocia com as construtoras uma Condição PRX exclusiva para membros.",
    conditionsIntro: "Em imóvel, quase sempre é mais inteligente mexer no fluxo do que no preço. Cada construtora escolhe o que consegue oferecer:",
    conditions: [
      ["PRX PRICE", "Desconto exclusivo no valor da unidade."],
      ["PRX ENTRY", "Entrada reduzida ou parcelada."],
      ["PRX FLOW", "Parcelas iniciais menores."],
      ["PRX START", "Sinal reduzido para membro PRX."],
      ["PRX UPGRADE", "Acabamento, kit ou mobiliário como benefício."],
      ["PRX CASHBACK", "Benefício pós-compra no ecossistema PRX."],
      ["PRX FEE", "A construtora absorve despesas comerciais ou documentais elegíveis."],
      ["PRX EXCLUSIVE", "Unidades ou condições reservadas por um tempo à comunidade."],
    ],
    steps: [
      ["Você descobre o empreendimento na PRX", "Compactos e studios selecionados para o primeiro imóvel."],
      ["Simula a sua condição", "Com a Condição PRX daquele empreendimento."],
      ["Demonstra interesse", "A equipe comercial da construtora recebe o seu contato."],
      ["Fecha direto com a construtora", "Contrato, financiamento e entrega seguem as políticas de cada empresa."],
    ],
    extras: [
      ["PRX HOME SCORE", "Você informa quanto ganha, quanto guarda e quanto já tem para a entrada, e o app mostra o caminho e o tempo até o primeiro apê, com o PRX BANK e o PRX INVEST."],
      ["PRX HOME INVEST", "Para maiores de 18: o primeiro apartamento como formação de patrimônio, com números reais do empreendimento e sem promessa de rentabilidade."],
    ],
    notes: [
      "Condições, análise de crédito, juros e prazos variam conforme cada construtora e contrato.",
      "Compra e financiamento de imóvel são para maiores de 18 anos.",
    ],
    signature: "First home. Next chapter.",
  },
];
