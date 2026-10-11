// Hello World
/**
 * Frases do manifesto PRX. Para adicionar ou remover, edite só esta lista.
 * Frase de duas orações: separe as linhas com " / ". Frase de uma só fica numa
 * linha e o navegador quebra. A primeira é a padrão (servidor, SEO e quando não
 * há sessão); as demais entram no sorteio.
 * Uma por sessão: a landing e o cartão do PRX Bank mostram a mesma frase.
 */
export const TAGLINES: readonly string[] = [
  "O futuro não se assiste. / Se constrói.",
  "Seu futuro não aceita plateia.",
  "Menos hype. / Mais próximo passo.",
  "Seu nome ainda vai abrir portas.",
  "Quem cria não espera convite.",
  "O próximo movimento é seu.",
  "Seu maior ativo é você.",
  "Status passa. / Visão fica.",
  "Não terceirize seu futuro.",
  "Comece antes de estar pronto.",
  "Seu potencial não cabe no feed.",
  "O futuro não pede like.",
  "Seja o plano. / Não o acaso.",
  "A próxima geração não pede licença.",
  "Talento chama atenção. / Atitude muda o jogo.",
  "Invista em quem você vai ser.",
  "Seu futuro merece mais que um scroll.",
  "Aos 16, visão já é vantagem.",
  "Você não nasceu só pra consumir.",
  "O amanhã começa nas suas escolhas.",
  "Seu próximo nível começa agora.",
  "Seu futuro está em fase de lançamento.",
  "Visão não tem idade mínima.",
  "Troque aprovação por direção.",
  "Sua ideia merece sair do rascunho.",
  "O próximo capítulo leva sua assinatura.",
  "Quem só segue nunca estreia.",
  "Seu tempo merece critério.",
  "Faça do seu talento um projeto.",
  "Seu plano pode ser maior que sua turma.",
  "A tendência passa. / A autoria fica.",
  "Ser você já é um diferencial.",
  "Não espere viralizar pra acontecer.",
  "Seu futuro não vem por delivery.",
  "A melhor versão não vem com filtro.",
  "Seu talento não precisa de personagem.",
  "Você pode ser sua primeira aposta.",
  "O grupo não decide seu destino.",
  "Escolha o que merece sua atenção.",
  "Seu caminho não precisa estar em alta.",
  "Quem tem direção dispensa roteiro pronto.",
  "Não deixe o medo virar gerente.",
  "Seu primeiro passo não precisa de anúncio.",
  "Ideia boa pede movimento.",
  "Seu projeto merece uma primeira versão.",
  "Começar pequeno também é começar.",
  "O futuro gosta de quem aparece pra fazer.",
  "Sua atitude apresenta seu currículo.",
  "Aprenda algo que o algoritmo não entrega.",
  "Transforme curiosidade em repertório.",
  "Faça perguntas que abram portas.",
  "O próximo grande nome ainda está na escola.",
  "Aula de hoje. / Ideia de amanhã.",
  "Seu repertório é patrimônio.",
  "Conhecimento não perde valor por falta de like.",
  "Seu diploma não precisa ser seu primeiro passo.",
  "Aprender cedo rende tempo.",
  "Você não precisa saber tudo pra começar.",
  "Uma habilidade nova muda suas opções.",
  "Seja iniciante em algo grande.",
  "Seu talento merece treino.",
  "Liberdade também se planeja.",
  "Dinheiro com propósito vale mais.",
  "Seu orçamento também conta sua história.",
  "Planeje a conquista antes da foto.",
  "Seu primeiro investimento pode ser um livro.",
  "Ter escolha é um tipo de riqueza.",
  "Não financie uma versão que não é sua.",
  "Seu saldo não define seu valor.",
  "O melhor upgrade é ter autonomia.",
  "Seu dinheiro merece um destino.",
  "O luxo é poder escolher.",
  "A compra passa. / A escolha fica.",
  "Seu futuro também entra na conta.",
  "Gaste menos energia impressionando.",
  "Patrimônio começa com uma decisão.",
  "Conexão boa amplia horizontes.",
  "Ande com quem leva suas ideias a sério.",
  "Sua turma pode criar o próximo movimento.",
  "Networking começa com uma conversa.",
  "Seja a conexão que você procura.",
  "Tem espaço pra crescer junto.",
  "Liderar também é abrir espaço.",
  "Seu sucesso pode incluir outras pessoas.",
  "Quem soma deixa marca.",
  "Uma boa conversa pode mudar seu plano.",
  "Presença vale mais que visualização.",
  "Viva algo que não caiba num story.",
  "O mundo é maior que sua timeline.",
  "Seu modo avião também leva longe.",
  "Descansar faz parte do plano.",
  "Não confunda pressa com ambição.",
  "Seu ritmo também pode levar longe.",
  "Você pode mudar de rota sem pedir desculpas.",
  "Crescer não exige ter todas as respostas.",
  "Seu futuro precisa de você por inteiro.",
  "Sua ambição pode ter a sua cara.",
  "O próximo passo vale mais que a pose.",
  "Crie algo que você gostaria de encontrar.",
  "Seu amanhã ainda tem espaço pra surpreender.",
];

const STORAGE_KEY = "prx:tagline";

/** Índice da frase da sessão: sorteado uma vez e guardado no sessionStorage. */
export function sessionTaglineIndex(): number {
  if (TAGLINES.length <= 1) return 0;
  try {
    // getItem devolve null sem nada guardado, e Number(null) é 0: sem este teste a primeira frase sempre ganhava.
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const saved = raw === null ? -1 : Number(raw);
    if (Number.isInteger(saved) && saved >= 0 && saved < TAGLINES.length) return saved;
    const pick = Math.floor(Math.random() * TAGLINES.length);
    sessionStorage.setItem(STORAGE_KEY, String(pick));
    return pick;
  } catch {
    return 0;
  }
}
