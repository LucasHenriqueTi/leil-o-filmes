/* ============================================================
   Martelo Live — regras do Mercado (economia persistente)
   Roda igual no servidor e no navegador. A economia inteira é um objeto simples
   (serializável em JSON). O tempo entra sempre como parâmetro `now` (ms).
   Senhas e tokens nunca passam por aqui: o servidor entrega só o hash.
   Toda movimentação de dinheiro gera um lançamento no extrato (`ledger`).
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./market-config.js"));
  else root.Market = factory(root.MarketConfig);
})(typeof self !== "undefined" ? self : this, function (CONFIG) {
  "use strict";

  const DAY = 864e5, WEEK = 7 * DAY;
  const KINDS = { signup: "Boas-vindas", allowance: "Mesada semanal", fee: "Taxa", sale: "Venda", buyback: "Venda para a Casa", donate: "Donate", prize: "Prêmio", admin: "Ajuste do admin" };

  /* ---------- utilidades ---------- */
  const cleanName = (n) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 18);
  const nameKey = (n) => cleanName(n).toLowerCase();
  const isAmount = (v) => Number.isInteger(v) && v >= 1;

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
    if (amount > u.wallet.free) return `Saldo insuficiente: você tem R$ ${u.wallet.free} livres.`;
    u.wallet.free -= amount;
    entry(eco, uid, -amount, kind, now, ref); eco.seq++;
    return null;
  }
  // reserva: o dinheiro continua seu, mas fica preso (lance vencedor de um leilão)
  function reserve(eco, uid, amount) {
    const u = eco.users[uid];
    if (!u) return "Conta não encontrada.";
    if (!isAmount(amount)) return "Valor inválido.";
    if (amount > u.wallet.free) return `Saldo insuficiente: você tem R$ ${u.wallet.free} livres.`;
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
    credit, debit, reserve, release, capture, tick, supply, view, ledgerOf, balanceFromLedger };
});
