/* ============================================================
   Martelo Live — regras do Mercado (economia persistente)
   Roda igual no servidor e no navegador. A economia inteira é um objeto simples
   (serializável em JSON). O tempo entra sempre como parâmetro `now` (ms).
   Senhas e tokens nunca passam por aqui: o servidor entrega só o hash.
   Toda movimentação de dinheiro gera um lançamento no extrato (`ledger`).
   Filmes do Mercado têm nota de referência congelada, raridade e tiragem limitada
   de cópias numeradas; cada cópia guarda o dono e o histórico.
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./market-config.js"));
  else root.Market = factory(root.MarketConfig);
})(typeof self !== "undefined" ? self : this, function (CONFIG) {
  "use strict";

  const DAY = 864e5, WEEK = 7 * DAY;
  const KINDS = { signup: "Boas-vindas", allowance: "Mesada semanal", fee: "Taxa", sale: "Venda", buyback: "Venda para a Casa", donate: "Donate", prize: "Prêmio", admin: "Ajuste do admin", estreia: "Estreia da Casa", purchase: "Compra em leilão" };

  /* ---------- utilidades ---------- */
  const cleanName = (n) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 18);
  const nameKey = (n) => cleanName(n).toLowerCase();
  const isAmount = (v) => Number.isInteger(v) && v >= 1;
  const money = (n) => `${CONFIG.currency} ${n}`;   // moeda do Mercado (não é o R$ da partida rápida)

  /* ---------- criação ---------- */
  function create() {
    return {
      v: 1,
      seq: 0,                  // muda a cada alteração
      nextId: 1,               // id dos lançamentos
      users: {},               // {id, name, nameKey, admin, createdAt, auth, wallet:{free, reserved}, nextAllowanceAt}
      sessions: {},            // hash do token -> {uid, createdAt, expiresAt}
      ledger: [],              // {id, at, uid, delta, kind, ref}
      films: {}, copies: {}, auctions: {}, house: {}   // próximas fases
    };
  }

  /* ---------- mesada: próximo ciclo depois de `now` ---------- */
  function nextCycle(now, cfg) {
    cfg = cfg || CONFIG;
    const off = cfg.tzOffsetMin * 60e3;
    const local = new Date(now + off); // campos UTC = relógio do fuso do ciclo
    const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), cfg.allowanceHour);
    let t = base + ((cfg.allowanceDay - local.getUTCDay() + 7) % 7) * DAY - off;
    if (t <= now) t += WEEK;
    return t;
  }

  /* ---------- contas ---------- */
  function findByName(eco, name) {
    const k = nameKey(name);
    return Object.values(eco.users).find((u) => u.nameKey === k) || null;
  }
  function checkName(eco, name, cfg) {
    cfg = cfg || CONFIG;
    if (!cfg.signupOpen) return "O cadastro está fechado no momento.";
    const n = cleanName(name);
    if (n.length < 2) return "O nome precisa de pelo menos 2 letras.";
    if (findByName(eco, n)) return "Já existe uma conta com esse nome.";
    return null;
  }
  function addUser(eco, u, now, cfg) {
    cfg = cfg || CONFIG;
    const err = checkName(eco, u.name, cfg);
    if (err) return err;
    if (!u.id || eco.users[u.id]) return "Não deu para criar a conta. Tente de novo.";
    const name = cleanName(u.name);
    eco.users[u.id] = { id: u.id, name, nameKey: nameKey(name), admin: !!u.admin, createdAt: now, auth: u.auth, wallet: { free: 0, reserved: 0 }, nextAllowanceAt: nextCycle(now, cfg) };
    if (cfg.signupBonus > 0) credit(eco, u.id, cfg.signupBonus, "signup", now);
    eco.seq++;
    return null;
  }
  function setAuth(eco, uid, auth) {
    const u = eco.users[uid];
    if (!u) return "Conta não encontrada.";
    u.auth = auth; eco.seq++;
    return null;
  }

  /* ---------- sessões (o servidor guarda só o hash do token) ---------- */
  function addSession(eco, hash, uid, now, cfg) {
    cfg = cfg || CONFIG;
    pruneSessions(eco, now);
    eco.sessions[hash] = { uid, createdAt: now, expiresAt: now + cfg.sessionDays * DAY };
    eco.seq++;
  }
  function sessionUser(eco, hash, now) {
    const s = eco.sessions[hash];
    return s && s.expiresAt > now && eco.users[s.uid] ? s.uid : null;
  }
  function revokeSession(eco, hash) { if (eco.sessions[hash]) { delete eco.sessions[hash]; eco.seq++; } }
  function revokeSessions(eco, uid, keepHash) {
    for (const [h, s] of Object.entries(eco.sessions)) if (s.uid === uid && h !== keepHash) delete eco.sessions[h];
    eco.seq++;
  }
  function pruneSessions(eco, now) { for (const [h, s] of Object.entries(eco.sessions)) if (s.expiresAt <= now) delete eco.sessions[h]; }

  /* ---------- carteira ---------- */
  function entry(eco, uid, delta, kind, now, ref) {
    eco.ledger.push({ id: eco.nextId++, at: now, uid, delta, kind, ref: ref || null });
  }
  function credit(eco, uid, amount, kind, now, ref) {
    const u = eco.users[uid];
    if (!u) return "Conta não encontrada.";
    if (!isAmount(amount)) return "Valor inválido.";
    u.wallet.free += amount;
    entry(eco, uid, amount, kind, now, ref); eco.seq++;
    return null;
  }
  function debit(eco, uid, amount, kind, now, ref) {
    const u = eco.users[uid];
    if (!u) return "Conta não encontrada.";
    if (!isAmount(amount)) return "Valor inválido.";
    if (amount > u.wallet.free) return `Saldo insuficiente: você tem ${money(u.wallet.free)} livres.`;
    u.wallet.free -= amount;
    entry(eco, uid, -amount, kind, now, ref); eco.seq++;
    return null;
  }
  // reserva: o dinheiro continua seu, mas fica preso (lance vencedor de um leilão)
  function reserve(eco, uid, amount) {
    const u = eco.users[uid];
    if (!u) return "Conta não encontrada.";
    if (!isAmount(amount)) return "Valor inválido.";
    if (amount > u.wallet.free) return `Saldo insuficiente: você tem ${money(u.wallet.free)} livres.`;
    u.wallet.free -= amount; u.wallet.reserved += amount; eco.seq++;
    return null;
  }
  function release(eco, uid, amount) {
    const u = eco.users[uid];
    if (!u) return "Conta não encontrada.";
    if (!isAmount(amount) || amount > u.wallet.reserved) return "Valor reservado inválido.";
    u.wallet.reserved -= amount; u.wallet.free += amount; eco.seq++;
    return null;
  }
  // paga com o dinheiro que estava reservado
  function capture(eco, uid, amount, kind, now, ref) {
    const u = eco.users[uid];
    if (!u) return "Conta não encontrada.";
    if (!isAmount(amount) || amount > u.wallet.reserved) return "Valor reservado inválido.";
    u.wallet.reserved -= amount;
    entry(eco, uid, -amount, kind, now, ref); eco.seq++;
    return null;
  }

  /* ---------- tempo: mesada semanal ---------- */
  // Idempotente: paga só quem chegou no ciclo e já reagenda. Devolve quem recebeu.
  function tick(eco, now, cfg) {
    cfg = cfg || CONFIG;
    const paid = [];
    for (const u of Object.values(eco.users)) {
      if (now < u.nextAllowanceAt) continue;
      const missed = 1 + Math.floor((now - u.nextAllowanceAt) / WEEK);
      u.nextAllowanceAt += missed * WEEK;
      const weeks = Math.min(missed, Math.max(1, cfg.allowanceCatchUp));
      if (cfg.allowance > 0) { credit(eco, u.id, cfg.allowance * weeks, "allowance", now, weeks > 1 ? `${weeks} semanas` : null); paid.push(u.id); }
      eco.seq++;
    }
    return paid;
  }

  /* ---------- notas e raridade ---------- */
  const SOURCES = { imdb: "IMDb", metacritic: "Metacritic", rt: "Rotten Tomatoes" };
  // "8.8/10", "74/100" e "87%" viram 0 a 10
  function parseScore(txt) {
    const a = String(txt).match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+)/);
    if (a) return clampScore(parseFloat(a[1].replace(",", ".")) / parseFloat(a[2]) * 10);
    const p = String(txt).match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (p) return clampScore(parseFloat(p[1].replace(",", ".")) / 10);
    return null;
  }
  const clampScore = (v) => (Number.isFinite(v) && v >= 0 && v <= 10 ? Math.round(v * 100) / 100 : null);
  const round1 = (v) => Math.round(v * 10) / 10;
  const scoreOf = (scores, k) => (scores && scores[k] != null && scores[k] !== "" ? clampScore(+scores[k]) : null);
  // nota de referência: média ponderada das notas disponíveis (scoreWeights); null se houver menos que o mínimo.
  // A Unanimidade compara as notas como vieram, sem peso.
  function refRating(scores, cfg) {
    cfg = cfg || CONFIG;
    const W = cfg.scoreWeights || {}, vals = [];
    let sum = 0, wsum = 0;
    Object.keys(SOURCES).forEach((k) => {
      const v = scoreOf(scores, k), w = W[k] == null ? 1 : W[k];
      if (v == null) return;
      vals.push(v); sum += v * w; wsum += w;
    });
    if (vals.length < cfg.minScores || !(wsum > 0)) return null;
    const spread = round1(Math.max(...vals) - Math.min(...vals));
    return { ref: round1(sum / wsum), n: vals.length, spread, unanimous: spread <= cfg.unanimityMaxSpread };
  }
  const rarityIndex = (key, cfg) => (cfg || CONFIG).rarities.findIndex((r) => r.key === key);
  // faixa invertida (Tomate Podre): vale para nota de referência até `max`, em vez de a partir de `min`
  const inverted = (r) => r.max != null;
  function rarityOf(ref, garimpo, n, cfg) {
    cfg = cfg || CONFIG;
    const fits = (r) => !(r.requireScores > n);
    // a faixa invertida vem antes de tudo, e o Garimpo não mexe nela
    const low = cfg.rarities.find((r) => inverted(r) && ref <= r.max && fits(r));
    if (low) return low.key;
    const R = cfg.rarities.filter((r) => !inverted(r));
    let base = 0;
    R.forEach((r, i) => { if (ref >= r.min && fits(r)) base = i; });
    if (!garimpo) return R[base].key;
    // o Garimpo sobe até o teto, mas nunca rebaixa
    let up = Math.max(base, Math.min(base + cfg.garimpoBoost, R.findIndex((r) => r.key === cfg.garimpoCap)));
    while (up > base && !fits(R[up])) up--;
    return R[up].key;
  }
  const isGarimpo = (links, cfg) => links > 0 && links < cfg.garimpoBelowLinks;
  // pontos do filme na coleção: a nota de referência; na faixa invertida, 10 − nota (quanto pior, mais vale)
  const filmPoints = (f, cfg) => (inverted(rarity(f.rarity, cfg) || {}) ? Math.round((10 - f.ref) * 10) / 10 : f.ref);
  const rarity = (key, cfg) => (cfg || CONFIG).rarities[rarityIndex(key, cfg)] || null;
  // correções manuais (public/market-films.js) por cima do que veio do Wikidata
  function applyOverrides(film, overrides) {
    const o = overrides && overrides[film.id];
    if (!o) return film;
    return Object.assign({}, film, o.film || {}, { scores: Object.assign({}, film.scores, o.scores || {}) });
  }

  /* ---------- catálogo e cópias ---------- */
  const IMDB = /^tt\d{5,10}$/;
  const str = (v, n) => String(v == null ? "" : v).slice(0, n);
  function addFilm(eco, f, now, cfg) {
    cfg = cfg || CONFIG;
    if (!f || !IMDB.test(f.id)) return "Código do IMDb inválido.";
    if (eco.films[f.id]) return "Esse filme já está no Mercado.";
    const r = refRating(f.scores, cfg);
    if (!r) return `O filme precisa de pelo menos ${cfg.minScores} notas para entrar no Mercado.`;
    const scores = {};
    Object.keys(SOURCES).forEach((k) => { const v = scoreOf(f.scores, k); if (v != null) scores[k] = v; });
    const links = Math.max(0, Math.floor(+f.links || 0)), garimpo = isGarimpo(links, cfg);
    const key = rarityOf(r.ref, garimpo, r.n, cfg);
    const img = typeof f.img === "string" && /^https:\/\/upload\.wikimedia\.org\//.test(f.img) ? f.img.slice(0, 600) : null;
    eco.films[f.id] = {
      id: f.id, title: str(f.title, 140) || "Sem título", orig: str(f.orig, 140), year: Math.floor(+f.year) || "", dir: str(f.dir, 140),
      g: (Array.isArray(f.g) ? f.g : []).slice(0, 8).map((x) => str(x, 32)), img, wiki: str(f.wiki, 200), links, series: str(f.series, 140),
      scores, ref: r.ref, spread: r.spread, unanimous: r.unanimous, garimpo, rarity: key, oscars: oscarList(f.oscars, cfg),
      supply: rarity(key, cfg).copies, minted: 0, addedAt: now
    };
    Object.keys(cfg.filmTags || {}).forEach((k) => (eco.films[f.id][k] = !!f[k]));   // cult, nacional, marvel, dc…
    eco.seq++;
    return null;
  }
  const ownerOk = (eco, who) => who === "house" || !!eco.users[who];
  // a cópia nasce com o próximo número da tiragem
  function mintCopy(eco, filmId, owner, now) {
    const f = eco.films[filmId];
    if (!f) return "Filme fora do Mercado.";
    if (f.minted >= f.supply) return `Todas as ${f.supply} cópias de ${f.title} já foram emitidas.`;
    if (!ownerOk(eco, owner)) return "Dono inválido.";
    const serial = ++f.minted, id = `${filmId}#${serial}`;
    eco.copies[id] = { id, film: filmId, serial, owner, history: [{ at: now, from: null, to: owner, price: 0, kind: "mint" }] };
    eco.seq++;
    return null;
  }
  // troca de dono; o dinheiro é movido à parte (na mesma mutação do servidor)
  function transferCopy(eco, copyId, to, price, kind, now) {
    const c = eco.copies[copyId];
    if (!c) return "Cópia não encontrada.";
    if (!ownerOk(eco, to)) return "Dono inválido.";
    if (to === c.owner) return "A cópia já é desse dono.";
    if (!(Number.isInteger(price) && price >= 0)) return "Preço inválido.";
    c.history.push({ at: now, from: c.owner, to, price, kind });
    c.owner = to; eco.seq++;
    return null;
  }
  const copyLabel = (eco, c) => `cópia ${c.serial}/${eco.films[c.film].supply}`;
  // famílias de Oscar que o filme ganhou (só as conhecidas no config, na ordem do config)
  const oscarList = (v, cfg) => { const got = new Set(Array.isArray(v) ? v : []); return Object.keys((cfg || CONFIG).oscarFamilies || {}).filter((k) => got.has(k)); };
  // tags do filme (Cult, Nacional…): as chaves de cfg.filmTags que o filme tem
  const filmTags = (f, cfg) => Object.keys((cfg || CONFIG).filmTags || {}).filter((k) => f[k]);
  // atualiza as tags dos filmes do catálogo: { id: { cult, nacional, marvel, dc, oscars } } (só as chaves que vierem)
  function applyTags(eco, byId) {
    let n = 0;
    Object.entries(byId || {}).forEach(([id, t]) => {
      const f = eco.films[id];
      if (!f) return;
      Object.entries(t).forEach(([k, v]) => {
        const nv = k === "oscars" ? oscarList(v) : !!v;
        if (JSON.stringify(f[k]) !== JSON.stringify(nv)) { f[k] = nv; n++; }
      });
    });
    if (n) eco.seq++;
    return n;
  }
  const filmCard = (f) => ({ id: f.id, title: f.title, orig: f.orig, year: f.year, dir: f.dir, g: f.g, img: f.img, wiki: f.wiki, series: f.series || "", scores: f.scores, ref: f.ref, spread: f.spread, unanimous: f.unanimous, garimpo: f.garimpo, rarity: f.rarity, supply: f.supply, minted: f.minted, tags: filmTags(f), oscars: f.oscars || [] });
  const byRarity = (a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity) || b.ref - a.ref || a.title.localeCompare(b.title);
  function collectionOf(eco, uid, now) {
    return Object.values(eco.copies).filter((c) => c.owner === uid)
      .map((c) => ({ id: c.id, serial: c.serial, label: copyLabel(eco, c), history: c.history, film: filmCard(eco.films[c.film]),
        value: refValue(eco, c.film, null, now), buyback: buybackPrice(eco, c.film, null, now), listed: (activeFor(eco, c.id) || {}).id || null }))
      .sort((a, b) => byRarity(a.film, b.film) || a.serial - b.serial);
  }
  function catalogView(eco) {
    const house = {};
    Object.values(eco.copies).forEach((c) => { if (c.owner === "house") house[c.film] = (house[c.film] || 0) + 1; });
    return Object.values(eco.films).map((f) => Object.assign(filmCard(f), { left: f.supply - f.minted, house: house[f.id] || 0, addedAt: f.addedAt || 0 })).sort(byRarity);
  }
  const openFilms = (eco) => Object.values(eco.films).filter((f) => f.minted < f.supply).length;
  // Nota e raridade congelam na primeira cópia emitida; antes disso, seguem a fórmula atual
  // (assim, mudar pesos ou faixas no config vale para os filmes que ainda não têm cópias).
  function refreeze(eco, cfg) {
    cfg = cfg || CONFIG;
    let n = 0;
    Object.values(eco.films).forEach((f) => {
      if (f.minted > 0) return;
      const r = refRating(f.scores, cfg);
      if (!r) return;
      // o Garimpo também segue o config atual (quando o filme guardou o número de páginas)
      const garimpo = f.links ? isGarimpo(f.links, cfg) : !!f.garimpo;
      const key = rarityOf(r.ref, garimpo, r.n, cfg);
      if (f.ref !== r.ref || f.rarity !== key || f.garimpo !== garimpo) n++;
      Object.assign(f, { ref: r.ref, spread: r.spread, unanimous: r.unanimous, garimpo, rarity: key, supply: rarity(key, cfg).copies });
    });
    if (n) eco.seq++;
    return n;
  }
  // notas novas de uma fonte (ex.: {tt…: 8.1} do arquivo do IMDb) para os filmes ainda sem cópias; os congelados não mudam.
  // `keep` lista os filmes com nota corrigida à mão para essa fonte. Depois recalcula nota de referência e raridade.
  function updateScores(eco, src, vals, keep, cfg) {
    let n = 0;
    Object.entries(vals || {}).forEach(([id, v]) => {
      const f = eco.films[id];
      if (!f || f.minted > 0 || (keep && keep.has(id)) || !(v >= 0 && v <= 10) || (f.scores || {})[src] === v) return;
      f.scores = Object.assign({}, f.scores, { [src]: v });
      n++;
    });
    if (n) { eco.seq++; refreeze(eco, cfg); }
    return n;
  }
  // tira do catálogo os filmes sem cópias e sem estreia aberta, menos os que devem ficar;
  // as estreias encerradas sem venda desses filmes saem junto (não sobra histórico apontando para o nada)
  function pruneCatalog(eco, keep) {
    const busy = new Set(Object.values(eco.auctions).filter((a) => a.status === "open").map((a) => a.film));
    let n = 0;
    Object.values(eco.films).forEach((f) => { if (f.minted === 0 && !busy.has(f.id) && !(keep && keep.has(f.id))) { delete eco.films[f.id]; n++; } });
    Object.values(eco.auctions).forEach((a) => { if (!eco.films[a.film]) delete eco.auctions[a.id]; });
    if (n) eco.seq++;
    return n;
  }

  /* ---------- valor de referência e recompra da Casa ---------- */
  // valor base (lance mínimo × fator) na média com as últimas vendas de verdade do filme;
  // filme do gênero em alta na temporada vale mais
  function refValue(eco, filmId, cfg, now) {
    cfg = cfg || CONFIG;
    const f = eco.films[filmId];
    if (!f) return 0;
    const base = rarity(f.rarity, cfg).minBid * cfg.refValueFactor;
    const sales = [];
    Object.values(eco.copies).forEach((c) => { if (c.film === filmId) c.history.forEach((h) => { if (h.price > 0 && h.kind !== "mint" && h.kind !== "buyback") sales.push(h); }); });
    const last = sales.sort((a, b) => b.at - a.at).slice(0, cfg.refValueSales);
    const v = Math.round((base + last.reduce((a, h) => a + h.price, 0)) / (1 + last.length));
    return now != null && inSeason(eco, f, now, cfg) ? Math.round(v * cfg.seasonValueBoost) : v;
  }

  /* ---------- temporada: a cada mês um gênero está em alta ---------- */
  const monthKey = (now, cfg) => { const L = new Date(now + cfg.tzOffsetMin * 60e3); return `${L.getUTCFullYear()}-${String(L.getUTCMonth() + 1).padStart(2, "0")}`; };
  // sorteio fixo pelo mês (todo mundo vê o mesmo gênero); o admin pode trocar para testar
  function season(eco, now, cfg) {
    cfg = cfg || CONFIG;
    now = now == null ? Date.now() : now;
    const key = monthKey(now, cfg), off = cfg.tzOffsetMin * 60e3, L = new Date(now + off);
    const over = eco.house && eco.house.season && eco.house.season.month === key ? eco.house.season.genre : null;
    let h = 0; for (const ch of "temporada-" + key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { genre: over || cfg.seasonGenres[h % cfg.seasonGenres.length], month: key, override: !!over,
      endsAt: Date.UTC(L.getUTCFullYear(), L.getUTCMonth() + 1, 1) - off };
  }
  const inSeason = (eco, f, now, cfg) => (f.g || []).includes(season(eco, now, cfg).genre);
  function setSeason(eco, genre, now, cfg) {
    cfg = cfg || CONFIG;
    if (genre && !cfg.seasonGenres.includes(genre)) return "Gênero fora da lista da temporada.";
    eco.house.season = genre ? { month: monthKey(now, cfg), genre } : null;
    eco.seq++;
    return null;
  }

  /* ---------- pontuação da coleção e ranking ---------- */
  const decadeOf = (y) => (+y ? `anos ${Math.floor(+y / 10) * 10}` : "");
  // pontos de um conjunto com n filmes: começa em pts e sobe step por filme a mais, até max
  const setPoints = (b, n) => (n < b.n ? 0 : Math.min(b.max == null ? Infinity : b.max, b.pts + (n - b.n) * (b.step || 0)));
  function collectionScore(eco, uid, now, cfg) {
    cfg = cfg || CONFIG;
    const films = [...new Set(Object.values(eco.copies).filter((c) => c.owner === uid).map((c) => c.film))].map((id) => eco.films[id]).filter(Boolean);
    const base = Math.round(films.reduce((a, f) => a + filmPoints(f, cfg), 0) * 10) / 10;
    const groups = { series: (f) => f.series, director: (f) => f.dir, decade: (f) => decadeOf(f.year), genre: (f) => (f.g || [])[0] };
    const isTag = (kind) => !!(cfg.filmTags || {})[kind];
    const bonuses = [];
    Object.entries(cfg.collectionBonuses).forEach(([kind, b]) => {
      const count = {}, key = isTag(kind) ? (f) => (f[kind] ? kind : "") : groups[kind];
      films.forEach((f) => { const k = key(f); if (k) count[k] = (count[k] || 0) + 1; });
      // nas tags o próprio nome do bônus já diz tudo (sem rótulo)
      Object.entries(count).forEach(([label, n]) => { if (n >= b.n) bonuses.push({ kind, name: b.name, label: isTag(kind) ? "" : label, n, pts: setPoints(b, n) }); });
    });
    // Oscar: cada família (Melhor filme, Atuação, Roteiro…) é um conjunto
    const os = cfg.oscarSet;
    if (os) Object.entries(cfg.oscarFamilies || {}).forEach(([fam, o]) => {
      const n = films.filter((f) => (f.oscars || []).includes(fam)).length;
      if (n >= os.n) bonuses.push({ kind: "oscar", fam, name: os.name, label: o.name, icon: o.icon, n, pts: setPoints(os, n) });
    });
    const s = season(eco, now, cfg), hot = films.filter((f) => (f.g || []).includes(s.genre)).length;
    if (hot) bonuses.push({ kind: "season", name: "Temporada", label: s.genre, n: hot, pts: hot * cfg.seasonPts });
    const extra = bonuses.reduce((a, b) => a + b.pts, 0);
    return { films: films.length, base, bonuses, total: Math.round((base + extra) * 10) / 10 };
  }
  // coleção de qualquer conta, para o ranking: só o que é público (filmes, cópias, pontos), nada da carteira
  function publicCollection(eco, uid, now, cfg) {
    const u = eco.users[uid];
    if (!u) return null;
    const copies = Object.values(eco.copies).filter((c) => c.owner === uid)
      .map((c) => ({ id: c.id, label: copyLabel(eco, c), film: filmCard(eco.films[c.film]), listed: !!activeFor(eco, c.id) }))
      .sort((a, b) => byRarity(a.film, b.film) || a.id.localeCompare(b.id));
    return { id: u.id, name: u.name, score: collectionScore(eco, uid, now, cfg), copies };
  }
  function rankingView(eco, now, cfg) {
    return Object.values(eco.users).map((u) => Object.assign({ id: u.id, name: u.name }, collectionScore(eco, u.id, now, cfg)))
      .sort((a, b) => b.total - a.total || b.films - a.films || a.name.localeCompare(b.name));
  }

  // vitrine pública (tela inicial, sem login): só o que já é público dentro do Mercado
  function showcase(eco, now, cfg) {
    cfg = cfg || CONFIG;
    const A = auctionsView(eco, null, 0), films = catalogView(eco);
    return {
      open: A.open, featured: A.players.filter((a) => a.status === "open" && a.featured).slice(0, 3), next: A.next,
      ranking: rankingView(eco, now, cfg).slice(0, 5).map((r) => ({ name: r.name, total: r.total, films: r.films })),
      recent: films.slice().sort((a, b) => b.addedAt - a.addedAt || rarityIndex(b.rarity) - rarityIndex(a.rarity)).slice(0, 10),
      season: season(eco, now, cfg),
      stats: { accounts: Object.keys(eco.users).length, films: films.length, copies: Object.values(eco.copies).filter((c) => c.owner !== "house").length }
    };
  }

  /* ---------- teto de cópias por raridade ---------- */
  // conta as cópias que a pessoa tem e os leilões em que ela está na frente (ou tem lance secreto)
  function capCheck(eco, uid, rarityKey, exceptAid, cfg) {
    cfg = cfg || CONFIG;
    const cap = (cfg.rarityCaps || {})[rarityKey];
    if (!cap) return null;
    const owned = Object.values(eco.copies).filter((c) => c.owner === uid && eco.films[c.film].rarity === rarityKey).length;
    const pending = Object.values(eco.auctions).filter((a) => a.id !== exceptAid && a.status === "open" && a.rarity === rarityKey && (a.highBy === uid || (a.sealed || {})[uid])).length;
    return owned + pending >= cap ? `Teto do Mercado: no máximo ${cap} ${cap === 1 ? "cópia" : "cópias"} ${rarity(rarityKey, cfg).name} por jogador (contando os lances na frente).` : null;
  }
  // a Casa nunca paga mais que o lance mínimo da faixa: sem lucro em comprar barato e revender para ela
  function buybackPrice(eco, filmId, cfg, now) {
    cfg = cfg || CONFIG;
    const f = eco.films[filmId];
    if (!f) return 0;
    const minBid = rarity(f.rarity, cfg).minBid;
    return Math.max(1, Math.min(Math.floor(refValue(eco, filmId, cfg, now) * cfg.buybackPct), Math.max(1, minBid - 1)));
  }
  function sellToHouse(eco, uid, copyId, now, cfg) {
    const c = eco.copies[copyId];
    if (!c || c.owner !== uid) return "Essa cópia não é sua.";
    if (activeFor(eco, copyId)) return "Essa cópia está anunciada num leilão.";
    const price = buybackPrice(eco, c.film, cfg, now), f = eco.films[c.film];
    transferCopy(eco, copyId, "house", price, "buyback", now);
    credit(eco, uid, price, "buyback", now, `${f.title} (${copyLabel(eco, c)})`);
    return null;
  }

  /* ---------- estreias: a Casa leiloa uma cópia por evento ---------- */
  // próximo horário do evento (dia, semana ou mês) depois de `now`, no fuso do config
  function nextEstreia(ev, now, cfg) {
    cfg = cfg || CONFIG;
    const off = cfg.tzOffsetMin * 60e3, L = new Date(now + off);
    const at = (y, m, d) => Date.UTC(y, m, d, ev.hour || 0) - off;
    let t;
    if (ev.every === "month") {
      t = at(L.getUTCFullYear(), L.getUTCMonth(), ev.day || 1);
      if (t <= now) t = at(L.getUTCFullYear(), L.getUTCMonth() + 1, ev.day || 1);
    } else {
      t = at(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate());
      if (ev.every === "week") t += ((ev.weekday - L.getUTCDay() + 7) % 7) * DAY;
      if (t <= now) t += ev.every === "week" ? WEEK : DAY;
    }
    return t;
  }
  // sorteia um filme das faixas do evento que ainda tenha cópia para emitir ou cópia no estoque da Casa
  // genres (estreia personalizada): se vier, o filme precisa ter pelo menos um desses gêneros
  function lotCandidates(eco, bands, genres) {
    const busy = new Set(Object.values(eco.auctions).filter((a) => a.kind === "house" && a.status === "open").map((a) => a.film));
    const stock = {}, gs = genres && genres.length ? new Set(genres) : null;
    Object.values(eco.copies).forEach((c) => { if (c.owner === "house") (stock[c.film] = stock[c.film] || []).push(c.id); });
    const cands = Object.values(eco.films).filter((f) => bands.includes(f.rarity) && (!gs || (f.g || []).some((g) => gs.has(g))) && !busy.has(f.id) && (f.minted < f.supply || stock[f.id]))
      .sort((a, b) => a.id.localeCompare(b.id));
    return { cands, lotOf: (f) => ({ film: f.id, copy: stock[f.id] ? stock[f.id].sort()[0] : null }) };
  }
  function pickLot(eco, bands, rng, genres) {
    const { cands, lotOf } = lotCandidates(eco, bands, genres);
    return cands.length ? lotOf(cands[Math.floor((rng || Math.random)() * cands.length)]) : null;
  }
  // extra: campos que a estreia personalizada troca (formato, lance mínimo, preço do relógio, Casa disputando)
  function openAuction(eco, ev, lot, now, extra) {
    const f = eco.films[lot.film];
    if (!f) return "Filme fora do Mercado.";
    eco.auctionSeq = (eco.auctionSeq || 0) + 1;
    const id = "a" + eco.auctionSeq;
    eco.auctions[id] = Object.assign({ id, kind: "house", event: ev.key, eventName: ev.name, film: f.id, copy: lot.copy || null, rarity: f.rarity, minBid: rarity(f.rarity).minBid,
      startsAt: now, endsAt: now + ev.minutes * 60e3, high: 0, highBy: null, bids: [], extended: 0, status: "open", result: null }, extra || {});
    eco.seq++;
    return id;
  }
  // abre as estreias que chegaram na hora e agenda as próximas; devolve os leilões abertos
  function openDueEstreias(eco, now, cfg, rng) {
    cfg = cfg || CONFIG;
    eco.house.next = eco.house.next || {};
    const opened = [];
    cfg.estreias.forEach((ev) => {
      if (!eco.house.next[ev.key]) { eco.house.next[ev.key] = nextEstreia(ev, now, cfg); eco.seq++; }
      if (now < eco.house.next[ev.key]) return;
      const lot = pickLot(eco, ev.bands, rng);
      if (lot) opened.push(openAuction(eco, ev, lot, now));
      eco.house.next[ev.key] = nextEstreia(ev, now, cfg); eco.seq++;
    });
    return opened;
  }
  // modo de teste: cancela as estreias abertas (devolvendo os lances) e abre uma de cada agora
  function restartEstreias(eco, now, cfg, rng) {
    cfg = cfg || CONFIG;
    Object.values(eco.auctions).forEach((a) => { if (a.status === "open" && a.kind === "house") cancelAuction(eco, a.id, now); });
    eco.house.next = {};
    const opened = [];
    cfg.estreias.forEach((ev) => {
      const lot = pickLot(eco, ev.bands, rng);
      if (lot) opened.push(openAuction(eco, ev, lot, now));
      eco.house.next[ev.key] = nextEstreia(ev, now, cfg);
    });
    eco.seq++;
    return opened;
  }
  // admin: abre agora uma estreia do tipo pedido (sem mexer na agenda)
  function openEstreiaNow(eco, key, now, cfg, rng) {
    cfg = cfg || CONFIG;
    const ev = cfg.estreias.find((x) => x.key === key);
    if (!ev) return { error: "Estreia desconhecida." };
    const lot = pickLot(eco, ev.bands, rng);
    if (!lot) return { error: `Não há filme livre para a ${ev.name.toLowerCase()} (faixas ${ev.bands.map((b) => rarity(b, cfg).name).join(" e ")}).` };
    return { id: openAuction(eco, ev, lot, now) };
  }
  // admin: estreias personalizadas, abertas agora e fora da agenda
  // o: { film (id) ou bands e genres (para sortear; vazio = todos), count (quantas, só no sorteio), format, minutes,
  //      minBid, startPrice (relógio), ghost, name }
  // Tudo ou nada: com count > 1, cada estreia sai com um filme diferente, e nenhuma abre se faltar filme ou um valor não servir
  function openCustomEstreia(eco, o, now, cfg, rng) {
    cfg = cfg || CONFIG;
    const C = cfg.customEstreia || {};
    const format = String(o.format || "open");
    if (!FORMATS[format]) return { error: "Formato inválido." };
    const minutes = Math.floor(+o.minutes);
    if (!(minutes >= 1 && minutes <= (C.maxMinutes || 10080))) return { error: `A duração precisa ser de 1 minuto a ${Math.floor((C.maxMinutes || 10080) / 1440)} dias.` };
    const count = o.count == null ? 1 : Math.floor(+o.count), maxCount = C.maxCount || 10;
    if (!(count >= 1 && count <= maxCount)) return { error: `Dá para abrir de 1 a ${maxCount} estreias de uma vez.` };
    let lots;
    if (o.film) {
      if (count !== 1) return { error: "Com o filme escolhido, é uma estreia por vez." };
      const f = eco.films[o.film];
      if (!f) return { error: "Esse filme não está no catálogo." };
      if (Object.values(eco.auctions).some((a) => a.kind === "house" && a.status === "open" && a.film === f.id)) return { error: `${f.title} já está numa estreia aberta.` };
      const stock = Object.values(eco.copies).filter((c) => c.owner === "house" && c.film === f.id).map((c) => c.id).sort();
      if (!stock.length && f.minted >= f.supply) return { error: `Todas as cópias de ${f.title} já foram emitidas e a Casa não tem nenhuma no estoque.` };
      lots = [{ film: f.id, copy: stock[0] || null }];
    } else {
      const bands = (Array.isArray(o.bands) ? o.bands : []).filter((k) => rarity(k, cfg));
      const genres = (Array.isArray(o.genres) ? o.genres : []).map(String).filter(Boolean);
      const { cands, lotOf } = lotCandidates(eco, bands.length ? bands : cfg.rarities.map((r) => r.key), genres);
      if (!cands.length) return { error: `Não há filme livre nessas raridades${genres.length ? " e gêneros" : ""} (sem cópias para emitir nem no estoque da Casa).` };
      if (cands.length < count) return { error: `Só ${cands.length} ${cands.length === 1 ? "filme entra" : "filmes entram"} nesse sorteio: não dá para abrir ${count} estreias.` };
      const pool = cands.slice();
      lots = Array.from({ length: count }, () => lotOf(pool.splice(Math.floor((rng || Math.random)() * pool.length), 1)[0]));
    }
    const max = cfg.dutchMaxStart, many = lots.length > 1;
    const name = String(o.name || "").replace(/\s+/g, " ").trim().slice(0, C.maxName || 40) || C.name || "Estreia especial";
    // a Casa (comprador fantasma) só disputa no Aberto, como nas estreias da agenda
    const ghost = format === "open" && o.ghost !== false, plans = [];
    for (const lot of lots) {
      const f = eco.films[lot.film], of = many ? ` (${f.title})` : "";
      // sem valor escolhido, começa no lance mínimo da raridade de cada filme
      const minBid = o.minBid ? Math.floor(+o.minBid) : rarity(f.rarity, cfg).minBid;
      if (!(minBid >= 1 && minBid <= max)) return { error: `O lance mínimo precisa ser de ${money(1)} a ${money(max)}.` };
      let startPrice = 0;
      if (format === "dutch") {
        startPrice = Math.floor(+o.startPrice);
        if (!(startPrice > minBid && startPrice <= max)) return { error: `No relógio, o preço inicial precisa ser maior que ${money(minBid)}${of} e no máximo ${money(max)}.` };
      }
      plans.push([lot, { format, minBid, startPrice, reserve: 0, sealed: {}, ghost }]);
    }
    const ids = plans.map(([lot, extra]) => openAuction(eco, { key: "custom", name, minutes }, lot, now, extra));
    return { id: ids[0], ids, film: lots[0].film, films: lots.map((l) => l.film) };
  }
  // admin: visão de todas as contas para conferir carteiras e coleções
  function accountsView(eco) {
    return Object.values(eco.users).map((u) => ({ id: u.id, name: u.name, admin: u.admin, wallet: Object.assign({}, u.wallet),
      copies: collectionOf(eco, u.id).map((c) => ({ id: c.id, title: c.film.title, rarity: c.film.rarity, label: c.label })) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  /* ---------- leilões dos jogadores ---------- */
  const FORMATS = {
    open: { name: "Aberto", desc: "Lances à vista, sempre maiores. Lance no fim prorroga o relógio." },
    sealed: { name: "Lance secreto", desc: "Cada um dá um lance escondido (pode trocar até o fim). O maior leva e paga o próprio lance." },
    vickrey: { name: "Secreto de 2º preço", desc: "Lances escondidos. O maior leva, mas paga o valor do segundo maior lance." },
    dutch: { name: "Relógio holandês", desc: "O preço começa alto e cai até o mínimo. O primeiro a comprar leva." }
  };
  const isActive = (a) => a.status === "open" || a.status === "scheduled";
  const activeFor = (eco, copyId) => Object.values(eco.auctions).find((a) => isActive(a) && a.copy === copyId) || null;
  const freeFeature = (key, cfg) => rarityIndex(key, cfg) >= rarityIndex(cfg.featureFreeFrom, cfg);
  const listingCost = (eco, copyId, featured, cfg) => {
    cfg = cfg || CONFIG;
    const c = eco.copies[copyId], f = c && eco.films[c.film];
    return cfg.listingFee + (f && featured && !freeFeature(f.rarity, cfg) ? cfg.featureFee : 0);
  };
  // anuncia uma cópia da coleção: cobra a taxa de abertura (e a de vitrine), trava a cópia até o fim
  function listCopy(eco, uid, o, now, cfg) {
    cfg = cfg || CONFIG;
    const u = eco.users[uid], c = eco.copies[o.copy];
    if (!u) return { error: "Conta não encontrada." };
    if (!c || c.owner !== uid) return { error: "Essa cópia não é sua." };
    if (activeFor(eco, c.id)) return { error: "Essa cópia já está anunciada." };
    if (!FORMATS[o.format] || !cfg.userFormats.includes(o.format)) return { error: "Formato inválido." };
    const minutes = Math.floor(+o.minutes);
    if (!cfg.userDurations.includes(minutes)) return { error: "Duração inválida." };
    const startsAt = o.startsAt ? Math.floor(+o.startsAt) : now;
    if (!(startsAt >= now - 5 * 60e3 && startsAt <= now + cfg.maxScheduleDays * DAY)) return { error: `O início precisa ser entre agora e daqui a ${cfg.maxScheduleDays} dias.` };
    const active = Object.values(eco.auctions).filter((a) => a.kind === "user" && isActive(a));
    if (active.length >= cfg.maxActiveUserAuctions) return { error: `O Mercado já tem ${cfg.maxActiveUserAuctions} leilões de jogadores anunciados. Espere um terminar.` };
    if (active.filter((a) => a.seller === uid).length >= cfg.maxActivePerUser) return { error: `Cada jogador pode ter até ${cfg.maxActivePerUser} leilões anunciados ao mesmo tempo.` };
    const f = eco.films[c.film], minBid = rarity(f.rarity, cfg).minBid;
    const reserve = o.reserve ? Math.floor(+o.reserve) : 0;
    if (!(reserve >= 0 && reserve <= cfg.dutchMaxStart)) return { error: "Preço de reserva inválido." };
    // lance inicial (Aberto e secretos): o dono escolhe; sem escolha, começa no lance mínimo da raridade
    const startBid = o.format !== "dutch" && o.startBid ? Math.floor(+o.startBid) : 0;
    if (startBid && !(startBid >= minBid && startBid <= cfg.dutchMaxStart)) return { error: `O lance inicial precisa ser de ${money(minBid)} a ${money(cfg.dutchMaxStart)}.` };
    let startPrice = 0;
    if (o.format === "dutch") {
      startPrice = Math.floor(+o.startPrice);
      const floor = Math.max(minBid, reserve);
      if (!(startPrice > floor && startPrice <= cfg.dutchMaxStart)) return { error: `No relógio, o preço inicial precisa ser maior que ${money(floor)} e no máximo ${money(cfg.dutchMaxStart)}.` };
    }
    const free = freeFeature(f.rarity, cfg), featured = free || !!o.featured;
    const fee = listingCost(eco, c.id, featured, cfg);
    if (fee > u.wallet.free) return { error: `Anunciar custa ${money(fee)} e você tem ${money(u.wallet.free)} livres.` };
    const ref = `${f.title} (${copyLabel(eco, c)})`;
    if (cfg.listingFee > 0) debit(eco, uid, cfg.listingFee, "fee", now, "anúncio: " + ref);
    if (fee > cfg.listingFee) debit(eco, uid, fee - cfg.listingFee, "fee", now, "vitrine: " + ref);
    const st = Math.max(startsAt, now);
    eco.auctionSeq = (eco.auctionSeq || 0) + 1;
    const id = "a" + eco.auctionSeq;
    eco.auctions[id] = { id, kind: "user", seller: uid, format: o.format, film: f.id, copy: c.id, rarity: f.rarity, minBid: Math.max(minBid, startBid), reserve, startPrice, featured,
      startsAt: st, endsAt: st + minutes * 60e3, high: 0, highBy: null, bids: [], sealed: {}, extended: 0, status: st > now ? "scheduled" : "open", result: null, createdAt: now };
    eco.seq++;
    return { id };
  }
  // o dono desiste: só antes de ter lance (a taxa de anúncio não volta)
  function unlist(eco, uid, aid, now) {
    const a = eco.auctions[aid];
    if (!a || a.kind !== "user" || a.seller !== uid) return "Esse anúncio não é seu.";
    if (!isActive(a)) return "Esse leilão já terminou.";
    if (a.highBy || Object.keys(a.sealed || {}).length) return "Já tem lance: o leilão vai até o fim.";
    return cancelAuction(eco, aid, now);
  }
  // relógio holandês: cai em linha reta do preço inicial até o mínimo (lance mínimo da raridade ou o que o dono pediu)
  const dutchFloor = (a) => Math.max(a.minBid, a.reserve || 0);
  function dutchPrice(a, now) {
    const t = Math.min(1, Math.max(0, (now - a.startsAt) / Math.max(1, a.endsAt - a.startsAt)));
    return Math.max(dutchFloor(a), Math.round(a.startPrice - (a.startPrice - dutchFloor(a)) * t));
  }
  function dutchBuy(eco, a, uid, now) {
    const price = dutchPrice(a, now), u = eco.users[uid];
    if (price > u.wallet.free) return `O preço agora é ${money(price)} e você tem ${money(u.wallet.free)} livres.`;
    reserve(eco, uid, price);
    a.high = price; a.highBy = uid; a.bids.push({ uid, v: price, at: now });
    return closeAuction(eco, a.id, now);
  }
  // lance secreto (1º ou 2º preço): o valor fica reservado e dá para trocar até o fim; empate fica com quem mandou antes
  function sealedBid(eco, a, uid, v) {
    const u = eco.users[uid], old = a.sealed[uid];
    if (!(v >= a.minBid)) return `O lance mínimo é ${money(a.minBid)}.`;
    if (v - (old ? old.v : 0) > u.wallet.free) return `Saldo insuficiente: você tem ${money(u.wallet.free)} livres.`;
    if (old) release(eco, uid, old.v);
    reserve(eco, uid, v);
    return { v, keepAt: !!old && old.v === v };
  }

  // lance: no Aberto precisa cobrir o mínimo (ou o maior lance + 1) com saldo livre; o valor fica reservado
  // e o lance anterior volta para quem foi superado. Lance no fim prorroga o relógio.
  // Nos outros formatos dos jogadores, o mesmo pedido vira lance secreto ou compra no relógio.
  // rng: sorteio da cobertura da Casa nas estreias (o servidor passa o próprio; os testes passam um fixo)
  function bid(eco, aid, uid, amount, now, cfg, rng) {
    cfg = cfg || CONFIG;
    const a = eco.auctions[aid];
    if (a && a.status === "scheduled") return "Esse leilão ainda não começou.";
    if (!a || a.status !== "open") return "Esse leilão não está aberto.";
    if (now >= a.endsAt) return "Esse leilão já terminou.";
    const u = eco.users[uid];
    if (!u) return "Conta não encontrada.";
    if (a.seller === uid) return "Você não pode dar lance no próprio leilão.";
    const capErr = capCheck(eco, uid, a.rarity, a.id, cfg);
    if (capErr) return capErr;
    if (a.format === "dutch") return dutchBuy(eco, a, uid, now);
    if (a.format === "sealed" || a.format === "vickrey") {
      const r = sealedBid(eco, a, uid, Math.floor(+amount));
      if (typeof r === "string") return r;
      a.sealed[uid] = { v: r.v, at: r.keepAt ? a.sealed[uid].at : now };
      eco.seq++;
      return null;
    }
    if (a.highBy === uid) return "Seu lance já está na frente.";
    const v = Math.floor(+amount), min = a.highBy ? a.high + 1 : a.minBid;
    if (!(v >= min)) return `O lance mínimo agora é ${money(min)}.`;
    if (v > u.wallet.free) return `Saldo insuficiente: você tem ${money(u.wallet.free)} livres.`;
    if (a.highBy && a.highBy !== "house") release(eco, a.highBy, a.high);
    a.bids.push({ uid, v, at: now });
    if (a.endsAt - now <= cfg.extendWindowSec * 1000) { a.endsAt += cfg.extendBySec * 1000; a.extended++; }
    // comprador fantasma: a cada lance abaixo do teto da faixa, a Casa pode cobrir. A chance começa na da faixa
    // e cai a cada cobertura; cada cobertura pula um pedaço do caminho até o teto (nunca passa dele)
    const ceiling = a.kind === "house" && cfg.ghostBuyer ? ghostCeiling(eco, a, now, cfg) : 0;
    if (v < ceiling && (rng || Math.random)() < ghostChance(a, cfg)) {
      const hv = Math.min(ceiling, v + Math.max(1, Math.round((ceiling - a.minBid) * (cfg.ghostStep || 0))));
      a.high = hv; a.highBy = "house"; a.bids.push({ uid: "house", v: hv, at: now });
      a.ghostCovers = (a.ghostCovers || 0) + 1;
    } else {
      reserve(eco, uid, v);
      a.high = v; a.highBy = uid;
    }
    eco.seq++;
    return null;
  }
  // teto da Casa: o lance mínimo da faixa + a porcentagem da faixa (fixo: não sobe com vendas nem temporada); 0 = não disputa
  const ghostCeiling = (eco, a, now, cfg) => {
    const p = ((cfg || CONFIG).ghostAbove || {})[a.rarity] || 0;
    return p > 0 ? Math.round(a.minBid * (1 + p)) : 0;
  };
  // chance de a Casa cobrir o próximo lance: a da faixa, cortada por ghostDecay a cada cobertura que ela já deu
  const ghostChance = (a, cfg) => {
    cfg = cfg || CONFIG;
    if (a.kind !== "house" || !cfg.ghostBuyer || a.ghost === false) return 0;
    return ((cfg.ghostChance || {})[a.rarity] || 0) * Math.pow(cfg.ghostDecay == null ? 1 : cfg.ghostDecay, a.ghostCovers || 0);
  };
  const releaseAll = (eco, a) => {
    if (a.highBy && a.highBy !== "house") release(eco, a.highBy, a.high);
    Object.entries(a.sealed || {}).forEach(([uid, b]) => release(eco, uid, b.v));
  };
  function cancelAuction(eco, aid, now) {
    const a = eco.auctions[aid];
    if (!a || !isActive(a)) return "Esse leilão não está aberto.";
    releaseAll(eco, a);
    a.status = "canceled"; a.closedAt = now; a.result = { winner: null, price: 0 };
    eco.seq++;
    return null;
  }
  // leilão de jogador: quem vence paga com o reservado; o dono recebe o preço menos a taxa de venda;
  // sem lance ou abaixo da reserva secreta, a cópia fica com o dono e os lances voltam
  const isSecret = (a) => a.format === "sealed" || a.format === "vickrey";
  // fim de um leilão secreto: devolve todos os lances e reserva de novo só o preço de quem venceu
  // (o próprio lance, ou o 2º maior no Vickrey; abaixo da reserva, ninguém vence)
  function settleSealed(eco, a) {
    const bids = Object.entries(a.sealed || {}).map(([uid, b]) => ({ uid, v: b.v, at: b.at })).sort((x, y) => y.v - x.v || x.at - y.at);
    const reveal = bids.map((b) => ({ uid: b.uid, v: b.v }));
    bids.forEach((b) => release(eco, b.uid, b.v));
    let winner = null, price = 0;
    const top = bids[0] ? bids[0].v : 0;
    if (bids[0] && top >= (a.reserve || 0)) {
      winner = bids[0].uid;
      price = a.format === "sealed" ? top : Math.min(top, Math.max(bids[1] ? bids[1].v : a.minBid, a.reserve || 0, a.minBid));
      reserve(eco, winner, price);
    }
    return { winner, price, top, reveal };
  }
  function closeUser(eco, a, now, cfg) {
    let winner = null, price = 0, top = 0, reveal = null;
    if (isSecret(a)) {
      ({ winner, price, top, reveal } = settleSealed(eco, a));
    } else if (a.highBy) {
      top = a.high;
      if (a.high >= (a.reserve || 0)) { winner = a.highBy; price = a.high; } else release(eco, a.highBy, a.high);
    }
    const f = eco.films[a.film], c = eco.copies[a.copy], ref = `${f.title} (${copyLabel(eco, c)})`;
    let fee = 0;
    if (winner) {
      capture(eco, winner, price, "purchase", now, ref);
      transferCopy(eco, c.id, winner, price, "sale", now);
      credit(eco, a.seller, price, "sale", now, ref);
      fee = Math.min(price, Math.round(price * cfg.saleFeePct));
      if (fee > 0) debit(eco, a.seller, fee, "fee", now, "taxa de venda: " + ref);
    }
    a.status = "closed"; a.closedAt = now;
    a.result = { winner, price, fee, copy: winner ? c.id : null, reserveMissed: !winner && top > 0, reveal };
    eco.seq++;
    return null;
  }
  // fecha: o vencedor paga com o dinheiro reservado (sai de circulação) e recebe a cópia
  function closeAuction(eco, aid, now, cfg) {
    cfg = cfg || CONFIG;
    const a = eco.auctions[aid];
    if (!a || !isActive(a)) return "Esse leilão não está aberto.";
    if (a.kind === "user") return closeUser(eco, a, now, cfg);
    const f = eco.films[a.film], secret = isSecret(a);
    const noBid = secret ? !Object.keys(a.sealed || {}).length : !a.highBy || a.highBy === "house";
    // sem lance, ou a Casa (comprador fantasma) terminou na frente: nada é emitido
    if (noBid) { a.status = "closed"; a.closedAt = now; a.result = { winner: null, price: 0, house: a.highBy === "house" }; eco.seq++; return null; }
    let cid = a.copy && eco.copies[a.copy] && eco.copies[a.copy].owner === "house" ? a.copy : null;
    if (!cid && f.minted >= f.supply) return cancelAuction(eco, aid, now);   // tiragem esgotada: devolve os lances
    // estreia personalizada com lance secreto: o vencedor vira o "maior lance" e segue o fechamento normal
    let reveal = null;
    if (secret) {
      const s = settleSealed(eco, a);
      reveal = s.reveal; a.high = s.price; a.highBy = s.winner;
    }
    if (!cid) { mintCopy(eco, a.film, "house", now); cid = `${a.film}#${f.minted}`; }
    capture(eco, a.highBy, a.high, "estreia", now, `${f.title} (${copyLabel(eco, eco.copies[cid])})`);
    transferCopy(eco, cid, a.highBy, a.high, "estreia", now);
    a.status = "closed"; a.closedAt = now; a.result = { winner: a.highBy, price: a.high, copy: cid, reveal };
    eco.seq++;
    return null;
  }
  // fecha os leilões vencidos; devolve os ids fechados
  function tickAuctions(eco, now) {
    return Object.values(eco.auctions).filter((a) => a.status === "open" && now >= a.endsAt).map((a) => (closeAuction(eco, a.id, now), a.id));
  }
  // leilões agendados que chegaram na hora de abrir; devolve os ids
  function startDue(eco, now) {
    const ids = Object.values(eco.auctions).filter((a) => a.status === "scheduled" && now >= a.startsAt).map((a) => a.id);
    ids.forEach((id) => { eco.auctions[id].status = "open"; });
    if (ids.length) eco.seq++;
    return ids;
  }
  const dueAuctions = (eco, now, cfg) => Object.values(eco.auctions).some((a) => (a.status === "open" && now >= a.endsAt) || (a.status === "scheduled" && now >= a.startsAt))
    || (cfg || CONFIG).estreias.some((ev) => !(eco.house.next || {})[ev.key] || now >= eco.house.next[ev.key]);
  // o que cada um pode ver: a reserva secreta só para o dono; lances secretos só depois do fim (cada um vê o seu)
  function auctionView(eco, a, viewer) {
    const f = eco.films[a.film], nameOf = (id) => (id === "house" ? "Casa" : (eco.users[id] || {}).name || "Alguém");
    const serial = a.copy ? eco.copies[a.copy].serial : isActive(a) ? f.minted + 1 : null;
    const fmt = a.format || "open", secret = fmt === "sealed" || fmt === "vickrey", seller = !!viewer && a.seller === viewer;
    const v = { id: a.id, kind: a.kind, event: a.event || null, eventName: a.eventName || null, film: filmCard(f), lot: serial ? `cópia ${serial}/${f.supply}` : "",
      fromStock: a.kind === "house" && !!a.copy, format: fmt, formatName: FORMATS[fmt].name, seller: a.seller || null, sellerName: a.seller ? nameOf(a.seller) : null, isSeller: seller,
      featured: !!a.featured, minBid: a.minBid, startsAt: a.startsAt, endsAt: a.endsAt, extended: a.extended || 0, status: a.status, closedAt: a.closedAt || null,
      high: secret ? 0 : a.high, highBy: secret ? null : a.highBy, highName: !secret && a.highBy ? nameOf(a.highBy) : null,
      houseChance: a.kind === "house" && isActive(a) && (a.high || 0) < ghostCeiling(eco, a, 0, CONFIG) ? Math.round(ghostChance(a) * 100) : 0,
      mine: !!viewer && (secret ? !!(a.sealed || {})[viewer] : a.highBy === viewer), bids: secret ? Object.keys(a.sealed || {}).length : a.bids.length,
      hasReserve: fmt !== "dutch" && (a.reserve || 0) > 0, reserve: seller || fmt === "dutch" ? a.reserve || 0 : null,
      result: a.result && Object.assign({}, a.result, { winnerName: a.result.winner ? nameOf(a.result.winner) : null,
        reveal: a.result.reveal ? a.result.reveal.map((b) => ({ name: nameOf(b.uid), v: b.v, me: b.uid === viewer })) : null }) };
    if (secret) v.myBid = viewer && a.sealed[viewer] ? a.sealed[viewer].v : null;
    if (fmt === "dutch") Object.assign(v, { startPrice: a.startPrice, floor: dutchFloor(a) });
    return v;
  }
  // estreias abertas (mais raras no topo), leilões dos jogadores (vitrine primeiro) e as últimas encerradas
  function auctionsView(eco, viewer, recent) {
    const all = Object.values(eco.auctions);
    const open = all.filter((a) => a.kind === "house" && a.status === "open").sort((a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity) || a.endsAt - b.endsAt);
    const players = all.filter((a) => a.kind === "user" && isActive(a))
      .sort((a, b) => (b.featured - a.featured) || (a.status === b.status ? 0 : a.status === "open" ? -1 : 1) || a.startsAt - b.startsAt || a.endsAt - b.endsAt);
    const done = all.filter((a) => !isActive(a)).sort((a, b) => b.closedAt - a.closedAt).slice(0, recent == null ? 8 : recent);
    return { open: open.map((a) => auctionView(eco, a, viewer)), players: players.map((a) => auctionView(eco, a, viewer)),
      recent: done.map((a) => auctionView(eco, a, viewer)), next: Object.assign({}, eco.house.next || {}) };
  }

  /* ---------- leitura ---------- */
  const supply = (eco) => Object.values(eco.users).reduce((a, u) => a + u.wallet.free + u.wallet.reserved, 0);
  function view(eco, uid) {
    const u = eco.users[uid];
    if (!u) return null;
    return { id: u.id, name: u.name, admin: u.admin, createdAt: u.createdAt, wallet: Object.assign({}, u.wallet), nextAllowanceAt: u.nextAllowanceAt };
  }
  function ledgerOf(eco, uid, n) {
    const out = [];
    for (let i = eco.ledger.length - 1; i >= 0 && out.length < (n || CONFIG.ledgerView); i--) if (eco.ledger[i].uid === uid) out.push(eco.ledger[i]);
    return out;
  }
  const balanceFromLedger = (eco, uid) => eco.ledger.reduce((a, e) => a + (e.uid === uid ? e.delta : 0), 0);

  return { CONFIG, KINDS, WEEK, cleanName, nameKey, create, nextCycle, findByName, checkName, addUser, setAuth,
    addSession, sessionUser, revokeSession, revokeSessions, pruneSessions,
    credit, debit, reserve, release, capture, tick, supply, view, ledgerOf, balanceFromLedger,
    SOURCES, parseScore, refRating, rarityOf, rarity, rarityIndex, filmPoints, filmTags, applyTags, applyOverrides,
    addFilm, mintCopy, transferCopy, copyLabel, collectionOf, catalogView, openFilms, refreeze, updateScores, pruneCatalog,
    money, refValue, buybackPrice, sellToHouse,
    FORMATS, listCopy, unlist, listingCost, dutchPrice, startDue,
    season, setSeason, setPoints, collectionScore, publicCollection, rankingView, showcase, capCheck, ghostCeiling, ghostChance,
    nextEstreia, pickLot, openAuction, openEstreiaNow, openCustomEstreia, accountsView, openDueEstreias, restartEstreias, bid, cancelAuction, closeAuction, tickAuctions, dueAuctions, auctionView, auctionsView };
});
