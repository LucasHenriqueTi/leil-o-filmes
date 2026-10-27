/* ============================================================
   Martelo Live — motor do jogo
   Roda igual no servidor (Node) e no navegador (modo local).
   Todo o estado é um objeto simples (serializável em JSON).
   O tempo entra sempre como parâmetro `now` (ms), nunca é lido aqui dentro,
   para que servidor e cliente controlem os relógios.
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const COLORS = ["#ff4f6d", "#ffd166", "#4be3b0", "#7aa7ff", "#ff8fd8", "#b48cff", "#ff9d5c", "#5ee0f0", "#d7f26b", "#f2f2f2"];
  const GROUP_TAG = "Indicados pelo grupo";
  const FORMATS = {
    classic: { name: "Aberto", short: "Aberto", desc: "Lances em turnos. Quem passa sai do lote." },
    sealed: { name: "Lance secreto", short: "Secreto", desc: "Todos lançam escondido ao mesmo tempo. Maior lance leva." },
    dutch: { name: "Relógio holandês", short: "Relógio", desc: "O preço cai a cada segundo. Quem apertar primeiro compra." }
  };
  const MAX_PLAYERS = 10;
  const MARKET_BONUS = [3, 2, 1]; // pontos por filme dos 3 gêneros mais disputados

  const DEFAULTS = {
    money: 20,
    maxFilms: 3,
    formats: ["classic"],   // mais de um = cada lote sorteia o formato
    market: false,          // Mercado de gêneros
    missions: false,        // Missões secretas
    turnSeconds: 20,        // tempo por vez no Aberto (0 = sem limite)
    sealedSeconds: 25,      // tempo do Lance secreto (0 = sem limite)
    dutchStepMs: 900,       // a cada quanto tempo o relógio cai R$ 1
    autoNextSeconds: 8      // passa para o próximo lote sozinho (0 = só o host)
  };

  /* ---------- utilidades ---------- */
  const int = (v, min, max, def) => {
    v = Math.floor(Number(v));
    if (!Number.isFinite(v)) return def;
    return Math.max(min, Math.min(max, v));
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const shuffle = (arr, rng) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const primaryGenre = (f) => ((f.g || []).filter((x) => x !== GROUP_TAG)[0]) || "Outros";
  const decade = (y) => (y ? Math.floor(+y / 10) * 10 : null);

  function cleanSettings(s, base) {
    const b = Object.assign({}, DEFAULTS, base || {});
    s = s || {};
    const formats = Array.isArray(s.formats) ? s.formats.filter((f) => FORMATS[f]) : b.formats;
    return {
      money: int(s.money ?? b.money, 1, 9999, DEFAULTS.money),
      maxFilms: int(s.maxFilms ?? b.maxFilms, 1, 50, DEFAULTS.maxFilms),
      formats: formats.length ? [...new Set(formats)] : ["classic"],
      market: !!(s.market ?? b.market),
      missions: !!(s.missions ?? b.missions),
      turnSeconds: int(s.turnSeconds ?? b.turnSeconds, 0, 300, DEFAULTS.turnSeconds),
      sealedSeconds: int(s.sealedSeconds ?? b.sealedSeconds, 0, 300, DEFAULTS.sealedSeconds),
      dutchStepMs: int(s.dutchStepMs ?? b.dutchStepMs, 300, 5000, DEFAULTS.dutchStepMs),
      autoNextSeconds: int(s.autoNextSeconds ?? b.autoNextSeconds, 0, 120, DEFAULTS.autoNextSeconds)
    };
  }

  /* ---------- criação e lobby ---------- */
  function create(settings) {
    return {
      phase: "lobby",          // lobby | playing | over
      settings: cleanSettings(settings),
      players: [],             // {id, name, color, money, donated, films[], connected, missions[]}
      lots: [], idx: 0, lot: null,
      results: [], log: [],
      voting: null, votes: {}, // votação da melhor coleção: null | "open" | "closed"; votes = {quem vota: em quem}
      seq: 0,                  // muda a cada alteração (para saber quando reenviar)
      nextColor: 0
    };
  }
  function addPlayer(st, id, name) {
    name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 18);
    if (!name) return "Digite um nome para entrar.";
    if (st.phase !== "lobby") return "O leilão já começou. Você pode assistir.";
    if (st.players.length >= MAX_PLAYERS) return `A sala está cheia (máximo de ${MAX_PLAYERS} jogadores).`;
    if (st.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return "Já tem alguém com esse nome na sala.";
    st.players.push({ id, name, color: COLORS[st.nextColor++ % COLORS.length], money: 0, donated: 0, films: [], connected: true, missions: [] });
    st.seq++;
    return null;
  }
  function removePlayer(st, id) {
    if (st.phase !== "lobby") return "Só dá para remover jogadores antes do leilão começar.";
    const n = st.players.length;
    st.players = st.players.filter((p) => p.id !== id);
    if (st.players.length !== n) st.seq++;
    return null;
  }
  function setConnected(st, id, on) {
    const p = st.players.find((x) => x.id === id);
    if (p && p.connected !== on) { p.connected = on; st.seq++; }
  }
  /* ---------- doação na sala (sai do dinheiro inicial; guarda R$ 1 para jogar) ---------- */
  const donateLeft = (st, p) => Math.max(0, st.settings.money - (p.donated || 0) - 1);
  function donate(st, id, amount) {
    if (st.phase !== "lobby") return "Doações só valem na sala, antes do leilão começar.";
    const p = st.players.find((x) => x.id === id);
    if (!p) return "Só jogadores podem doar.";
    const v = Math.floor(+amount);
    if (!(v >= 1)) return "A doação mínima é R$ 1.";
    const left = donateLeft(st, p);
    if (v > left) return left > 0 ? `Você pode doar até R$ ${left} e ainda guardar R$ 1 para o leilão.` : "Você precisa guardar pelo menos R$ 1 para o leilão.";
    p.donated = (p.donated || 0) + v;
    st.seq++;
    return null;
  }
  function updateSettings(st, patch) {
    if (st.phase !== "lobby") return "As regras não mudam com o leilão em andamento.";
    st.settings = cleanSettings(patch, st.settings);
    st.seq++;
    return null;
  }

  /* ---------- missões secretas ---------- */
  function missionPool(st) {
    const s = st.settings, lots = st.lots, start = s.money;
    const genreCount = {};
    lots.forEach((f) => (f.g || []).filter((g) => g !== GROUP_TAG).forEach((g) => (genreCount[g] = (genreCount[g] || 0) + 1)));
    const pool = [];
    Object.entries(genreCount).filter(([, c]) => c >= 3).forEach(([g]) =>
      pool.push({ key: "genre:" + g, kind: "genre", genre: g, n: 2, pts: 5, text: `Tenha 2 filmes de ${g}` }));
    pool.push({ key: "saver", kind: "saver", min: Math.ceil(start * 0.4), pts: 4, text: `Termine com pelo menos R$ ${Math.ceil(start * 0.4)} sobrando` });
    pool.push({ key: "bargain", kind: "bargain", max: Math.max(1, Math.floor(start * 0.1)), pts: 3, text: `Arremate um filme por até R$ ${Math.max(1, Math.floor(start * 0.1))}` });
    pool.push({ key: "big", kind: "big", pts: 4, text: "Faça a compra mais cara do leilão" });
    if (lots.filter((f) => +f.year && +f.year < 1990).length >= 2) pool.push({ key: "old", kind: "old", pts: 3, text: "Tenha um filme lançado antes de 1990" });
    if (lots.filter((f) => +f.year >= 2015).length >= 2) pool.push({ key: "new", kind: "new", pts: 3, text: "Tenha um filme lançado de 2015 em diante" });
    if (lots.filter((f) => (f.r || 0) >= 8.5).length >= 2) pool.push({ key: "critic", kind: "critic", pts: 3, text: "Tenha um filme com nota 8,5 ou mais" });
    if (s.maxFilms <= lots.length && s.maxFilms >= 2) pool.push({ key: "full", kind: "full", pts: 4, text: `Complete seu limite de ${s.maxFilms} filmes` });
    if (s.maxFilms >= 2) pool.push({ key: "decade", kind: "decade", pts: 3, text: "Tenha 2 filmes da mesma década" });
    if (s.maxFilms >= 3) pool.push({ key: "variety", kind: "variety", pts: 4, text: "Tenha filmes de 3 gêneros principais diferentes" });
    return pool;
  }
  function checkMission(st, p, m) {
    const films = p.films;
    switch (m.kind) {
      case "genre": return films.filter((f) => (f.g || []).includes(m.genre)).length >= m.n;
      case "saver": return p.money >= m.min;
      case "bargain": return films.some((f) => f.paid <= m.max);
      case "big": {
        const top = Math.max(0, ...st.results.map((r) => r.price || 0));
        return top > 0 && films.some((f) => f.paid === top);
      }
      case "old": return films.some((f) => +f.year && +f.year < 1990);
      case "new": return films.some((f) => +f.year >= 2015);
      case "critic": return films.some((f) => (f.r || 0) >= 8.5);
      case "full": return films.length >= st.settings.maxFilms;
      case "decade": {
        const c = {}; films.forEach((f) => { const d = decade(f.year); if (d) c[d] = (c[d] || 0) + 1; });
        return Object.values(c).some((n) => n >= 2);
      }
      case "variety": return new Set(films.map(primaryGenre)).size >= 3;
    }
    return false;
  }

  /* ---------- início ---------- */
  function cleanFilm(f) {
    const str = (v, n) => String(v ?? "").slice(0, n);
    const img = typeof f.img === "string" && /^https:\/\/(upload\.wikimedia\.org|m\.media-amazon\.com)\//.test(f.img) ? f.img.slice(0, 600) : null;
    return {
      id: str(f.id, 24), title: str(f.title, 140) || "Sem título", orig: str(f.orig, 140), year: int(f.year, 0, 3000, 0) || "",
      dir: str(f.dir, 140), g: (Array.isArray(f.g) ? f.g : []).slice(0, 8).map((x) => str(x, 32)),
      r: Number.isFinite(+f.r) && f.r !== null && f.r !== "" ? Math.round(Math.max(0, Math.min(10, +f.r)) * 10) / 10 : null,
      rsrc: str(f.rsrc, 24), img, wiki: str(f.wiki, 200), by: str(f.by, 30)
    };
  }
  function start(st, lots, now, rng) {
    rng = rng || Math.random;
  st.clock = now;
    if (st.players.length < 2) return "O leilão precisa de pelo menos 2 jogadores.";
    if (!Array.isArray(lots) || !lots.length) return "Escolha pelo menos 1 filme para leiloar.";
    const seen = new Set();
    st.lots = lots.slice(0, 200).map(cleanFilm).filter((f) => f.id && !seen.has(f.id) && seen.add(f.id));
    if (!st.lots.length) return "Nenhum filme válido para leiloar.";
    const fm = st.settings.formats;
    st.lots.forEach((f, i) => (f.format = fm.length === 1 ? fm[0] : fm[Math.floor(rng() * fm.length)]));
    st.players.forEach((p) => { p.money = Math.max(1, st.settings.money - (p.donated || 0)); p.films = []; p.missions = []; });
    if (st.settings.missions) {
      const pool = missionPool(st);
      const order = shuffle(pool, rng);
      st.players.forEach((p, i) => { p.missions = [clone(order[i % order.length])]; });
    }
    st.phase = "playing"; st.idx = 0; st.results = []; st.log = []; st.starter = 0; st.voting = null; st.votes = {};
    startLot(st, now);
    st.seq++;
    return null;
  }

  const canPlay = (st, p) => p.money >= 1 && p.films.length < st.settings.maxFilms;
  const byId = (st, id) => st.players.find((p) => p.id === id);
  function log(st, entry) { entry.at = st.clock || 0; st.log.unshift(entry); if (st.log.length > 250) st.log.length = 250; }

  function startLot(st, now) {
    if (st.idx >= st.lots.length || !st.players.some((p) => canPlay(st, p))) return finish(st);
    const f = st.lots[st.idx], s = st.settings;
    const eligible = st.players.filter((p) => canPlay(st, p)).map((p) => p.id);
    const lot = { format: f.format, stage: "bid", eligible, startedAt: now };
    if (f.format === "classic") {
      Object.assign(lot, { high: 0, highBy: null, inLot: eligible.slice(), passed: [] });
      // quem abre gira a cada lote
      const n = st.players.length;
      let i = st.starter % n, k = 0;
      while (!eligible.includes(st.players[i].id) && k++ < n) i = (i + 1) % n;
      lot.turn = st.players[i].id;
      lot.deadline = s.turnSeconds ? now + s.turnSeconds * 1000 : null;
    } else if (f.format === "sealed") {
      Object.assign(lot, { bids: {}, deadline: s.sealedSeconds ? now + s.sealedSeconds * 1000 : null });
    } else {
      const top = Math.max(...eligible.map((id) => byId(st, id).money));
      Object.assign(lot, { price: top, startPrice: top, nextAt: now + s.dutchStepMs + 1200, step: s.dutchStepMs, floorHits: 0 });
    }
    st.lot = lot;
    log(st, { k: "lot", n: st.idx + 1, title: f.title, format: f.format });
    if (f.format === "classic") classicAutoSkip(st, now);
  }

  /* ---------- Aberto ---------- */
  function classicNext(st, now) {
    const lot = st.lot, ids = st.players.map((p) => p.id), n = ids.length;
    const cur = ids.indexOf(lot.turn);
    for (let k = 1; k <= n; k++) {
      const c = ids[(cur + k) % n];
      if (lot.inLot.includes(c) && c !== lot.highBy) {
        lot.turn = c;
        lot.deadline = st.settings.turnSeconds ? now + st.settings.turnSeconds * 1000 : null;
        return classicAutoSkip(st, now);
      }
    }
    closeLot(st, now);
  }
  function classicAutoSkip(st, now) {
    const lot = st.lot;
    if (!lot.inLot.length) return closeLot(st, now);
    if (lot.highBy && lot.inLot.every((i) => i === lot.highBy)) return closeLot(st, now);
    const p = byId(st, lot.turn);
    if (p.money <= lot.high) {
      lot.inLot = lot.inLot.filter((i) => i !== p.id);
      log(st, { k: "broke", p: p.id, v: lot.high });
      return classicNext(st, now);
    }
  }

  /* ---------- fechamento ---------- */
  function sell(st, pid, price, now, extra) {
    const f = st.lots[st.idx], p = byId(st, pid);
    p.money -= price;
    p.films.push(Object.assign({}, f, { paid: price, lot: st.idx + 1 }));
    st.results.push({ id: f.id, title: f.title, by: pid, price, format: f.format });
    st.lot.stage = "done";
    st.lot.result = Object.assign({ by: pid, price }, extra || {});
    log(st, { k: "sold", p: pid, v: price, title: f.title });
  }
  function unsold(st, now, extra) {
    const f = st.lots[st.idx];
    st.results.push({ id: f.id, title: f.title, by: null, price: 0, format: f.format });
    st.lot.stage = "done";
    st.lot.result = Object.assign({ by: null, price: 0 }, extra || {});
    log(st, { k: "unsold", title: f.title });
  }
  function afterClose(st, now) {
    st.lot.deadline = st.settings.autoNextSeconds ? now + st.settings.autoNextSeconds * 1000 : null;
  }
  function closeLot(st, now) {
    const lot = st.lot;
    if (lot.format === "classic") {
      if (lot.highBy) sell(st, lot.highBy, lot.high, now); else unsold(st, now);
    } else if (lot.format === "sealed") {
      const bids = Object.entries(lot.bids).filter(([, b]) => b.v > 0).map(([p, b]) => ({ p, v: b.v, t: b.t }));
      bids.sort((a, b) => b.v - a.v || a.t - b.t);
      const reveal = bids.map((b) => ({ p: b.p, v: b.v }));
      log(st, { k: "reveal", bids: reveal });
      if (bids.length) sell(st, bids[0].p, bids[0].v, now, { reveal, tie: bids[1] && bids[1].v === bids[0].v });
      else unsold(st, now, { reveal });
    } else {
      unsold(st, now);
    }
    afterClose(st, now);
  }

  /* ---------- ações ---------- */
  function act(st, pid, a, now) {
    if (st.phase !== "playing" || !st.lot) return "O leilão não está em andamento.";
    st.clock = now;
    const lot = st.lot, p = byId(st, pid);
    if (!p) return "Você não é um jogador desta sala.";
    if (lot.stage !== "bid") return "Este lote já foi fechado.";
    if (lot.format === "classic") {
      if (lot.turn !== pid) return "Ainda não é a sua vez.";
      if (a.type === "bid") {
        const v = Math.floor(+a.amount);
        if (!(v > lot.high)) return `O lance precisa ser maior que R$ ${lot.high}.`;
        if (v > p.money) return `Você só tem R$ ${p.money}.`;
        lot.high = v; lot.highBy = pid;
        log(st, { k: "bid", p: pid, v });
      } else if (a.type === "pass") {
        lot.inLot = lot.inLot.filter((i) => i !== pid); lot.passed.push(pid);
        log(st, { k: "pass", p: pid });
      } else return "Ação inválida neste formato.";
      classicNext(st, now);
    } else if (lot.format === "sealed") {
      if (a.type !== "sealed") return "Ação inválida neste formato.";
      if (!lot.eligible.includes(pid)) return "Você está aguardando o fim do leilão.";
      const v = Math.max(0, Math.floor(+a.amount || 0));
      if (v > p.money) return `Você só tem R$ ${p.money}.`;
      const first = !lot.bids[pid];
      lot.bids[pid] = { v, t: lot.bids[pid] && lot.bids[pid].v === v ? lot.bids[pid].t : now };
      if (first) log(st, { k: v ? "sealed" : "sealedPass", p: pid });
      if (lot.eligible.every((id) => lot.bids[id])) closeLot(st, now);
    } else {
      if (a.type !== "buy") return "Ação inválida neste formato.";
      if (!lot.eligible.includes(pid)) return "Você está aguardando o fim do leilão.";
      if (p.money < lot.price) return `O preço ainda está acima do seu saldo (R$ ${p.money}).`;
      sell(st, pid, lot.price, now, { dutch: true });
      afterClose(st, now);
    }
    st.seq++;
    return null;
  }
  function next(st, now) {
    if (st.phase !== "playing" || !st.lot || st.lot.stage !== "done") return "O lote atual ainda está em disputa.";
    st.clock = now;
    st.idx++; st.starter = (st.starter + 1) % st.players.length;
    startLot(st, now);
    st.seq++;
    return null;
  }
  function finish(st) {
    for (let i = st.idx; i < st.lots.length; i++) {
      const f = st.lots[i];
      if (!st.results.some((r) => r.id === f.id)) st.results.push({ id: f.id, title: f.title, by: null, price: 0, format: f.format, skipped: true });
    }
    if (st.idx < st.lots.length) log(st, { k: "nobody" });
    log(st, { k: "end" });
    st.phase = "over"; st.lot = null; st.voting = "open"; st.votes = {}; st.seq++;
  }
  function backToLobby(st) {
    st.phase = "lobby"; st.lots = []; st.idx = 0; st.lot = null; st.results = []; st.log = []; st.voting = null; st.votes = {};
    st.players.forEach((p) => { p.money = 0; p.donated = 0; p.films = []; p.missions = []; });
    st.seq++;
  }

  /* ---------- votação da melhor coleção (jogadores e espectadores, depois do leilão) ---------- */
  function vote(st, voter, target) {
    if (st.phase !== "over" || st.voting !== "open") return "A votação não está aberta.";
    if (!voter) return "Voto inválido.";
    if (!byId(st, target)) return "Escolha a coleção de um jogador.";
    if (voter === target) return "Não vale votar na própria coleção.";
    st.votes[voter] = target;
    st.seq++;
    return null;
  }
  function closeVote(st) {
    if (st.phase !== "over" || st.voting !== "open") return "A votação não está aberta.";
    st.voting = "closed";
    st.seq++;
    return null;
  }
  function voteTally(st) {
    const c = {};
    Object.values(st.votes || {}).forEach((pid) => (c[pid] = (c[pid] || 0) + 1));
    return c;
  }
  // mais votos vence; empate fica com quem está na frente na soma das notas
  function voteWinner(st) {
    const c = voteTally(st);
    const best = scores(st).filter((r) => c[r.id]).sort((a, b) => c[b.id] - c[a.id])[0];
    return best ? { id: best.id, votes: c[best.id] } : null;
  }

  /* ---------- tempo ---------- */
  function tick(st, now) {
    if (st.phase !== "playing" || !st.lot) return false;
    st.clock = now;
    const lot = st.lot, before = st.seq;
    if (lot.stage === "done") {
      if (lot.deadline && now >= lot.deadline) next(st, now);
    } else if (lot.format === "classic") {
      if (lot.deadline && now >= lot.deadline) {
        const pid = lot.turn;
        lot.inLot = lot.inLot.filter((i) => i !== pid); lot.passed.push(pid);
        log(st, { k: "timeout", p: pid });
        classicNext(st, now); st.seq++;
      }
    } else if (lot.format === "sealed") {
      if (lot.deadline && now >= lot.deadline) { closeLot(st, now); st.seq++; }
    } else {
      let guard = 0;
      while (lot.stage === "bid" && now >= lot.nextAt && guard++ < 50) {
        if (lot.price > 1) { lot.price--; lot.nextAt += lot.step; }
        else if (lot.floorHits < 2) { lot.floorHits++; lot.nextAt += lot.step; } // segura um pouco no R$ 1
        else { closeLot(st, now); }
        st.seq++;
      }
    }
    return st.seq !== before;
  }

  /* ---------- pontuação ---------- */
  function market(st) {
    const sold = [];
    st.players.forEach((p) => p.films.forEach((f) => sold.push({ g: primaryGenre(f), paid: f.paid })));
    const m = {};
    sold.forEach((x) => { m[x.g] = m[x.g] || { genre: x.g, count: 0, paid: 0 }; m[x.g].count++; m[x.g].paid += x.paid; });
    const rows = Object.values(m).sort((a, b) => b.count - a.count || b.paid - a.paid || a.genre.localeCompare(b.genre));
    rows.forEach((r, i) => (r.bonus = MARKET_BONUS[i] || 0));
    return rows;
  }
  function scores(st) {
    const mk = st.settings.market ? market(st) : [];
    const bonusOf = (g) => (mk.find((r) => r.genre === g) || {}).bonus || 0;
    const rows = st.players.map((p) => {
      const ratings = Math.round(p.films.reduce((a, f) => a + (f.r || 0), 0) * 10) / 10;
      const mkt = st.settings.market ? p.films.reduce((a, f) => a + bonusOf(primaryGenre(f)), 0) : 0;
      const missions = (p.missions || []).map((m) => Object.assign({}, m, { ok: checkMission(st, p, m) }));
      const mis = missions.reduce((a, m) => a + (m.ok ? m.pts : 0), 0);
      return { id: p.id, ratings, market: mkt, missions, missionPts: mis, total: Math.round((ratings + mkt + mis) * 10) / 10, money: p.money, spent: Math.max(1, st.settings.money - (p.donated || 0)) - p.money };
    });
    rows.sort((a, b) => b.total - a.total || b.money - a.money);
    return rows;
  }

  /* ---------- visão por jogador (esconde o que é secreto) ---------- */
  function view(st, viewerId) {
    const v = clone(st);
    const all = viewerId === "*";
    if (v.lot && v.lot.format === "sealed" && v.lot.stage === "bid") {
      const bids = v.lot.bids;
      v.lot.submitted = Object.keys(bids);
      v.lot.myBid = all ? null : (bids[viewerId] ? bids[viewerId].v : null);
      v.lot.bids = all ? bids : {};
    }
    if (v.phase !== "over" && !all) v.players.forEach((p) => { if (p.id !== viewerId) p.missions = p.missions.map(() => ({ hidden: true })); });
    // as notas só aparecem no fim
    if (v.phase === "playing" && !all) [v.lots, ...v.players.map((p) => p.films)].forEach((list) => list.forEach((f) => { f.r = null; f.rsrc = ""; }));
    // voto secreto: com a votação aberta, cada um só vê o próprio; no fim, a contagem sem os nomes
    if (!all) {
      const votes = v.votes || {};
      v.myVote = votes[viewerId] || null;
      v.voteTotal = Object.keys(votes).length;
      v.votes = v.voting === "closed" ? Object.fromEntries(Object.values(votes).map((t, i) => ["v" + i, t])) : {};
    }
    if (v.phase !== "playing") delete v.lot;
    return v;
  }

  return { COLORS, GROUP_TAG, FORMATS, DEFAULTS, MAX_PLAYERS, MARKET_BONUS, create, addPlayer, removePlayer, setConnected, updateSettings, donate, donateLeft,
    start, act, next, tick, finish, backToLobby, vote, closeVote, voteTally, voteWinner, scores, market, view, primaryGenre, canPlay, cleanSettings, missionPool };
});
