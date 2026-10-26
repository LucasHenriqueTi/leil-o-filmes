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
const { openStore } = require("./lib/store.js");
const { attachWebSocket } = require("./lib/websocket.js");

const PORT = process.env.PORT || 3000;
const MC = Market.CONFIG;
const store = openStore(process.env.ML_DATA);
const ADMINS = new Set(String(process.env.ML_ADMINS || "").split(",").map(Market.nameKey).filter(Boolean));
const tries = Auth.limiter(MC.loginTries, MC.loginWindowMin * 60e3);
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
    if (c) c.send({ t: "state", d: { code: room.code, you: seat, host: room.hostId, now, viewers, st: Engine.view(room.st, seat || "__espectador") } });
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
const marketPayload = (uid) => ({ me: Market.view(eco, uid), ledger: Market.ledgerOf(eco, uid, MC.ledgerView), collection: [] });
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
})().catch((e) => { console.error("Não deu para abrir o Mercado:", e); process.exit(1); });
module.exports = { server, rooms };
