// Hello World
import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Política de Privacidade (LGPD)",
  description: "Como a PRX trata seus dados pessoais: finalidades, bases legais, compartilhamento, retenção e seus direitos pela LGPD.",
  alternates: { canonical: "/privacidade" },
  openGraph: { title: "Política de Privacidade · PRX", description: "Como a PRX trata seus dados pessoais, conforme a LGPD.", locale: "pt_BR", type: "article" },
};

const sections: ReadonlyArray<LegalSection> = [
  {
    id: "controlador",
    title: "Quem trata seus dados",
    body: (
      <>
        <p>
          O controlador dos dados é {COMPANY.legalName}
          {COMPANY.cnpj ? `, CNPJ ${COMPANY.cnpj}` : ""}, responsável pelo ecossistema PRX. O Encarregado pelo Tratamento de Dados Pessoais (DPO) atende pelo e-mail{" "}
          <a href={`mailto:${COMPANY.dpoEmail}`}>{COMPANY.dpoEmail}</a>.
        </p>
        <p>Esta Política segue a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018, a LGPD) e vale para o app, os sites e os portais da PRX.</p>
      </>
    ),
  },
  {
    id: "dados",
    title: "Dados que coletamos",
    body: (
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail, senha (guardada só como hash), data de nascimento quando informada e foto do perfil quando você entra com o Google.
        </li>
        <li>
          <strong>Uso do PASS e do LIVE:</strong> benefícios resgatados, vouchers e ingressos, validações nos parceiros, missões e indicações.
        </li>
        <li>
          <strong>Economia PRX:</strong> saldo e extrato de PRX Coins, XP, nível e check-ins de bom comportamento.
        </li>
        <li>
          <strong>PRX BANK:</strong> chaves Pix pré-cadastradas, pedidos de cartão e, após a ativação, transações da conta recebidas da instituição parceira, incluindo o
          recebedor de cada Pix para identificar compras em parceiros e montar o PRX Map.
        </li>
        <li>
          <strong>Destaques:</strong> curtidas, vídeos salvos, visualizações e cliques no botão de cada vídeo.
        </li>
        <li>
          <strong>Técnicos:</strong> endereço IP, data e hora de acesso, tipo de aparelho e navegador (registros exigidos pelo Marco Civil da Internet).
        </li>
      </ul>
    ),
  },
  {
    id: "finalidades",
    title: "Para que usamos e com qual base legal",
    body: (
      <ul>
        <li>
          <strong>Prestar o serviço</strong> (conta, benefícios, vouchers, ingressos, pontos e níveis): execução de contrato (art. 7º, V).
        </li>
        <li>
          <strong>Creditar coins e XP por compras em parceiros</strong> e organizar o PRX Map: execução de contrato e legítimo interesse (art. 7º, IX), sempre com os
          dados da sua própria conta.
        </li>
        <li>
          <strong>Segurança e prevenção a fraudes</strong> (abuso de benefícios, contas falsas): legítimo interesse (art. 7º, IX).
        </li>
        <li>
          <strong>Obrigações legais e regulatórias</strong>, inclusive as da instituição financeira parceira (prevenção à lavagem de dinheiro): cumprimento de obrigação
          legal (art. 7º, II).
        </li>
        <li>
          <strong>Comunicações sobre novidades</strong> e Lista VIP: consentimento (art. 7º, I), que pode ser retirado a qualquer momento.
        </li>
        <li>
          <strong>Métricas para parceiros:</strong> só números agregados e anônimos (faixa etária, impressões e cliques). Parceiros nunca recebem seu e-mail ou
          documento.
        </li>
      </ul>
    ),
  },
  {
    id: "criancas",
    title: "Crianças e adolescentes",
    body: (
      <p>
        O tratamento de dados de adolescentes segue o melhor interesse deles (art. 14 da LGPD). A PRX não abre conta para menores de 12 anos: conferimos a data de
        nascimento informada no cadastro e bloqueamos o cadastro abaixo dessa idade. De 12 a 17 anos, o uso da PRX pressupõe a autorização do responsável. Coletamos
        apenas o necessário para o serviço e não usamos esses dados para publicidade direcionada por perfil.
      </p>
    ),
  },
  {
    id: "compartilhamento",
    title: "Com quem compartilhamos",
    body: (
      <ul>
        <li>
          <strong>Parceiros credenciados:</strong> no balcão, só o seu primeiro nome e os dados do voucher ou ingresso, para confirmar o atendimento.
        </li>
        <li>
          <strong>Instituição financeira parceira do PRX BANK:</strong> os dados necessários para abrir e operar sua conta de pagamento.
        </li>
        <li>
          <strong>Fornecedores de tecnologia</strong> (hospedagem, banco de dados, autenticação e envio de e-mail), sob contrato e só para operar o serviço.
        </li>
        <li>
          <strong>Autoridades</strong>, quando houver obrigação legal ou ordem judicial.
        </li>
      </ul>
    ),
  },
  {
    id: "internacional",
    title: "Transferência internacional",
    body: <p>Alguns fornecedores de nuvem armazenam dados fora do Brasil. Nesses casos, a transferência segue o art. 33 da LGPD, com cláusulas contratuais e padrões de segurança adequados.</p>,
  },
  {
    id: "retencao",
    title: "Por quanto tempo guardamos",
    body: (
      <p>
        Guardamos os dados enquanto sua conta existir. Depois do encerramento, mantemos apenas o que a lei exige: registros de acesso por 6 meses (Marco Civil),
        documentos fiscais e financeiros pelo prazo legal, e evidências de aceite de termos e contratos enquanto puderem ser necessárias para defesa de direitos. O
        extrato de pontos é apagado junto com a conta.
      </p>
    ),
  },
  {
    id: "direitos",
    title: "Seus direitos",
    body: (
      <>
        <p>Pelo art. 18 da LGPD, você pode pedir a qualquer momento:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;</li>
          <li>portabilidade para outro fornecedor;</li>
          <li>eliminação dos dados tratados com base no consentimento e informação sobre as consequências de negar o consentimento;</li>
          <li>informação sobre com quem compartilhamos seus dados;</li>
          <li>revogação do consentimento.</li>
        </ul>
        <p>
          Envie o pedido para <a href={`mailto:${COMPANY.dpoEmail}`}>{COMPANY.dpoEmail}</a>. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de
          Proteção de Dados (ANPD).
        </p>
      </>
    ),
  },
  {
    id: "automatizadas",
    title: "Decisões automatizadas",
    body: (
      <p>
        Coins, XP, nível e a categoria de cada gasto no PRX Map são calculados automaticamente a partir das regras exibidas no app. Você pode pedir a revisão de qualquer
        cálculo que afete seus interesses (art. 20 da LGPD) pelo canal do Encarregado.
      </p>
    ),
  },
  {
    id: "seguranca",
    title: "Segurança",
    body: (
      <p>
        Usamos conexão criptografada, senhas com hash, sessões assinadas, controle de acesso por perfil e regras no banco de dados que impedem alterar saldo de pontos ou
        nível pelo aplicativo. Nenhum sistema é infalível: se identificarmos um incidente relevante, avisaremos você e a ANPD.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies e armazenamento no aparelho",
    body: (
      <ul>
        <li>
          <strong>Essenciais:</strong> cookie de sessão (mantém você conectado) e, temporariamente, o registro do seu aceite durante o login com o Google.
        </li>
        <li>
          <strong>Preferências:</strong> tema claro ou escuro, “lembrar de mim” e ocultar saldo, guardados só no seu aparelho.
        </li>
        <li>Não usamos cookies de publicidade de terceiros.</li>
      </ul>
    ),
  },
  {
    id: "alteracoes",
    title: "Alterações desta Política",
    body: <p>Mudanças relevantes serão avisadas no app, com novo pedido de aceite quando a lei exigir. A versão e a data de atualização ficam no topo desta página.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Política de Privacidade"
      intro={<p>Seus dados, suas regras. Aqui está, em linguagem direta, o que a PRX coleta, por que coleta, com quem compartilha e como você controla tudo isso pela LGPD.</p>}
      sections={sections}
    />
  );
}
