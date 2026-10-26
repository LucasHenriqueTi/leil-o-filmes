/* ============================================================
   Martelo Live — senhas e sessões (só no servidor)
   Senha: scrypt com sal aleatório; nunca é guardada.
   Sessão: token aleatório que fica no navegador; no banco fica só o sha256 dele.
   ============================================================ */
const crypto = require("crypto");

const KEYLEN = 64, PARAMS = { N: 16384, r: 8, p: 1 };
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(String(pw), salt, KEYLEN, PARAMS, (e, k) => (e ? rej(e) : res(k))));
// hash falso para comparar quando o nome não existe (o tempo de resposta fica igual)
const DUMMY = { salt: "0".repeat(32), hash: "0".repeat(KEYLEN * 2) };

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: (await scrypt(pw, salt)).toString("hex") };
}
async function verifyPassword(pw, auth) {
  const a = auth && auth.salt && auth.hash ? auth : DUMMY;
  const got = await scrypt(pw, a.salt), want = Buffer.from(a.hash, "hex");
  return want.length === got.length && crypto.timingSafeEqual(got, want) && a !== DUMMY;
}
const newToken = () => crypto.randomBytes(32).toString("base64url");
const tokenHash = (t) => crypto.createHash("sha256").update(String(t || "")).digest("hex");
const newUserId = () => "u" + crypto.randomBytes(8).toString("hex");
// senha temporária fácil de ditar: sem 0/O, 1/l/I
function tempPassword() {
  const A = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = ""; for (let i = 0; i < 10; i++) s += A[crypto.randomInt(A.length)];
  return s.slice(0, 5) + "-" + s.slice(5);
}

// tentativas erradas por chave (nome ou conexão); fica na memória e zera ao reiniciar
function limiter(max, windowMs) {
  const hits = new Map();
  const recent = (key, now) => (hits.get(key) || []).filter((t) => now - t < windowMs);
  return {
    blocked(key, now) { return recent(key, now).length >= max; },
    fail(key, now) { const r = recent(key, now); r.push(now); hits.set(key, r); },
    clear(key) { hits.delete(key); }
  };
}

module.exports = { hashPassword, verifyPassword, newToken, tokenHash, newUserId, tempPassword, limiter };
