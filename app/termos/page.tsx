// Hello World
import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Regras de uso do ecossistema PRX: PRX PASS, PRX Coins, níveis, PRX BANK, PRX LIVE e Destaques.",
  alternates: { canonical: "/termos" },
  openGraph: { title: "Termos de Uso · PRX", description: "Regras de uso do ecossistema PRX.", locale: "pt_BR", type: "article" },
};

const sections: ReadonlyArray<LegalSection> = [
  {
    id: "aceitacao",
    title: "Aceitação",
    body: (
      <>
        <p>
          Estes Termos de Uso regulam o acesso ao aplicativo e aos sites da PRX (o <strong>ecossistema PRX</strong>): PRX PASS, PRX Coins e níveis, PRX BANK, PRX LIVE e
          Destaques. Ao marcar a caixa de aceite e criar sua conta, entrar com e-mail ou continuar com o Google, você declara que leu e concorda com estes Termos e com a{" "}
          <a href="/privacidade">Política de Privacidade</a>.
        </p>
        <p>Se não concordar, não use o ecossistema PRX. O aceite fica registrado com data e versão do documento.</p>
      </>
    ),
  },
  {
    id: "quem-pode-usar",
    title: "Quem pode usar",
    body: (
      <>
        <p>O ecossistema PRX é voltado às gerações Z e Alpha, para pessoas de até 29 anos, residentes no Brasil.</p>
        <ul>
          <li>
            <strong>Menores de 18 anos</strong> só usam a PRX com autorização e acompanhamento de pai, mãe ou responsável legal, que responde pelo uso da conta.
          </li>
          <li>
            <strong>Menores de 12 anos</strong> não podem criar conta na PRX, nem com a autorização de pai, mãe ou responsável. A idade mínima para se cadastrar é de 12 anos.
          </li>
          <li>A conta de pagamento do PRX BANK, quando ativada, segue as regras de idade da instituição financeira parceira.</li>
        </ul>
      </>
    ),
  },
  {
    id: "conta",
    title: "Sua conta e segurança",
    body: (
      <>
        <p>Você se compromete a informar dados verdadeiros, manter a senha em sigilo e avisar a PRX se suspeitar de uso indevido. A conta é pessoal e intransferível.</p>
        <p>A PRX pode pedir confirmação de identidade e suspender contas com indício de fraude, automação ou violação destes Termos.</p>
      </>
    ),
  },
  {
    id: "pass",
    title: "PRX PASS: benefícios e vouchers",
    body: (
      <>
        <p>
          O PRX PASS reúne benefícios oferecidos por parceiros credenciados. Ao resgatar, você recebe um voucher com QR Code, válido nas condições exibidas no benefício
          (vigência, limite por membro, prazo de uso e locais).
        </p>
        <ul>
          <li>A oferta, o produto e o atendimento são de responsabilidade do parceiro. A PRX intermedeia o acesso e valida o voucher.</li>
          <li>Vouchers não são dinheiro, não têm valor de troca e não podem ser revendidos.</li>
          <li>Benefícios podem acabar antes do fim da campanha quando a quantidade se esgota, se isso estiver indicado nas regras.</li>
        </ul>
      </>
    ),
  },
  {
    id: "coins",
    title: "PRX Coins e níveis",
    body: (
      <>
        <p>
          <strong>PRX Coins</strong> são pontos de fidelidade usados para resgatar benefícios do PASS. <strong>XP e níveis</strong> medem sua evolução no ecossistema e
          liberam benefícios e experiências. A régua de níveis é contínua e não tem teto.
        </p>
        <ul>
          <li>
            Você ganha coins e XP com bons hábitos (check-ins como a Semana sem apostas), compras pagas com Pix pela sua conta PRX em parceiros credenciados e o uso de
            benefícios, conforme as regras exibidas no app.
          </li>
          <li>Coins não são moeda, não rendem, não podem ser convertidos em dinheiro, sacados, vendidos ou transferidos para outra pessoa.</li>
          <li>Check-ins são declarações de boa-fé. Declarações falsas, automação ou abuso levam ao estorno dos pontos e podem levar à suspensão da conta.</li>
          <li>Preços em coins e regras de pontuação podem mudar para novos resgates, com aviso no app. Resgates já feitos não são afetados.</li>
          <li>Se a conta for encerrada, os coins e o XP acumulados deixam de existir.</li>
        </ul>
      </>
    ),
  },
  {
    id: "bank",
    title: "PRX BANK",
    body: (
      <>
        <p>
          A PRX não é instituição financeira. A conta de pagamento do PRX BANK será oferecida por instituição parceira autorizada pelo Banco Central, identificada no app
          e no contrato próprio da conta antes da ativação. Até a ativação, a conta aparece zerada e nenhum dinheiro é movimentado.
        </p>
        <ul>
          <li>Pix, cartões e extrato seguem o contrato da instituição parceira e as regras do Banco Central.</li>
          <li>
            A rentabilidade automática do saldo está <strong>em fase de homologação regulatória</strong> e só começa depois de liberada oficialmente, com aviso no app.
          </li>
          <li>O PRX Map organiza seus gastos por categoria a partir das suas próprias transações. É uma ferramenta informativa, não uma recomendação financeira.</li>
        </ul>
      </>
    ),
  },
  {
    id: "live",
    title: "PRX LIVE: eventos e ingressos",
    body: (
      <p>
        Ingressos do PRX LIVE são pessoais e validados na entrada por QR Code. Regras de lote, limite por membro, nível mínimo, pagamento e cancelamento aparecem em cada
        evento. Eventos podem ser remarcados ou cancelados pelo organizador, com as devoluções previstas na legislação do consumidor.
      </p>
    ),
  },
  {
    id: "reels",
    title: "Destaques e conteúdo de parceiros",
    body: (
      <p>
        A aba Destaques exibe vídeos de marcas parceiras credenciadas, curados pela PRX, sempre com o nome do parceiro e um botão para o benefício, o catálogo ou a loja. As
        condições de qualquer oferta são as do benefício ou da loja do parceiro. Curtidas e vídeos salvos ficam na sua conta e podem ser desfeitos a qualquer momento.
      </p>
    ),
  },
  {
    id: "conduta",
    title: "Condutas proibidas",
    body: (
      <ul>
        <li>Criar contas falsas ou múltiplas, usar robôs, scripts ou qualquer automação.</li>
        <li>Revender vouchers, ingressos ou coins, ou tentar obter vantagem indevida em benefícios.</li>
        <li>Burlar limites, explorar falhas ou acessar dados de outras pessoas.</li>
        <li>Publicar ou enviar conteúdo ilegal, ofensivo ou que viole direitos de terceiros.</li>
        <li>Usar a PRX para apostas, jogos de azar ou qualquer atividade ilegal.</li>
      </ul>
    ),
  },
  {
    id: "propriedade",
    title: "Propriedade intelectual",
    body: <p>Marca, logotipo, textos, interface e código da PRX são protegidos. Marcas e conteúdos dos parceiros pertencem a eles. Nada nestes Termos transfere esses direitos a você.</p>,
  },
  {
    id: "responsabilidade",
    title: "Responsabilidades",
    body: (
      <>
        <p>
          A PRX trabalha para manter o ecossistema disponível e seguro, mas pode haver interrupções para manutenção ou por fatores fora do seu controle. Seus direitos
          como consumidor, previstos no Código de Defesa do Consumidor, permanecem garantidos.
        </p>
        <p>A PRX não responde por produtos e serviços dos parceiros além do previsto na lei, nem por perdas causadas por uso indevido da sua conta por falta de cuidado com a senha.</p>
      </>
    ),
  },
  {
    id: "encerramento",
    title: "Suspensão e encerramento",
    body: (
      <p>
        Você pode encerrar sua conta a qualquer momento pelo canal <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>. A PRX pode suspender ou encerrar
        contas que violem estes Termos, com aviso quando possível. Obrigações legais de guarda de registros continuam valendo após o encerramento.
      </p>
    ),
  },
  {
    id: "alteracoes",
    title: "Alterações destes Termos",
    body: <p>Quando estes Termos mudarem de forma relevante, avisaremos no app e pediremos novo aceite. A versão vigente e a data de atualização ficam no topo desta página.</p>,
  },
  {
    id: "lei",
    title: "Lei aplicável e foro",
    body: <p>Estes Termos seguem a legislação brasileira. Fica eleito o foro do domicílio do consumidor para resolver qualquer questão.</p>,
  },
  {
    id: "contato",
    title: "Contato",
    body: (
      <p>
        Dúvidas sobre estes Termos: <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>. Assuntos de dados pessoais: Encarregado de Dados,{" "}
        <a href={`mailto:${COMPANY.dpoEmail}`}>{COMPANY.dpoEmail}</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Termos de Uso"
      intro={<p>As regras do jogo, sem letra miúda escondida: o que você pode fazer no ecossistema PRX, o que a PRX faz por você e como funcionam coins, níveis e benefícios.</p>}
      sections={sections}
    />
  );
}
