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
    bootBatch: 12,            // filmes novos buscados a cada início no modo de teste
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
    // (e com pelo menos `requireScores` notas, quando a faixa exige)
    rarities: [
      { key: "comum", name: "Comum", min: 0, copies: 20, minBid: 1 },
      { key: "incomum", name: "Incomum", min: 6.5, copies: 10, minBid: 3 },
      { key: "raro", name: "Raro", min: 7.3, copies: 5, minBid: 6 },
      { key: "epico", name: "Épico", min: 8.0, copies: 3, minBid: 10 },
      { key: "lendario", name: "Lendário", min: 8.5, copies: 1, minBid: 15 },
      { key: "obra", name: "Obra de Arte", min: 9.5, copies: 1, minBid: 25, requireScores: 3 }
    ],
    minScores: 2,             // notas (de IMDb, Metacritic e Rotten Tomatoes) para o filme entrar no Mercado
    // peso de cada fonte na média: o Tomatometer do RT é a % de críticas positivas, não uma nota,
    // e puxa a média para cima (87% não quer dizer nota 8,7); por isso vale metade
    scoreWeights: { imdb: 1, metacritic: 1, rt: 0.5 },
    unanimityMaxSpread: 1.0,  // selo "Unanimidade": maior nota - menor nota até isto
    garimpoBelowLinks: 30,    // Garimpo = filme com menos páginas que isto na Wikipédia (com 40, mais da metade do sorteio subia de faixa)
    garimpoBoost: 1,          // faixas que o Garimpo sobe
    garimpoCap: "epico",      // o Garimpo não leva acima desta faixa

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
      { key: "month", name: "Estreia do mês", every: "month", day: 1, hour: 20, bands: ["lendario", "obra"], minutes: 60 }
    ],
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
    rarityCaps: { lendario: 2, obra: 1 },   // teto de cópias por jogador (conta as que tem e os lances na frente)
    ghostBuyer: true,         // a Casa compete nas estreias com um teto escondido: abaixo dele, ela cobre o lance
    ghostPct: 0.9,            // teto da Casa = valor de referência × isto

    /* ---------- pontuação da coleção ---------- */
    // pontos = soma das notas de referência dos filmes (cada filme conta uma vez) + bônus de conjunto + temporada
    collectionBonuses: {
      series: { name: "Trilogia", n: 3, pts: 8 },          // 3 filmes da mesma série
      director: { name: "Mesmo diretor", n: 3, pts: 5 },
      decade: { name: "Mesma década", n: 4, pts: 3 },
      genre: { name: "Mesmo gênero", n: 4, pts: 3 }         // gênero principal (o primeiro da lista)
    },
    // temporada: a cada mês um gênero desta lista está em alta (sorteio fixo pelo mês)
    seasonGenres: ["Ação", "Aventura", "Comédia", "Drama", "Ficção científica", "Terror", "Suspense", "Romance", "Animação", "Crimes", "Fantasia", "Mistério"],
    seasonPts: 2,             // pontos extras por filme do gênero em alta
    seasonValueBoost: 1.25    // o valor de referência dos filmes do gênero em alta sobe isto
  };
});
