/* ============================================================
   Martelo Live — números do Mercado (economia persistente)
   Tudo o que dá para calibrar fica aqui. O servidor e o navegador leem o mesmo arquivo.
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MarketConfig = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return {
    testMode: true,           // testes: a cada início renova o catálogo (exemplos + filmes novos) e abre as 3 estreias na hora. Desligue em produção.
    bootBatch: 20,            // filmes novos buscados a cada início no modo de teste
    currency: "M$",           // o dinheiro do Mercado não é o R$ da partida rápida

    /* ---------- carteira ---------- */
    signupBonus: 30,          // boas-vindas ao criar a conta (0 = nada)
    allowance: 30,            // mesada semanal, igual para todos
    allowanceDay: 1,          // dia do ciclo: 0 = domingo, 1 = segunda … 6 = sábado
    allowanceHour: 0,         // hora do ciclo, no fuso abaixo
    tzOffsetMin: -180,        // fuso do ciclo em minutos (Brasília = UTC-3)
    allowanceCatchUp: 1,      // semanas perdidas pagas de uma vez se o servidor ficou fora (1 = não acumula)

    /* ---------- contas ---------- */
    signupOpen: true,         // false = ninguém novo cria conta
    passwordMin: 6,
    sessionDays: 90,          // quanto tempo o login fica salvo no aparelho
    loginTries: 5,            // tentativas erradas antes de bloquear
    loginWindowMin: 5,        // por quantos minutos o bloqueio vale
    ledgerView: 30,           // lançamentos mostrados no extrato

    /* ---------- raridade ---------- */
    // da mais comum para a mais rara; a faixa é a última com `min` <= nota de referência
    // (e com pelo menos `requireScores` notas, quando a faixa exige).
    // Faixa invertida (`max`): vale para nota até `max`, vem antes das outras e o Garimpo não mexe nela.
    // Cortes calibrados num catálogo de 509 filmes para ~1% Tomate Podre, 40% Comum, 28% Incomum,
    // 18% Raro, 9% Épico, 3% Lendário e 1% Obra de Arte (com o Garimpo abaixo de 25 páginas)
    // `key` é o id salvo no Mercado (não mude); `name` é o que aparece na tela.
    // No modo de teste, o admin pode trocar os nomes só no próprio navegador (editor no canto da tela, `ml-rarnames`).
    rarities: [
      { key: "comum", name: "Sessão da Tarde", min: 0, copies: 20, minBid: 1 },
      { key: "incomum", name: "Bem na Crítica", min: 6.6, copies: 10, minBid: 3 },
      { key: "raro", name: "Indicado", min: 7.6, copies: 5, minBid: 6 },
      { key: "epico", name: "Aclamado", min: 8.4, copies: 3, minBid: 10 },
      { key: "lendario", name: "Imortal", min: 8.8, copies: 1, minBid: 15 },
      { key: "podre", name: "Tomate Podre", max: 1.5, copies: 1, minBid: 25, requireScores: 2 },   // o avesso da Obra de Arte
      { key: "obra", name: "Absolute Cinema", min: 9.2, copies: 1, minBid: 25, requireScores: 2 }
    ],
    minScores: 2,             // notas (de IMDb, Metacritic e Rotten Tomatoes) para o filme entrar no Mercado
    // peso de cada fonte na média: o Tomatometer do RT é a % de críticas positivas, não uma nota,
    // e puxa a média para cima (87% não quer dizer nota 8,7); por isso vale metade
    scoreWeights: { imdb: 1, metacritic: 1, rt: 0.5 },
    unanimityMaxSpread: 1.0,  // selo "Unanimidade": maior nota - menor nota até isto
    garimpoBelowLinks: 25,    // Garimpo = filme com menos páginas que isto na Wikipédia (com 30, um terço do catálogo subia de faixa)
    garimpoBoost: 1,          // faixas que o Garimpo sobe
    garimpoCap: "raro",       // o Garimpo não leva acima desta faixa

    /* ---------- catálogo (a Casa cadastra sozinha) ---------- */
    catalogMinLinks: 20,      // fama mínima para a Casa sortear um filme
    catalogTarget: 40,        // a Casa mantém pelo menos isto de filmes com cópias ainda por emitir
    catalogBatch: 80,         // candidatos testados por rodada
    catalogRefreshHours: 6,

    /* ---------- valor de referência e recompra da Casa ---------- */
    refValueFactor: 2,        // valor base = lance mínimo da raridade × isto
    refValueSales: 5,         // as últimas vendas entram na média junto com o valor base
    buybackPct: 0.4,          // a Casa recompra por esta fração do valor de referência
    // trava: a Casa nunca recompra acima do lance mínimo da faixa (senão comprar barato numa estreia
    // e revender para a Casa daria lucro sem fim)

    /* ---------- estreias da Casa (emitem as cópias) ---------- */
    // every: "day" | "week" (weekday: 0 = domingo) | "month" (day: dia do mês); hora no fuso tzOffsetMin
    estreias: [
      { key: "day", name: "Estreia do dia", every: "day", hour: 20, bands: ["comum", "incomum"], minutes: 15 },
      { key: "week", name: "Estreia da semana", every: "week", weekday: 6, hour: 20, bands: ["raro", "epico"], minutes: 30 },
      { key: "month", name: "Estreia do mês", every: "month", day: 1, hour: 20, bands: ["lendario", "podre", "obra"], minutes: 60 }
    ],
    // estreia personalizada do admin: filme sorteado (das faixas marcadas) ou escolhido, qualquer formato,
    // lance mínimo livre (de 1 a dutchMaxStart), duração de 1 minuto até maxMinutes e até maxCount de uma vez (no sorteio)
    customEstreia: { name: "Estreia especial", maxName: 40, maxMinutes: 10080, maxCount: 10 },
    extendWindowSec: 30,      // lance nos últimos 30 s...
    extendBySec: 30,          // ...soma mais 30 s ao relógio (Aberto: estreias e leilões dos jogadores)

    /* ---------- leilões dos jogadores ---------- */
    userFormats: ["open", "sealed", "vickrey", "dutch"],   // Aberto, Lance secreto, Secreto de 2º preço, Relógio holandês
    userDurations: [5, 15, 60, 360, 1440, 4320],           // minutos que o dono pode escolher (5 min a 3 dias)
    maxScheduleDays: 7,       // até quantos dias à frente dá para agendar o início
    saleFeePct: 0.08,         // taxa de venda paga por quem vende (arredondada; sai de circulação)
    listingFee: 2,            // taxa fixa para anunciar, não volta
    featureFee: 5,            // taxa para pôr o leilão na vitrine (com aviso para todos)
    featureFreeFrom: "epico", // desta raridade para cima, a vitrine é de graça
    maxActiveUserAuctions: 6, // leilões de jogadores anunciados (agendados ou abertos) ao mesmo tempo, somando todos
    maxActivePerUser: 2,
    dutchMaxStart: 1000,      // preço inicial máximo do relógio holandês

    /* ---------- competitividade ---------- */
    rarityCaps: { lendario: 2, podre: 1, obra: 1 },   // teto de cópias por jogador (conta as que tem e os lances na frente)
    ghostBuyer: true,         // a Casa disputa as estreias: a cada lance abaixo do teto da faixa, ela pode cobrir
    // teto da Casa = lance mínimo da faixa + esta porcentagem (fixo; faixa fora da lista = a Casa não disputa)
    ghostAbove: { raro: 0.25, epico: 0.4, lendario: 0.6, podre: 0.8, obra: 0.8 },
    // chance de a Casa cobrir um lance; cai por ghostDecay a cada cobertura (Lendário: 60%, 30%, 15%…)
    ghostChance: { raro: 0.25, epico: 0.4, lendario: 0.6, podre: 0.8, obra: 0.8 },
    ghostDecay: 0.5,
    ghostStep: 0.25,          // cada cobertura sobe esta fração do caminho entre o lance mínimo e o teto (no mínimo +1)

    /* ---------- pontuação da coleção ---------- */
    // pontos = soma das notas de referência dos filmes (cada filme conta uma vez) + bônus de conjunto + temporada
    // conjuntos em escada: com n filmes valem pts; cada filme a mais soma step, até max
    // (começa baixo para um trio fácil não valer muito, e o teto evita bola de neve com sagas e diretores grandes)
    collectionBonuses: {
      series: { name: "Trilogia", n: 3, pts: 4, step: 2, max: 12 },     // filmes da mesma série
      director: { name: "Mesmo diretor", n: 3, pts: 2, step: 1, max: 8 },
      decade: { name: "Mesma década", n: 4, pts: 1, step: 1, max: 5 },
      genre: { name: "Mesmo gênero", n: 4, pts: 1, step: 1, max: 5 },   // gênero principal (o primeiro da lista)
      cult: { name: "Cults", n: 3, pts: 3, step: 1, max: 8 },           // filmes com a mesma tag (filmTags)
      nacional: { name: "Cinema nacional", n: 3, pts: 3, step: 1, max: 8 },
      marvel: { name: "Marvel", n: 3, pts: 3, step: 1, max: 8 },
      dc: { name: "DC", n: 3, pts: 3, step: 1, max: 8 }
    },
    // tags dos filmes: Cult, Marvel e DC vêm das listas de public/market-films.js; Nacional (país de origem Brasil), do Wikidata
    filmTags: {
      cult: { name: "Cult", icon: "🌀", desc: "Filme cult: ganhou um público fiel com o tempo." },
      nacional: { name: "Nacional", icon: "🇧🇷", desc: "Cinema nacional: produção brasileira." },
      marvel: { name: "Marvel", icon: "🛡️", desc: "Personagens dos quadrinhos da Marvel." },
      dc: { name: "DC", icon: "🦇", desc: "Personagens dos quadrinhos da DC." }
    },
    // Oscars do filme, por família (as categorias de cada uma ficam em lib/films.js); cada família é um conjunto
    oscarFamilies: {
      filme: { name: "Melhor filme", icon: "🏆" },
      atuacao: { name: "Atuação", icon: "🎭" },
      roteiro: { name: "Roteiro", icon: "✍️" },
      musica: { name: "Música", icon: "🎵" },
      visual: { name: "Visual", icon: "🎨" },
      tecnica: { name: "Técnica", icon: "🎞️" },
      internacional: { name: "Filme internacional", icon: "🌍" }
    },
    oscarSet: { name: "Oscar", n: 3, pts: 2, step: 1, max: 6 },   // filmes com Oscar da mesma família (escada como acima)
    // a cada rodada, a Casa reserva estas vagas do catálogo para filmes com a tag que ainda não estão lá
    // (oscar: de uma família diferente a cada rodada)
    tagDraws: { cult: 2, oscar: 1, nacional: 1, marvel: 1, dc: 1 },
    // temporada: a cada mês um gênero desta lista está em alta (sorteio fixo pelo mês)
    seasonGenres: ["Ação", "Aventura", "Comédia", "Drama", "Ficção científica", "Terror", "Suspense", "Romance", "Animação", "Crimes", "Fantasia", "Mistério"],
    seasonPts: 2,             // pontos extras por filme do gênero em alta
    seasonValueBoost: 1.25    // o valor de referência dos filmes do gênero em alta sobe isto
  };
});
