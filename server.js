/* ============================================================
   Martelo Live — servidor
   - Serve o site (pasta public/)
   - Mantém as salas online por WebSocket
   - O servidor é a autoridade: valida lances, roda os relógios,
     esconde lances secretos e missões de quem não deve ver.
   - Mercado: contas, carteira e mesada, salvos pela camada de armazenamento (lib/store.js).
   ============================================================ */
const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const Engine = require("./public/engine.js");
const Market = require("./public/market.js");
const Auth = require("./lib/auth.js");
const Films = require("./lib/films.js");
const MarketFilms = require("./public/market-films.js");
const { fix: OVERRIDES, examples: EXAMPLES } = MarketFilms;
// tags que vêm de listas feitas à mão (o resto vem do Wikidata): { cult: Set, marvel: Set, dc: Set }
const LIST_TAGS = Object.fromEntries(["cult", "marvel", "dc"].map((k) => [k, new Set(MarketFilms[k] || [])]));
const listTags = (id) => Object.fromEntries(Object.entries(LIST_TAGS).map(([k, s]) => [k, s.has(id)]));
const { openStore } = require("./lib/store.js");
const { attachWebSocket } = require("./lib/websocket.js");

const PORT = process.env.PORT || 3000;
const MC = Market.CONFIG;
const store = openStore(process.env.ML_DATA);
const ADMINS = new Set(String(process.env.ML_ADMINS || "").split(",").map(Market.nameKey).filter(Boolean));
const tries = Auth.limiter(MC.loginTries, MC.loginWindowMin * 60e3);
const FILMS_OFF = process.env.ML_FILMS === "off"; // desliga as buscas no Wikidata (testes sem internet)
const PUBLIC = path.join(__dirname, "public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };

/* ---------- site estático ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (url.pathname === "/health") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) }));
  }
  let file = decodeURIComponent(url.pathname);
  if (file === "/" || /^\/sala\/[A-Za-z0-9]{4}\/?$/.test(file)) file = "/index.html"; // /sala/ABCD = link de convite
  const full = path.normalize(path.join(PUBLIC, file));
  if (!full.startsWith(PUBLIC)) { res.statusCode = 403; return res.end("Proibido"); }
  fs.readFile(full, (err, data) => {
    if (err) { res.statusCode = 404; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("Página não encontrada"); }
    res.setHeader("Content-Type", MIME[path.extname(full)] || "application/octet-stream");
    res.setHeader("Cache-Control", path.extname(full) === ".html" ? "no-cache" : "public, max-age=600");
    res.end(data);
  });
});

/* ---------- salas ---------- */
const rooms = new Map();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I
const REACTIONS = ["🔥", "😱", "😂", "💸", "🍿", "👏", "🤡", "💀"];
const HOST_GRACE_MS = 20000;

function newCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let c = ""; for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error("sem códigos livres");
}
function makeRoom() {
  const room = {
    code: newCode(), st: Engine.create(), hostId: null, seats: 0,
    tokens: new Map(),      // token secreto -> id do lugar
    sockets: new Map(),     // socket.id -> id do lugar (ou null para espectador)
    voters: new Map(),      // token do espectador -> id de voto ("w1", "w2"...), para votar uma vez só
    chat: [], lastActive: Date.now(), hostTimer: null, sentSeq: -1
  };
  rooms.set(room.code, room);
  return room;
}
// corta por caractere (e não por unidade UTF-16) para não partir emoji no meio
const clip = (s, n) => Array.from(String(s || "").replace(/\s+/g, " ").trim()).slice(0, n).join("").trim();
const validToken = (t) => typeof t === "string" && /^[a-zA-Z0-9_-]{16,64}$/.test(t);
const seatOnline = (room, seat) => [...room.sockets.values()].includes(seat);

const conns = new Map(); // id da conexão -> conexão
function emitRoom(room, t, d) { for (const sid of room.sockets.keys()) { const c = conns.get(sid); if (c) c.send({ t, d }); } }
function broadcast(room) {
  room.sentSeq = room.st.seq;
  const now = Date.now();
  const viewers = room.sockets.size;
  for (const [sid, seat] of room.sockets) {
    const c = conns.get(sid);
    const viewer = seat || room.voters.get(c && c.data.token) || "__espectador";
    if (c) c.send({ t: "state", d: { code: room.code, you: seat, host: room.hostId, now, viewers, st: Engine.view(room.st, viewer) } });
  }
}
function systemChat(room, text, early) {
  const msg = { id: crypto.randomUUID(), at: Date.now() - (early ? 5 : 0), from: null, name: "Martelo", text };
  room.chat.push(msg); if (room.chat.length > 80) room.chat.shift();
  emitRoom(room, "chat", msg);
}
function pickNewHost(room) {
  const next = room.st.players.find((p) => p.id !== room.hostId && seatOnline(room, p.id));
  if (!next) return;
  room.hostId = next.id;
  systemChat(room, `${next.name} agora é quem comanda a sala.`);
  broadcast(room);
}
function attach(socket, room, seat) {
  socket.data.code = room.code;
  socket.data.seat = seat;
  room.sockets.set(socket.id, seat);
  room.lastActive = Date.now();
  if (seat) {
    Engine.setConnected(room.st, seat, true);
    if (seat === room.hostId && room.hostTimer) { clearTimeout(room.hostTimer); room.hostTimer = null; }
  }
  socket.send({ t: "chat:history", d: room.chat.slice(-50) });
}
function detach(socket) {
  const room = rooms.get(socket.data.code);
  if (!room) return;
  const seat = room.sockets.get(socket.id);
  room.sockets.delete(socket.id);
  socket.data.code = null; socket.data.seat = null;
  if (seat && !seatOnline(room, seat)) {
    Engine.setConnected(room.st, seat, false);
    if (seat === room.hostId) {
      clearTimeout(room.hostTimer);
      room.hostTimer = setTimeout(() => { room.hostTimer = null; if (!seatOnline(room, room.hostId)) pickNewHost(room); }, HOST_GRACE_MS);
    }
  }
  broadcast(room);
}

/* ---------- conexão ---------- */
// Protocolo: cliente manda {t, id, d}; servidor responde {t:"ack", id, d} e empurra {t:"state"|"chat"|"react"|...}
attachWebSocket(server, "/ws", (socket) => {
  conns.set(socket.id, socket);
  socket.data = {};
  const handlers = {};
  socket.on = ((orig) => function (ev, fn) { if (ev === "message" || ev === "close") return orig.call(this, ev, fn); handlers[ev] = fn; return this; })(socket.on);
  socket.on("message", (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== "string" || !handlers[m.t]) return;
    const cb = m.id != null ? (payload) => socket.send({ t: "ack", id: m.id, d: payload }) : null;
    const fail = (e) => { console.error("erro em", m.t, e); if (cb) cb({ error: "Algo deu errado no servidor. Tente de novo." }); };
    try { const r = handlers[m.t](m.d && typeof m.d === "object" ? m.d : {}, cb); if (r && typeof r.then === "function") r.catch(fail); }
    catch (e) { fail(e); }
  });
  socket.on("close", () => { detach(socket); conns.delete(socket.id); });
  socket.data.lastChat = 0; socket.data.lastDonate = 0; socket.data.reacts = [];
  const reply = (cb, payload) => { if (typeof cb === "function") cb(payload); };
  const roomOf = () => rooms.get(socket.data.code);
  const guardHost = (cb) => {
    const room = roomOf();
    if (!room) { reply(cb, { error: "Você não está em uma sala." }); return null; }
    if (socket.data.seat !== room.hostId) { reply(cb, { error: "Só quem comanda a sala pode fazer isso." }); return null; }
    return room;
  };
  const done = (room, cb, err, extra) => {
    if (err) return reply(cb, { error: err });
    room.lastActive = Date.now();
    broadcast(room);
    reply(cb, Object.assign({ ok: true }, extra));
  };

  socket.on("room:create", (data = {}, cb) => {
    if (!validToken(data.token)) return reply(cb, { error: "Recarregue a página e tente de novo." });
    if (socket.data.code) detach(socket);
    const room = makeRoom();
    const seat = "s" + ++room.seats;
    const err = Engine.addPlayer(room.st, seat, data.name);
    if (err) { rooms.delete(room.code); return reply(cb, { error: err }); }
    room.tokens.set(data.token, seat);
    room.hostId = seat;
    if (data.settings) Engine.updateSettings(room.st, data.settings);
    attach(socket, room, seat);
    systemChat(room, "Sala aberta. Mande o código para a galera entrar.");
    done(room, cb, null, { code: room.code, you: seat });
  });

  socket.on("room:join", (data = {}, cb) => {
    const code = String(data.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const room = rooms.get(code);
    if (!room) return reply(cb, { error: "Não achei essa sala. Confira o código com quem criou." });
    if (!validToken(data.token)) return reply(cb, { error: "Recarregue a página e tente de novo." });
    if (socket.data.code) detach(socket);
    // reconexão: o token já tem um lugar nesta sala
    const known = room.tokens.get(data.token);
    if (known && room.st.players.some((p) => p.id === known)) {
      attach(socket, room, known);
      return done(room, cb, null, { code, you: known, rejoined: true });
    }
    if (data.watch || room.st.phase !== "lobby") {
      if (room.sockets.size >= 80) return reply(cb, { error: "A sala está lotada de espectadores." });
      socket.data.token = data.token;
      attach(socket, room, null);
      return done(room, cb, null, { code, you: null, watching: true });
    }
    const seat = "s" + ++room.seats;
    const err = Engine.addPlayer(room.st, seat, data.name);
    if (err) return reply(cb, { error: err });
    room.tokens.set(data.token, seat);
    attach(socket, room, seat);
    const p = room.st.players.find((x) => x.id === seat);
    systemChat(room, `${p.name} entrou na sala.`);
    done(room, cb, null, { code, you: seat });
  });

  socket.on("room:leave", (data, cb) => {
    const room = roomOf();
    if (!room) return reply(cb, { ok: true });
    const seat = socket.data.seat;
    if (seat && room.st.phase === "lobby") {
      const p = room.st.players.find((x) => x.id === seat);
      Engine.removePlayer(room.st, seat);
      for (const [t, s] of room.tokens) if (s === seat) room.tokens.delete(t);
      if (p) systemChat(room, `${p.name} saiu da sala.`);
      if (seat === room.hostId) { room.hostId = null; detach(socket); pickNewHost(room); if (!room.hostId && room.st.players[0]) room.hostId = room.st.players[0].id; broadcast(room); return reply(cb, { ok: true }); }
    }
    detach(socket);
    reply(cb, { ok: true });
  });

  socket.on("room:settings", (patch, cb) => {
    const room = guardHost(cb); if (!room) return;
    done(room, cb, Engine.updateSettings(room.st, patch));
  });

  socket.on("room:kick", (data = {}, cb) => {
    const room = guardHost(cb); if (!room) return;
    if (data.seat === room.hostId) return reply(cb, { error: "Você não pode remover a si mesmo." });
    const p = room.st.players.find((x) => x.id === data.seat);
    const err = Engine.removePlayer(room.st, data.seat);
    if (err) return reply(cb, { error: err });
    for (const [t, s] of room.tokens) if (s === data.seat) room.tokens.delete(t);
    for (const [sid, seat] of [...room.sockets]) if (seat === data.seat) { const c = conns.get(sid); if (c) { c.send({ t: "kicked" }); detach(c); } }
    if (p) systemChat(room, `${p.name} foi removido da sala.`);
    done(room, cb, null);
  });

  socket.on("game:start", (data = {}, cb) => {
    const room = guardHost(cb); if (!room) return;
    if (room.st.phase !== "lobby") return reply(cb, { error: "O leilão já começou." });
    const offline = room.st.players.filter((p) => !p.connected).map((p) => p.name);
    if (offline.length) return reply(cb, { error: `Esperando reconectar: ${offline.join(", ")}.` });
    const err = Engine.start(room.st, data.lots, Date.now());
    if (!err) systemChat(room, "Valendo! O leilão começou.", true);
    done(room, cb, err);
  });

  socket.on("game:act", (a = {}, cb) => {
    const room = roomOf();
    if (!room || !socket.data.seat) return reply(cb, { error: "Espectadores não dão lances." });
    const type = ["bid", "pass", "sealed", "buy"].includes(a.type) ? a.type : null;
    if (!type) return reply(cb, { error: "Ação inválida." });
    done(room, cb, Engine.act(room.st, socket.data.seat, { type, amount: a.amount }, Date.now()));
  });

  socket.on("game:next", (d, cb) => {
    const room = guardHost(cb); if (!room) return;
    done(room, cb, Engine.next(room.st, Date.now()));
  });

  // votação da melhor coleção: jogadores e espectadores, uma vez por pessoa (dá para trocar até fechar)
  socket.on("game:vote", (data = {}, cb) => {
    const room = roomOf(); if (!room) return reply(cb, { error: "Entre em uma sala para votar." });
    let voter = socket.data.seat;
    if (!voter && validToken(socket.data.token)) {
      if (!room.voters.has(socket.data.token)) {
        if (room.voters.size >= 200) return reply(cb, { error: "A votação está lotada." });
        room.voters.set(socket.data.token, "w" + (room.voters.size + 1));
      }
      voter = room.voters.get(socket.data.token);
    }
    if (!voter) return reply(cb, { error: "Recarregue a página e tente de novo." });
    done(room, cb, Engine.vote(room.st, voter, String(data.target || "")));
  });

  socket.on("game:closeVote", (d, cb) => {
    const room = guardHost(cb); if (!room) return;
    const err = Engine.closeVote(room.st);
    if (!err) {
      const w = Engine.voteWinner(room.st), p = w && room.st.players.find((x) => x.id === w.id);
      systemChat(room, p ? `Votação encerrada! A galera escolheu a coleção de ${p.name}.` : "Votação encerrada sem votos.");
    }
    done(room, cb, err);
  });

  socket.on("game:lobby", (d, cb) => {
    const room = guardHost(cb); if (!room) return;
    Engine.backToLobby(room.st);
    systemChat(room, "De volta para a sala. Ajustem as regras e comecem outra rodada.");
    done(room, cb, null);
  });

  socket.on("chat:send", (data = {}, cb) => {
    const room = roomOf(); if (!room) return reply(cb, { error: "Entre em uma sala para conversar." });
    const now = Date.now();
    if (now - socket.data.lastChat < 700) return reply(cb, { error: "Calma, uma mensagem por vez." });
    const text = clip(data.text, 140);
    if (!text) return reply(cb, { ok: true });
    socket.data.lastChat = now;
    const seat = socket.data.seat;
    const p = seat && room.st.players.find((x) => x.id === seat);
    const name = p ? p.name : String(data.name || "Espectador").replace(/\s+/g, " ").trim().slice(0, 18) || "Espectador";
    const msg = { id: crypto.randomUUID(), at: now, from: seat || null, name, text, watcher: !p };
    room.chat.push(msg); if (room.chat.length > 80) room.chat.shift();
    emitRoom(room, "chat", msg);
    reply(cb, { ok: true });
  });

  // doação na sala: vai para o chat com o campo `donate` e cada cliente toca o alerta
  socket.on("room:donate", (data = {}, cb) => {
    const room = roomOf();
    if (!room || !socket.data.seat) return reply(cb, { error: "Só jogadores podem doar." });
    const now = Date.now();
    if (now - socket.data.lastDonate < 1500) return reply(cb, { error: "Calma, uma doação por vez." });
    const seat = socket.data.seat, v = Math.floor(+data.amount);
    const err = Engine.donate(room.st, seat, v);
    if (err) return reply(cb, { error: err });
    socket.data.lastDonate = now;
    const p = room.st.players.find((x) => x.id === seat);
    const msg = { id: crypto.randomUUID(), at: now, from: seat, name: p.name, text: clip(data.text, 80), donate: v };
    room.chat.push(msg); if (room.chat.length > 80) room.chat.shift();
    emitRoom(room, "chat", msg);
    done(room, cb, null);
  });

  socket.on("react", (data = {}) => {
    const room = roomOf(); if (!room) return;
    if (!REACTIONS.includes(data.e)) return;
    const now = Date.now();
    socket.data.reacts = socket.data.reacts.filter((t) => now - t < 2000);
    if (socket.data.reacts.length >= 6) return;
    socket.data.reacts.push(now);
    emitRoom(room, "react", { e: data.e, from: socket.data.seat || null });
  });

  socket.on("time", (d, cb) => reply(cb, { now: Date.now() }));

  /* ---------- Mercado: contas e carteira ---------- */
  const login = (uid, hash) => { socket.data.uid = uid; socket.data.session = hash; };
  const meOf = (cb) => { const uid = socket.data.uid; if (!uid || !eco.users[uid]) { reply(cb, { error: "Entre na sua conta primeiro." }); return null; } return uid; };
  const password = (d, key) => String(d[key] || "").slice(0, 200);

  socket.on("auth:register", async (d = {}, cb) => {
    const now = Date.now();
    if (now - (socket.data.lastRegister || 0) < 5000) return reply(cb, { error: "Calma, espere uns segundos." });
    const pw = password(d, "password");
    if (pw.length < MC.passwordMin) return reply(cb, { error: `A senha precisa de pelo menos ${MC.passwordMin} caracteres.` });
    const pre = Market.checkName(eco, d.name); if (pre) return reply(cb, { error: pre });
    socket.data.lastRegister = now;
    const auth = await Auth.hashPassword(pw), token = Auth.newToken(), hash = Auth.tokenHash(token), id = Auth.newUserId();
    const r = await mutate((e, t) => {
      const admin = !Object.keys(e.users).length || ADMINS.has(Market.nameKey(d.name));
      const err = Market.addUser(e, { id, name: d.name, auth, admin }, t);
      if (err) return { error: err };
      Market.addSession(e, hash, id, t);
    });
    if (r.error) return reply(cb, r);
    login(id, hash);
    reply(cb, { ok: true, session: token, me: Market.view(eco, id) });
  });

  socket.on("auth:login", async (d = {}, cb) => {
    const now = Date.now(), byName = "n:" + Market.nameKey(d.name), bySock = "s:" + socket.id;
    if (tries.blocked(byName, now) || tries.blocked(bySock, now)) return reply(cb, { error: `Muitas tentativas erradas. Espere ${MC.loginWindowMin} minutos e tente de novo.` });
    const u = Market.findByName(eco, d.name);
    const ok = await Auth.verifyPassword(password(d, "password"), u && u.auth);
    if (!ok) { tries.fail(byName, now); tries.fail(bySock, now); return reply(cb, { error: "Nome ou senha incorretos." }); }
    tries.clear(byName);
    const token = Auth.newToken(), hash = Auth.tokenHash(token);
    await mutate((e, t) => { Market.addSession(e, hash, u.id, t); });
    login(u.id, hash);
    reply(cb, { ok: true, session: token, me: Market.view(eco, u.id) });
  });

  socket.on("auth:resume", (d = {}, cb) => {
    const hash = Auth.tokenHash(d.session), uid = Market.sessionUser(eco, hash, Date.now());
    if (!uid) return reply(cb, { error: "Sua sessão expirou. Entre de novo.", expired: true });
    login(uid, hash);
    reply(cb, { ok: true, me: Market.view(eco, uid) });
  });

  socket.on("auth:logout", async (d, cb) => {
    const hash = socket.data.session;
    login(null, null);
    if (hash) await mutate((e) => { Market.revokeSession(e, hash); });
    reply(cb, { ok: true });
  });

  socket.on("auth:password", async (d = {}, cb) => {
    const uid = meOf(cb); if (!uid) return;
    const next = password(d, "new");
    if (next.length < MC.passwordMin) return reply(cb, { error: `A senha nova precisa de pelo menos ${MC.passwordMin} caracteres.` });
    if (!(await Auth.verifyPassword(password(d, "old"), eco.users[uid].auth))) return reply(cb, { error: "A senha atual não confere." });
    const auth = await Auth.hashPassword(next), keep = socket.data.session;
    await mutate((e) => { Market.setAuth(e, uid, auth); Market.revokeSessions(e, uid, keep); });
    signOut(uid);
    reply(cb, { ok: true });
  });

  socket.on("admin:reset", async (d = {}, cb) => {
    const uid = meOf(cb); if (!uid) return;
    if (!eco.users[uid].admin) return reply(cb, { error: "Só admins podem fazer isso." });
    const target = Market.findByName(eco, d.name);
    if (!target) return reply(cb, { error: "Não achei uma conta com esse nome." });
    const temp = Auth.tempPassword(), auth = await Auth.hashPassword(temp);
    await mutate((e) => { Market.setAuth(e, target.id, auth); Market.revokeSessions(e, target.id); });
    signOut(target.id);
    reply(cb, { ok: true, name: target.name, temp });
  });

  socket.on("market:me", (d, cb) => {
    const uid = meOf(cb); if (!uid) return;
    reply(cb, Object.assign({ ok: true }, marketPayload(uid)));
  });

  socket.on("market:catalog", (d, cb) => {
    if (!meOf(cb)) return;
    reply(cb, { ok: true, films: Market.catalogView(eco), refilledAt: eco.house.refilledAt || null, refilling });
  });

  socket.on("admin:refillCatalog", async (d, cb) => {
    const uid = meOf(cb); if (!uid) return;
    if (!eco.users[uid].admin) return reply(cb, { error: "Só admins podem fazer isso." });
    if (FILMS_OFF) return reply(cb, { error: "As buscas de filmes estão desligadas neste servidor (ML_FILMS=off)." });
    if (refilling) return reply(cb, { error: "A Casa já está atualizando o catálogo. Espere um pouco." });
    const r = await refillCatalog({ count: MC.bootBatch });
    reply(cb, r.error ? { error: r.error } : { ok: true, added: r.added });
  });

  /* ---------- Mercado: estreias da Casa e recompra ---------- */
  // vitrine pública da tela inicial: funciona sem login, para convidar a criar conta
  socket.on("market:showcase", (d, cb) => reply(cb, Object.assign({ ok: true }, Market.showcase(eco, Date.now()))));

  socket.on("market:ranking", (d, cb) => {
    if (!meOf(cb)) return;
    const now = Date.now();
    reply(cb, { ok: true, ranking: Market.rankingView(eco, now), season: Market.season(eco, now) });
  });

  // coleção de outra conta (pelo ranking): filmes, cópias e pontos, sem a carteira
  socket.on("market:collection", (d = {}, cb) => {
    if (!meOf(cb)) return;
    const c = Market.publicCollection(eco, String(d.id || ""), Date.now());
    reply(cb, c ? Object.assign({ ok: true }, c) : { error: "Conta não encontrada." });
  });

  socket.on("market:auctions", (d, cb) => {
    const uid = meOf(cb); if (!uid) return;
    reply(cb, Object.assign({ ok: true }, Market.auctionsView(eco, uid)));
  });

  socket.on("market:bid", async (d = {}, cb) => {
    const uid = meOf(cb); if (!uid) return;
    const id = String(d.id || ""), before = eco.auctions[id] && eco.auctions[id].highBy;
    const r = await mutate((e, now) => { const err = Market.bid(e, id, uid, d.amount, now); return err ? { error: err } : {}; });
    if (r.error) return reply(cb, r);
    const a = eco.auctions[id];
    // house: o comprador fantasma da Casa cobriu o lance na hora
    reply(cb, { ok: true, closed: a.status === "closed", price: a.status === "closed" ? a.result.price : undefined, house: a.highBy === "house", high: a.high });
    if (a.status === "closed") return afterClose([id]);   // relógio holandês: comprou, fechou
    pushMe(uid);
    if (before && before !== "house" && before !== uid && a.highBy !== before) { pushMe(before); notify(before, `Seu lance em ${eco.films[a.film].title} foi superado.`); }
    pushAuctions();
  });

  // anunciar uma cópia da coleção (leilão de jogador)
  socket.on("market:list", async (d = {}, cb) => {
    const uid = meOf(cb); if (!uid) return;
    const o = { copy: String(d.copy || ""), format: String(d.format || ""), minutes: d.minutes, startsAt: d.startsAt, reserve: d.reserve, startPrice: d.startPrice, startBid: d.startBid, featured: !!d.featured };
    const r = await mutate((e, now) => Market.listCopy(e, uid, o, now));
    if (r.error) return reply(cb, r);
    reply(cb, { ok: true, id: r.id });
    pushMe(uid); pushAuctions();
    const a = eco.auctions[r.id];
    if (a.featured) announce(a, a.status === "open" ? "Na vitrine agora" : "Na vitrine");
  });

  socket.on("market:unlist", async (d = {}, cb) => {
    const uid = meOf(cb); if (!uid) return;
    const r = await mutate((e, now) => { const err = Market.unlist(e, uid, String(d.id || ""), now); return err ? { error: err } : {}; });
    if (r.error) return reply(cb, r);
    reply(cb, { ok: true });
    pushMe(uid); pushAuctions();
  });

  socket.on("market:sell", async (d = {}, cb) => {
    const uid = meOf(cb); if (!uid) return;
    const c = eco.copies[d.copy], price = c ? Market.buybackPrice(eco, c.film) : 0;
    const r = await mutate((e, now) => { const err = Market.sellToHouse(e, uid, String(d.copy || ""), now); return err ? { error: err } : {}; });
    if (r.error) return reply(cb, r);
    reply(cb, { ok: true, price });
    pushMe(uid); pushAuctions();
  });

  /* ---------- Mercado: ferramentas de admin (para testar o fluxo inteiro) ---------- */
  const adminOf = (cb) => {
    const uid = meOf(cb); if (!uid) return null;
    if (!eco.users[uid].admin) { reply(cb, { error: "Só admins podem fazer isso." }); return null; }
    return uid;
  };
  socket.on("admin:accounts", (d, cb) => { if (adminOf(cb)) reply(cb, { ok: true, accounts: Market.accountsView(eco) }); });

  // encerra agora: quem está na frente paga e recebe a cópia, como no fim normal
  socket.on("admin:closeAuction", async (d = {}, cb) => {
    if (!adminOf(cb)) return;
    const id = String(d.id || "");
    const r = await mutate((e, now) => { const err = Market.closeAuction(e, id, now); return err ? { error: err } : {}; });
    if (r.error) return reply(cb, r);
    reply(cb, { ok: true, result: Market.auctionView(eco, eco.auctions[id]).result });
    afterClose([id]);
  });

  socket.on("admin:cancelAuction", async (d = {}, cb) => {
    if (!adminOf(cb)) return;
    const id = String(d.id || "");
    const r = await mutate((e, now) => { const err = Market.cancelAuction(e, id, now); return err ? { error: err } : {}; });
    if (r.error) return reply(cb, r);
    reply(cb, { ok: true });
    const a = eco.auctions[id], title = eco.films[a.film].title;
    participants(a).forEach((u) => { pushMe(u); notify(u, u === a.seller ? `O admin cancelou o leilão de ${title}. A cópia continua com você.` : `O leilão de ${title} foi cancelado pelo admin. Seu lance voltou para a carteira.`); });
    pushAuctions();
  });

  socket.on("admin:openEstreia", async (d = {}, cb) => {
    if (!adminOf(cb)) return;
    const r = await mutate((e, now) => Market.openEstreiaNow(e, String(d.event || ""), now));
    if (r.error) return reply(cb, r);
    reply(cb, { ok: true, id: r.id });
    pushAuctions();
  });

  // estreia personalizada: filme sorteado ou escolhido, formato, lance mínimo e duração à escolha do admin
  socket.on("admin:customEstreia", async (d = {}, cb) => {
    const uid = adminOf(cb); if (!uid) return;
    const o = { film: d.film ? String(d.film) : "", bands: Array.isArray(d.bands) ? d.bands.map(String) : [], genres: Array.isArray(d.genres) ? d.genres.slice(0, 50).map(String) : [], format: String(d.format || ""),
      minutes: d.minutes, minBid: d.minBid, startPrice: d.startPrice, ghost: d.ghost !== false, name: String(d.name || ""), count: d.count };
    const r = await mutate((e, now) => Market.openCustomEstreia(e, o, now));
    if (r.error) return reply(cb, r);
    const a = eco.auctions[r.id], titles = r.films.map((id) => eco.films[id].title);
    reply(cb, { ok: true, id: r.id, ids: r.ids, titles });
    pushAuctions();
    const what = titles.length > 1 ? `${titles.length} estreias (${titles.join(", ")})` : `${titles[0]} (${Market.rarity(eco.films[a.film].rarity).name})`;
    const text = `${a.eventName} aberta: ${what}, no formato ${Market.FORMATS[a.format].name}.`;
    for (const c of conns.values()) if (c.data && c.data.uid && eco.users[c.data.uid] && c.data.uid !== uid) c.send({ t: "market:notice", d: { text } });
  });

  // dá M$ para uma conta de teste (entra no extrato como "Ajuste do admin")
  // troca o gênero em alta neste mês (para testar a temporada); vazio volta ao sorteio do mês
  socket.on("admin:season", async (d = {}, cb) => {
    if (!adminOf(cb)) return;
    const r = await mutate((e, now) => { const err = Market.setSeason(e, String(d.genre || ""), now); return err ? { error: err } : {}; });
    if (r.error) return reply(cb, r);
    reply(cb, { ok: true, season: Market.season(eco, Date.now()) });
    Object.keys(eco.users).forEach(pushMe); pushAuctions();
  });

  socket.on("admin:grant", async (d = {}, cb) => {
    const uid = adminOf(cb); if (!uid) return;
    const target = Market.findByName(eco, d.name), amount = Math.floor(+d.amount);
    if (!target) return reply(cb, { error: "Não achei uma conta com esse nome." });
    if (!(amount >= 1 && amount <= 10000)) return reply(cb, { error: "Valor de 1 a 10.000." });
    const r = await mutate((e, now) => { const err = Market.credit(e, target.id, amount, "admin", now, `por ${e.users[uid].name}`); return err ? { error: err } : {}; });
    if (r.error) return reply(cb, r);
    reply(cb, { ok: true, name: target.name });
    pushMe(target.id);
    if (target.id !== uid) notify(target.id, `O admin colocou ${Market.money(amount)} na sua carteira.`);
  });
});

/* ---------- Mercado: estado persistente ---------- */
// Cada mutação roda sozinha na fila: aplica numa cópia, salva e só então troca o estado.
// Se a regra devolver {error} (ou {skip}), ou se o save falhar, nada muda.
let eco = null, queue = Promise.resolve();
function mutate(fn) {
  const run = queue.then(async () => {
    const draft = structuredClone(eco);
    const out = fn(draft, Date.now()) || {};
    if (out.error || out.skip) return out;
    await store.save(draft);
    eco = draft;
    return out;
  });
  queue = run.catch(() => {});
  return run;
}
const marketPayload = (uid) => {
  const now = Date.now();
  const caps = Object.entries(MC.rarityCaps || {}).map(([k, cap]) => ({ rarity: k, cap, owned: Object.values(eco.copies).filter((c) => c.owner === uid && eco.films[c.film].rarity === k).length }));
  return { me: Market.view(eco, uid), ledger: Market.ledgerOf(eco, uid, MC.ledgerView), reserved: Market.reservedOf(eco, uid), collection: Market.collectionOf(eco, uid, now), score: Market.collectionScore(eco, uid, now), caps };
};
const socketsOf = (uid) => [...conns.values()].filter((c) => c.data && c.data.uid === uid);
function pushMe(uid) { const d = marketPayload(uid); socketsOf(uid).forEach((c) => c.send({ t: "market:me", d })); }
// desconecta da conta as conexões cuja sessão foi revogada (senha trocada ou resetada)
function signOut(uid) {
  socketsOf(uid).forEach((c) => { if (!eco.sessions[c.data.session]) { c.data.uid = null; c.data.session = null; c.send({ t: "auth:out" }); } });
}
// mesada: o horário vem do documento salvo, então sobrevive a reinícios
async function marketTick() {
  const r = await mutate((e, now) => { const paid = Market.tick(e, now); return paid.length ? { paid } : { skip: true }; });
  (r.paid || []).forEach(pushMe);
}
// estreias e lances interessam a todo mundo que está no Mercado
function pushAuctions() {
  for (const c of conns.values()) if (c.data && c.data.uid && eco.users[c.data.uid]) c.send({ t: "market:auctions", d: Market.auctionsView(eco, c.data.uid) });
}
const notify = (uid, text) => socketsOf(uid).forEach((c) => c.send({ t: "market:notice", d: { text } }));
// fecha os leilões vencidos e abre as estreias da agenda; só entra na fila quando há algo a fazer
async function auctionTick() {
  if (!Market.dueAuctions(eco, Date.now())) return;
  const r = await mutate((e, now) => {
    const started = Market.startDue(e, now), closed = Market.tickAuctions(e, now), opened = Market.openDueEstreias(e, now);
    return started.length || closed.length || opened.length ? { started, closed, opened } : { skip: true };
  });
  if (r.skip) return;
  if ((r.opened || []).length) console.log(`Mercado: ${r.opened.length} estreia(s) aberta(s).`);
  (r.started || []).forEach((id) => { const a = eco.auctions[id]; if (a && a.featured) announce(a, "Começou agora na vitrine"); });
  afterClose(r.closed || []);
}
// todo mundo que participou: dono, quem deu lance (o reservado mudou) e quem venceu
const participants = (a) => [...new Set([a.seller, a.highBy, ...Object.keys(a.sealed || {}), ...a.bids.map((b) => b.uid)].filter((u) => u && eco.users[u]))];
// aviso para todos que estão no Mercado (leilões na vitrine)
function announce(a, prefix) {
  const f = eco.films[a.film], text = `${prefix}: ${f.title} (${Market.rarity(f.rarity).name}), de ${eco.users[a.seller].name}, no formato ${Market.FORMATS[a.format].name}.`;
  for (const c of conns.values()) if (c.data && c.data.uid && eco.users[c.data.uid] && c.data.uid !== a.seller) c.send({ t: "market:notice", d: { text } });
}
// depois de fechar: cada um vê a carteira e a coleção certas na hora e recebe o aviso
function afterClose(ids) {
  ids.forEach((id) => {
    const a = eco.auctions[id], res = (a && a.result) || {};
    if (!a) return;
    const title = eco.films[a.film].title;
    participants(a).forEach(pushMe);
    if (res.winner) notify(res.winner, `Você arrematou ${title} por ${Market.money(res.price)}!`);
    if (a.kind === "user") {
      notify(a.seller, res.winner ? `Sua cópia de ${title} foi vendida para ${eco.users[res.winner].name} por ${Market.money(res.price)} (taxa de ${Market.money(res.fee)}).`
        : res.reserveMissed ? `${title} não atingiu a sua reserva. A cópia continua com você.` : `${title} terminou sem lances. A cópia continua com você.`);
    }
  });
  pushAuctions();
}
// Modo de teste, a cada início: o catálogo volta aos exemplos (mais os filmes que já têm cópias),
// a Casa busca filmes novos e as 3 estreias recomeçam agora.
async function bootMarket() {
  const keep = new Set(EXAMPLES.map((f) => f.id));
  await mutate((e, now) => {
    if (MC.testMode) {
      // as estreias antigas saem antes da busca no Wikidata, devolvendo os lances
      Object.values(e.auctions).forEach((a) => { if (a.status === "open" && a.kind === "house") Market.cancelAuction(e, a.id, now); });
      Market.pruneCatalog(e, keep);
    }
    EXAMPLES.forEach((f) => { if (!e.films[f.id]) Market.addFilm(e, f, now); else if (f.series && !e.films[f.id].series) e.films[f.id].series = f.series; });
    Market.refreeze(e);
    // as tags Cult, Marvel e DC seguem as listas (editar a lista vale para o catálogo inteiro); os exemplos trazem as próprias tags
    Market.applyTags(e, Object.fromEntries(Object.keys(e.films).map((id) => [id, listTags(id)])));
    Market.applyTags(e, Object.fromEntries(EXAMPLES.map((f) => [f.id, { oscars: f.oscars || [], nacional: !!f.nacional }])));
  });
  backfillTags();
  backfillImdb();
  if (MC.testMode) await refillCatalog({ count: MC.bootBatch });
  else refillCatalog();
  const r = await mutate((e, now) => ({ opened: MC.testMode ? Market.restartEstreias(e, now) : Market.openDueEstreias(e, now) }));
  console.log(`Mercado: pronto, ${Object.keys(eco.films).length} filmes no catálogo e ${r.opened.length} estreia(s) aberta(s).`);
  pushAuctions();
  Object.keys(eco.users).forEach(pushMe);   // quem já estava conectado vê o lance devolvido
}
// filmes cadastrados antes das tags do Wikidata (Oscar e Nacional): busca só esses dois dados, em segundo plano
async function backfillTags() {
  if (FILMS_OFF) return;
  const ids = Object.values(eco.films).filter((f) => f.oscars === undefined || f.nacional === undefined).map((f) => f.id);
  if (!ids.length) return;
  try {
    const facts = await Films.fetchFacts(ids);
    ids.forEach((id) => { if (!facts[id]) facts[id] = { oscars: [], nacional: false }; });   // sem resposta: não busca de novo
    const n = await mutate((e) => ({ n: Market.applyTags(e, facts) }));
    if (n.n) console.log(`Mercado: tags de Oscar e cinema nacional atualizadas em ${ids.length} filmes.`);
  } catch (e) { console.warn("Mercado: não deu para buscar as tags agora:", e.message); }
}
// nota do IMDb pelo arquivo oficial para os filmes ainda sem cópias (o Wikidata quase não tem mais), em segundo plano
async function backfillImdb() {
  if (FILMS_OFF) return;
  const ids = Object.values(eco.films).filter((f) => !f.minted).map((f) => f.id);
  if (!ids.length) return;
  try {
    const vals = await Films.imdbRatings(ids);
    const fixed = new Set(Object.keys(OVERRIDES).filter((id) => OVERRIDES[id] && OVERRIDES[id].scores && OVERRIDES[id].scores.imdb != null));
    const r = await mutate((e) => ({ n: Market.updateScores(e, "imdb", vals, fixed) }));
    if (r.n) console.log(`Mercado: nota do IMDb atualizada em ${r.n} filmes.`);
  } catch (e) { console.warn("Mercado: não deu para buscar as notas do IMDb agora:", e.message); }
}
// vagas reservadas para filmes com tag (Cult, Marvel e DC pelas listas; Oscar e Nacional pelo Wikidata) que ainda não estão no catálogo.
// A vaga do Oscar troca de família a cada rodada (Melhor filme, Atuação, Roteiro…)
const OSCAR_FAMS = Object.keys(MC.oscarFamilies || {});
let oscarTurn = OSCAR_FAMS.length ? crypto.randomInt(OSCAR_FAMS.length) : 0;
async function drawTagged() {
  const out = [];
  for (const [tag, n] of Object.entries(MC.tagDraws || {})) {
    const kind = tag === "oscar" && OSCAR_FAMS.length ? "oscar:" + OSCAR_FAMS[oscarTurn++ % OSCAR_FAMS.length] : tag;
    let pool = [];
    try { pool = LIST_TAGS[kind] ? [...LIST_TAGS[kind]] : await Films.loadTagPool(kind, MC.minScores); }
    catch (e) { console.warn(`Mercado: sorteio de ${kind} não respondeu:`, e.message); }
    pool = pool.filter((id) => !eco.films[id] && !out.includes(id));
    for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
  }
  return out;
}
// A Casa reabastece o catálogo: sorteia filmes no Wikidata e cadastra os que têm notas suficientes.
// Com `count`, busca exatamente essa quantidade; sem, só completa até `catalogTarget`.
// A rede fica fora da fila; só o cadastro entra em `mutate`.
let refilling = false;
async function refillCatalog(opts) {
  if (FILMS_OFF || refilling) return { added: 0 };
  refilling = true;
  try {
    const count = (opts && opts.count) || 0;
    const need = count || MC.catalogTarget - Market.openFilms(eco);
    const include = Object.keys(OVERRIDES).filter((id) => OVERRIDES[id] && OVERRIDES[id].include && !eco.films[id]);
    if (need <= 0 && !include.length) return { added: 0 };
    const ids = include.slice();
    if (need > 0) ids.push(...(await drawTagged()).filter((id) => !ids.includes(id)));
    if (need > 0) {
      const fresh = (await Films.loadPool(MC.catalogMinLinks, MC.minScores)).filter((r) => !eco.films[r.imdb]);
      for (let i = fresh.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
      ids.push(...fresh.slice(0, Math.min(MC.catalogBatch, Math.ceil(need * 1.5))).map((r) => r.imdb));
    }
    const films = (await Films.fetchFilms(ids)).map((f) => Object.assign(Market.applyOverrides(f, OVERRIDES), listTags(f.id)));
    // o Wikidata responde fora de ordem: volta à ordem pedida, para os incluídos e os sorteados por tag entrarem primeiro
    films.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
    const room = need;
    const r = await mutate((e, now) => {
      let added = 0;
      for (const f of films) {
        const must = include.includes(f.id);
        if (!must && added >= room) continue;
        if (!Market.addFilm(e, f, now)) added++;   // filme sem notas suficientes fica de fora, sem erro
      }
      e.house.refilledAt = now;
      return { added };
    });
    if (r.added) console.log(`Mercado: a Casa cadastrou ${r.added} filmes (${Object.keys(eco.films).length} no catálogo).`);
    return r;
  } catch (e) {
    console.warn("Mercado: não deu para atualizar o catálogo agora:", e.message);
    return { added: 0, error: "O Wikidata não respondeu. Tente de novo em alguns minutos." };
  } finally {
    refilling = false;
  }
}

/* ---------- relógio central: timers dos lotes ---------- */
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.st.phase === "playing" && Engine.tick(room.st, now)) broadcast(room);
    else if (room.st.seq !== room.sentSeq) broadcast(room);
  }
}, 200);

/* ---------- limpeza de salas abandonadas ---------- */
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const empty = room.sockets.size === 0;
    if ((empty && now - room.lastActive > 30 * 60e3) || now - room.lastActive > 12 * 3600e3) {
      clearTimeout(room.hostTimer);
      rooms.delete(code);
    }
  }
}, 60e3);

/* ---------- início: carrega o Mercado antes de aceitar conexões ---------- */
(async () => {
  eco = (await store.load()) || Market.create();
  await marketTick();
  setInterval(() => marketTick().catch((e) => console.error("erro na mesada", e)), 60e3);
  server.listen(PORT, () => console.log(`Martelo Live rodando em http://localhost:${PORT}`));
  // catálogo e estreias em segundo plano: o jogo não espera o Wikidata
  bootMarket().catch((e) => console.error("erro ao preparar o Mercado", e)).finally(() => {
    setInterval(() => auctionTick().catch((e) => console.error("erro nas estreias", e)), 1000);
  });
  setInterval(() => refillCatalog(), MC.catalogRefreshHours * 3600e3);
})().catch((e) => { console.error("Não deu para abrir o Mercado:", e); process.exit(1); });
module.exports = { server, rooms };
