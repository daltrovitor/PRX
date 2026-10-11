// Hello World
import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";
import { COMPANY } from "@/lib/company";

/** Versão deste documento (independente dos Termos de Uso gerais). */
const QR_TERMS_VERSION = "2026-10-11";

export const metadata: Metadata = {
  title: "Termos de Uso do QR Code PRX PASS",
  description: "Como funciona o QR Code dinâmico dos benefícios PRX PASS: uso pessoal, validade de 60 segundos, resgate, prevenção de fraude e dados pessoais.",
  alternates: { canonical: "/termos-qrcode" },
  openGraph: { title: "Termos de Uso do QR Code · PRX PASS", description: "Regras do QR Code dinâmico dos benefícios PRX PASS.", locale: "pt_BR", type: "article" },
};

const sections: ReadonlyArray<LegalSection> = [
  {
    id: "o-que-e",
    title: "O que é o QR Code do PRX PASS",
    body: (
      <>
        <p>
          Cada benefício que você resgata no PRX PASS gera um <strong>voucher</strong>. Para usar o voucher no estabelecimento parceiro, o app mostra um <strong>QR Code
          dinâmico</strong> e um <strong>código do momento</strong> de 6 dígitos. Eles provam que é você, titular da conta, quem está apresentando o voucher naquele instante.
        </p>
        <p>Estes termos complementam os <a href="/termos">Termos de Uso</a> e a <a href="/privacidade">Política de Privacidade</a> da PRX. Em caso de conflito, valem os Termos de Uso.</p>
      </>
    ),
  },
  {
    id: "pessoal",
    title: "Pessoal e intransferível",
    body: (
      <>
        <p>O QR Code e o voucher são vinculados à sua conta e ao benefício resgatado. Não podem ser vendidos, cedidos, emprestados nem compartilhados.</p>
        <p>Quem apresenta o QR Code declara ser o titular da conta. O uso por outra pessoa, ainda que com a sua permissão, é proibido.</p>
      </>
    ),
  },
  {
    id: "validade",
    title: "Validade temporária dos códigos",
    body: (
      <>
        <p>
          O QR Code e o código do momento mudam a cada <strong>60 segundos</strong> e só podem ser gerados pelo app, com a sua conta conectada. Para compensar pequenas
          diferenças de relógio, um código pode ser aceito por alguns instantes depois de trocado; capturas de tela antigas deixam de funcionar.
        </p>
        <p>Sem conexão com a internet, o app não consegue gerar um código novo. Nesse caso, o voucher aparece como indisponível até a conexão voltar.</p>
      </>
    ),
  },
  {
    id: "resgate",
    title: "Concessão e resgate do benefício",
    body: (
      <>
        <ul>
          <li>O benefício é concedido pelo parceiro, nas condições informadas no app: produto ou serviço, desconto, quantidade, prazo de uso e regras específicas.</li>
          <li>Cada voucher vale uma única vez, salvo se o benefício disser outra coisa. A baixa é registrada no momento da validação e não pode ser desfeita pelo app.</li>
          <li>Vouchers vencidos, já utilizados ou cancelados não são aceitos.</li>
          <li>O parceiro pode recusar o benefício quando o código estiver expirado, for inválido ou houver indício de uso irregular.</li>
        </ul>
      </>
    ),
  },
  {
    id: "identidade",
    title: "Verificação de identidade",
    body: (
      <p>
        Para confirmar a titularidade, o estabelecimento pode pedir um documento oficial com foto ou conferir o primeiro nome que aparece na validação. Se a identidade
        não puder ser confirmada, o benefício pode ser negado sem que o voucher seja baixado.
      </p>
    ),
  },
  {
    id: "fraude",
    title: "Prevenção de fraude",
    body: (
      <>
        <p>São proibidos: compartilhar ou revender códigos, usar capturas de tela de terceiros, tentar reutilizar um voucher, adulterar o QR Code ou automatizar a geração de códigos.</p>
        <p>
          A PRX registra as tentativas de validação (aceitas e recusadas), limita tentativas repetidas e pode bloquear o voucher ou suspender a conta quando houver
          indício de fraude, conforme os Termos de Uso.
        </p>
      </>
    ),
  },
  {
    id: "responsabilidades",
    title: "Responsabilidades",
    body: (
      <ul>
        <li>
          <strong>Você</strong>: manter a conta e o aparelho protegidos, apresentar o QR Code pessoalmente e respeitar as regras do benefício.
        </li>
        <li>
          <strong>PRX</strong>: gerar e validar os códigos com segurança, registrar o resgate corretamente e atender pedidos de suporte e contestação.
        </li>
        <li>
          <strong>Parceiro</strong>: conceder o benefício anunciado a quem apresentar um voucher válido e validar o código só pelos canais da PRX.
        </li>
      </ul>
    ),
  },
  {
    id: "dados",
    title: "Dados pessoais (LGPD)",
    body: (
      <>
        <p>
          Na validação, o parceiro vê apenas o necessário para atender: o benefício, a situação do voucher e o seu primeiro nome. E-mail, sobrenome e documentos não são
          mostrados ao parceiro.
        </p>
        <p>
          A PRX guarda o registro de cada validação (data, hora, estabelecimento, operador e resultado) para executar o benefício, prevenir fraudes e cumprir obrigações
          legais, com base na execução de contrato e no legítimo interesse (art. 7º, V e IX, da LGPD). Seus direitos de titular estão descritos na{" "}
          <a href="/privacidade">Política de Privacidade</a>.
        </p>
      </>
    ),
  },
  {
    id: "suporte",
    title: "Suporte, contestação e problemas",
    body: (
      <>
        <p>
          Se o benefício foi negado, o voucher foi baixado sem você ter usado ou o QR Code não funciona, fale com a PRX em{" "}
          <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> informando o código do voucher, o estabelecimento, a data e o horário.
        </p>
        <p>A PRX analisa o registro da validação e responde pelo mesmo canal. Assuntos de dados pessoais: <a href={`mailto:${COMPANY.dpoEmail}`}>{COMPANY.dpoEmail}</a>.</p>
      </>
    ),
  },
];

export default function QrTermsPage() {
  return (
    <LegalDocument
      title="Termos de Uso do QR Code PRX PASS"
      meta={
        <>
          Versão preliminar {QR_TERMS_VERSION} · sujeita a revisão jurídica antes da versão definitiva
        </>
      }
      intro={<p>Como funciona o QR Code dos seus benefícios: por que ele muda a cada minuto, quem pode usar e o que fazer se algo der errado.</p>}
      sections={sections}
    />
  );
}
