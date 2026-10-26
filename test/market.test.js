// Teste do Mercado (fase 1): contas, carteira, extrato, sessões e mesada.
const assert = require("assert");
const M = require("../public/market.js");

const W = M.WEEK;
const cfg = (o) => Object.assign({}, M.CONFIG, { signupBonus: 30, allowance: 30, allowanceDay: 1, allowanceHour: 0, tzOffsetMin: -180, allowanceCatchUp: 1 }, o || {});
const MON = Date.UTC(2026, 9, 26, 12);  // segunda, 26/10/2026, 9h em Brasília
const auth = { salt: "s", hash: "h" };
// todo saldo precisa bater com a soma do extrato
const books = (eco) => Object.values(eco.users).forEach((u) => assert.strictEqual(u.wallet.free + u.wallet.reserved, M.balanceFromLedger(eco, u.id), "extrato não bate com o saldo de " + u.name));

// Contas
{
  const eco = M.create();
  assert.strictEqual(M.addUser(eco, { id: "u1", name: "  Cibele  ", auth, admin: true }, MON, cfg()), null);
  assert.strictEqual(eco.users.u1.name, "Cibele");
  assert.ok(M.addUser(eco, { id: "u2", name: "cibele", auth }, MON, cfg()), "nome repetido sem diferenciar maiúsculas");
  assert.ok(M.addUser(eco, { id: "u2", name: "K", auth }, MON, cfg()), "nome curto");
  assert.ok(M.addUser(eco, { id: "u1", name: "André", auth }, MON, cfg()), "id repetido");
  assert.ok(M.addUser(eco, { id: "u3", name: "Pinho", auth }, MON, cfg({ signupOpen: false })), "cadastro fechado");
  assert.strictEqual(M.findByName(eco, "CIBELE").id, "u1");
  assert.strictEqual(eco.users.u1.wallet.free, 30, "boas-vindas");
  assert.strictEqual(M.view(eco, "u1").auth, undefined, "view não mostra o hash da senha");
  assert.strictEqual(M.addUser(eco, { id: "u4", name: "Kirito", auth }, MON, cfg({ signupBonus: 0 })), null);
  assert.strictEqual(eco.users.u4.wallet.free, 0, "sem boas-vindas");
  books(eco);
  console.log("ok contas");
}

// Carteira: crédito, débito, reserva
{
  const eco = M.create();
  M.addUser(eco, { id: "a", name: "Ana", auth }, MON, cfg());
  assert.ok(M.credit(eco, "a", 0, "prize", MON), "crédito zero");
  assert.ok(M.credit(eco, "a", 1.5, "prize", MON), "crédito quebrado");
  assert.ok(M.credit(eco, "zz", 5, "prize", MON), "conta inexistente");
  assert.ok(M.debit(eco, "a", 31, "fee", MON), "débito acima do saldo");
  assert.strictEqual(eco.users.a.wallet.free, 30, "débito recusado não mexe no saldo");
  assert.strictEqual(M.debit(eco, "a", 8, "fee", MON), null);
  assert.ok(M.reserve(eco, "a", 23, MON), "reserva acima do saldo livre");
  assert.strictEqual(M.reserve(eco, "a", 15, MON), null);
  assert.deepStrictEqual(eco.users.a.wallet, { free: 7, reserved: 15 });
  assert.ok(M.debit(eco, "a", 8, "fee", MON), "reservado não pode ser gasto como livre");
  assert.ok(M.release(eco, "a", 16), "libera mais do que reservou");
  assert.strictEqual(M.release(eco, "a", 5), null);
  assert.strictEqual(M.capture(eco, "a", 10, "sale", MON, "leilão 1"), null);
  assert.deepStrictEqual(eco.users.a.wallet, { free: 12, reserved: 0 });
  assert.strictEqual(M.supply(eco), 12);
  assert.strictEqual(M.ledgerOf(eco, "a", 2)[0].kind, "sale", "extrato do mais novo para o mais antigo");
  books(eco);
  console.log("ok carteira");
}

// Mesada: próximo ciclo, idempotência, semanas perdidas
{
  const next = M.nextCycle(MON, cfg());
  assert.strictEqual(new Date(next).toISOString(), "2026-11-02T03:00:00.000Z", "segunda 00:00 em Brasília");
  assert.strictEqual(M.nextCycle(next, cfg()), next + W, "no instante exato já vale o próximo");
  assert.strictEqual(new Date(M.nextCycle(MON, cfg({ allowanceDay: 5, allowanceHour: 20 }))).toISOString(), "2026-10-30T23:00:00.000Z", "sexta 20h");

  const eco = M.create();
  M.addUser(eco, { id: "a", name: "Ana", auth }, MON, cfg());
  M.addUser(eco, { id: "b", name: "Beto", auth }, MON + 3 * 864e5, cfg());
  assert.strictEqual(eco.users.a.nextAllowanceAt, eco.users.b.nextAllowanceAt, "ciclo igual para todos");
  assert.deepStrictEqual(M.tick(eco, next - 1, cfg()), [], "antes do ciclo");
  assert.deepStrictEqual(M.tick(eco, next, cfg()).sort(), ["a", "b"]);
  assert.deepStrictEqual(M.tick(eco, next + 1000, cfg()), [], "não paga duas vezes");
  assert.strictEqual(eco.users.a.wallet.free, 60);
  // servidor fora do ar por 3 semanas: não acumula
  M.tick(eco, next + 3 * W + 5, cfg());
  assert.strictEqual(eco.users.a.wallet.free, 90);
  assert.strictEqual(eco.users.a.nextAllowanceAt, next + 4 * W, "reagenda para depois de agora");
  // com acúmulo de até 2 semanas
  M.tick(eco, next + 8 * W, cfg({ allowanceCatchUp: 2 }));
  assert.strictEqual(eco.users.a.wallet.free, 150);
  // o estado vai e volta por JSON (reinício do servidor) sem perder a agenda
  const again = JSON.parse(JSON.stringify(eco));
  assert.deepStrictEqual(M.tick(again, next + 8 * W + 10, cfg()), [], "depois de reiniciar não paga de novo");
  books(again);
  console.log("ok mesada");
}

// Sessões
{
  const eco = M.create();
  M.addUser(eco, { id: "a", name: "Ana", auth }, MON, cfg());
  M.addSession(eco, "h1", "a", MON, cfg({ sessionDays: 1 }));
  M.addSession(eco, "h2", "a", MON, cfg({ sessionDays: 30 }));
  assert.strictEqual(M.sessionUser(eco, "h1", MON + 1000), "a");
  assert.strictEqual(M.sessionUser(eco, "h1", MON + 2 * 864e5), null, "sessão expirada");
  assert.strictEqual(M.sessionUser(eco, "nada", MON), null);
  M.revokeSessions(eco, "a", "h2");
  assert.strictEqual(M.sessionUser(eco, "h1", MON), null, "revogada");
  assert.strictEqual(M.sessionUser(eco, "h2", MON), "a", "a sessão atual continua");
  M.revokeSession(eco, "h2");
  assert.strictEqual(M.sessionUser(eco, "h2", MON), null, "saiu da conta");
  console.log("ok sessões");
}
console.log("Todos os testes do Mercado passaram.");
