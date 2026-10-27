// Simulação da economia do Mercado, para calibrar taxas, cópias e mesada.
// Usa as regras de verdade (public/market.js e market-config.js), em memória e sem rede.
// Uso: npm run sim -- [semanas] [jogadores] [semente]     (padrão: 52 semanas, 6 jogadores, semente 1)
// Perfis (repetidos em rodízio): gastador, colecionador, especulador.
const Market = require("../public/market.js");
const { examples } = require("../public/market-films.js");

const DAY = 864e5, HOUR = 3600e3;
const PROFILES = ["gastador", "colecionador", "especulador"];

function makeRng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// catálogo: os exemplos + filmes sintéticos com diretores, séries e décadas repetidos (para os conjuntos)
function seedCatalog(eco, rng, now, cfg) {
  examples.forEach((f) => Market.addFilm(eco, f, now, cfg));
  const G = cfg.seasonGenres, n1 = (v) => Math.round(Math.max(0, Math.min(10, v)) * 10) / 10;
  for (let i = 0; i < 180; i++) {
    const base = 4 + rng() * 5.9, scores = { imdb: n1(base + (rng() - 0.5)), metacritic: n1(base + (rng() - 0.5) * 1.6) };
    if (rng() < 0.5) scores.rt = n1(base + rng() * 1.2);
    Market.addFilm(eco, { id: "tt9" + String(i).padStart(6, "0"), title: "Filme " + i, year: 1960 + Math.floor(rng() * 65), dir: "Diretor " + (i % 45),
      g: [G[i % G.length], G[(i * 7) % G.length]], series: i % 8 === 0 ? "Série " + (i % 24) : "", links: 20 + Math.floor(rng() * 120), scores }, now, cfg);
  }
}

// quanto cada perfil aceita pagar por um filme (o teto do lance)
function maxPrice(eco, agent, a, now, cfg, rng) {
  const f = eco.films[a.film], v = Market.refValue(eco, a.film, cfg, now), ri = Market.rarityIndex(f.rarity, cfg);
  if (agent.profile === "gastador") return Math.round(v * (1.2 + 0.6 * rng()));
  if (agent.profile === "especulador") return Math.round(v * 1.05);   // compra perto do valor para revender 30% acima
  // colecionador: paga mais pelo raro e pelo que completa um conjunto
  const mine = Object.values(eco.copies).filter((c) => c.owner === agent.id).map((c) => eco.films[c.film]);
  const helps = mine.some((m) => (m.dir && m.dir === f.dir) || (m.series && m.series === f.series) || (m.g || [])[0] === (f.g || [])[0]);
  return Math.round(v * (1.1 + (helps ? 0.5 : 0) + (ri >= 3 ? 0.3 : 0)));
}
const budget = (eco, agent) => Math.floor(eco.users[agent.id].wallet.free * (agent.profile === "colecionador" ? 0.6 : 0.85));

// rodada de lances num leilão aberto: cada um sobe o mínimo até o próprio teto (ou o saldo)
function bidRound(eco, a, agents, now, cfg, rng) {
  const fmt = a.format || "open", order = agents.slice().sort(() => rng() - 0.5);
  if (fmt === "sealed" || fmt === "vickrey") {
    order.forEach((ag) => { const v = Math.min(maxPrice(eco, ag, a, now, cfg, rng), budget(eco, ag)); if (v >= a.minBid) Market.bid(eco, a.id, ag.id, v, now, cfg); });
    return;
  }
  const caps = new Map(order.map((ag) => [ag.id, maxPrice(eco, ag, a, now, cfg, rng)]));
  for (let pass = 0, moved = true; moved && pass < 400; pass++) {
    moved = false;
    for (const ag of order) {
      if (a.status !== "open" || a.highBy === ag.id) continue;
      const min = a.highBy ? a.high + 1 : a.minBid;
      if (min <= caps.get(ag.id) && min <= budget(eco, ag) && !Market.bid(eco, a.id, ag.id, min, now, cfg)) moved = true;
    }
  }
}

function run(opts) {
  const cfg = Object.assign({}, Market.CONFIG, (opts && opts.cfg) || {});
  const weeks = (opts && opts.weeks) || 52, players = (opts && opts.players) || 6, rng = makeRng((opts && opts.seed) || 1);
  const start = Market.nextCycle(Date.UTC(2026, 0, 1), cfg) - 7 * DAY;   // uma segunda às 00:00, antes da 1ª mesada
  const eco = Market.create();
  const agents = Array.from({ length: players }, (_, i) => ({ id: "u" + i, profile: PROFILES[i % PROFILES.length], held: {} }));
  agents.forEach((ag, i) => Market.addUser(eco, { id: ag.id, name: `${ag.profile} ${i + 1}`, auth: null }, start, cfg));
  seedCatalog(eco, rng, start, cfg);
  const prices = {}, snapshots = [], ghostHeld = { n: 0 };
  const note = (kind, rarity, price) => { (prices[rarity] = prices[rarity] || { estreia: [], venda: [] })[kind].push(price); };

  for (let d = 0; d < weeks * 7; d++) {
    const day = start + d * DAY, t = day + 20 * HOUR + 60e3;
    Market.tick(eco, t, cfg);
    Market.openDueEstreias(eco, day + 20 * HOUR, cfg, rng);
    // especuladores revendem o que compraram (leilão de 1 dia com reserva 30% acima do valor);
    // depois de 2 tentativas sem venda, largam na Casa
    agents.filter((ag) => ag.profile === "especulador").forEach((ag) => {
      Object.values(eco.copies).filter((c) => c.owner === ag.id).forEach((c) => {
        const tries = ag.held[c.id] || 0;
        if (tries >= 2) { Market.sellToHouse(eco, ag.id, c.id, t, cfg); delete ag.held[c.id]; return; }
        const fmt = ["open", "sealed", "vickrey"][Math.floor(rng() * 3)];
        if (!Market.listCopy(eco, ag.id, { copy: c.id, format: fmt, minutes: 1440, reserve: Math.round(Market.refValue(eco, c.film, cfg, t) * 1.3) }, t, cfg).error) ag.held[c.id] = tries + 1;
      });
    });
    Object.values(eco.auctions).filter((a) => a.status === "open").forEach((a) => bidRound(eco, a, agents.filter((ag) => ag.id !== a.seller), t, cfg, rng));
    Market.startDue(eco, day + DAY - 1);
    Market.tickAuctions(eco, day + DAY - 1).forEach((id) => {
      const a = eco.auctions[id], r = a.result || {};
      if (r.winner) note(a.kind === "house" ? "estreia" : "venda", a.rarity, r.price);
      if (r.house) ghostHeld.n++;
    });
    if ((d + 1) % 28 === 0 || d === weeks * 7 - 1) {
      const minted = {}; Object.values(eco.films).forEach((f) => (minted[f.rarity] = (minted[f.rarity] || 0) + f.minted));
      snapshots.push({ semana: Math.round((d + 1) / 7), circulacao: Market.supply(eco), mediaCarteira: Math.round(Market.supply(eco) / players), copias: Object.values(eco.copies).filter((c) => c.owner !== "house").length, emitidas: minted });
    }
  }

  // entradas e saídas de dinheiro, pelo extrato
  const flow = {};
  eco.ledger.forEach((e) => { flow[e.kind] = (flow[e.kind] || 0) + e.delta; });
  const avg = (l) => (l.length ? Math.round(l.reduce((x, y) => x + y, 0) / l.length * 10) / 10 : null);
  const byRarity = cfg.rarities.map((r) => {
    const films = Object.values(eco.films).filter((f) => f.rarity === r.key), p = prices[r.key] || { estreia: [], venda: [] };
    return { raridade: r.name, filmes: films.length, tiragem: films.reduce((x, f) => x + f.supply, 0), emitidas: films.reduce((x, f) => x + f.minted, 0),
      comJogadores: Object.values(eco.copies).filter((c) => c.owner !== "house" && eco.films[c.film].rarity === r.key).length,
      precoEstreia: avg(p.estreia), vendasEstreia: p.estreia.length, precoRevenda: avg(p.venda), revendas: p.venda.length, lanceMinimo: r.minBid };
  });
  const perProfile = PROFILES.map((pr) => {
    const ids = agents.filter((ag) => ag.profile === pr).map((ag) => ag.id);
    const score = ids.map((id) => Market.collectionScore(eco, id, start + weeks * 7 * DAY, cfg).total);
    return { perfil: pr, jogadores: ids.length, saldoMedio: Math.round(ids.reduce((x, id) => x + eco.users[id].wallet.free + eco.users[id].wallet.reserved, 0) / ids.length),
      copiasMedia: Math.round(ids.reduce((x, id) => x + Object.values(eco.copies).filter((c) => c.owner === id).length, 0) / ids.length * 10) / 10,
      pontosMedia: Math.round(score.reduce((x, y) => x + y, 0) / ids.length * 10) / 10 };
  });
  const ok = Object.values(eco.users).every((u) => u.wallet.free >= 0 && u.wallet.reserved >= 0 && u.wallet.free + u.wallet.reserved === Market.balanceFromLedger(eco, u.id));
  return { weeks, players, circulation: Market.supply(eco), flow, byRarity, perProfile, snapshots, ghostHeld: ghostHeld.n, booksOk: ok, eco };
}

if (require.main === module) {
  const [w, p, s] = process.argv.slice(2).map(Number);
  const r = run({ weeks: w || 52, players: p || 6, seed: s || 1 });
  const M = (n) => `${Market.CONFIG.currency} ${Math.round(n).toLocaleString("pt-BR")}`;
  console.log(`\nSimulação do Mercado: ${r.weeks} semanas, ${r.players} jogadores (${PROFILES.join(", ")})\n`);
  console.log("Dinheiro em circulação ao longo do tempo:");
  console.table(r.snapshots.map((x) => ({ semana: x.semana, "em circulação": M(x.circulacao), "média por carteira": M(x.mediaCarteira), "cópias com jogadores": x.copias })));
  const f = r.flow, inn = (f.signup || 0) + (f.allowance || 0) + (f.buyback || 0), out = -((f.estreia || 0) + (f.fee || 0));
  console.log("Entradas e saídas de dinheiro (todo o período):");
  console.table({
    "boas-vindas": M(f.signup || 0), "mesadas": M(f.allowance || 0), "recompras da Casa": M(f.buyback || 0), "TOTAL que entrou": M(inn),
    "pago em estreias": M(-(f.estreia || 0)), "taxas": M(-(f.fee || 0)), "TOTAL que saiu": M(out),
    "entre jogadores (compras = vendas)": M(-(f.purchase || 0)), "saldo final": M(r.circulation)
  });
  console.log("Por raridade:");
  console.table(r.byRarity.map((x) => ({ raridade: x.raridade, filmes: x.filmes, "cópias emitidas / tiragem": `${x.emitidas} / ${x.tiragem}`, "com jogadores": x.comJogadores,
    "lance mínimo": M(x.lanceMinimo), "preço médio na estreia": x.precoEstreia == null ? "-" : M(x.precoEstreia), "estreias vendidas": x.vendasEstreia,
    "preço médio na revenda": x.precoRevenda == null ? "-" : M(x.precoRevenda), revendas: x.revendas })));
  console.log("Por perfil:");
  console.table(r.perProfile.map((x) => ({ perfil: x.perfil, jogadores: x.jogadores, "saldo médio": M(x.saldoMedio), "cópias (média)": x.copiasMedia, "pontos (média)": x.pontosMedia })));
  console.log(`Estreias em que a Casa (comprador fantasma) ficou com a cópia: ${r.ghostHeld}`);
  console.log(`Extrato confere com as carteiras: ${r.booksOk ? "sim" : "NÃO"}`);
}

module.exports = { run };
