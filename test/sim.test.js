// Teste da simulação da economia: algumas semanas com os três perfis, conferindo as contas.
const assert = require("assert");
const { run } = require("../scripts/simulate-economy.js");

const r = run({ weeks: 10, players: 6, seed: 7 });
assert.ok(r.booksOk, "extrato confere com as carteiras de todo mundo");
const f = r.flow, entrou = (f.signup || 0) + (f.allowance || 0) + (f.buyback || 0) + (f.admin || 0), saiu = -((f.estreia || 0) + (f.fee || 0));
assert.strictEqual(r.circulation, entrou - saiu, "o dinheiro em circulação é o que entrou menos o que saiu");
assert.strictEqual((f.purchase || 0) + (f.sale || 0), 0, "compras entre jogadores = vendas");
Object.values(r.eco.films).forEach((film) => assert.ok(film.minted <= film.supply, "passou da tiragem: " + film.title));
const caps = r.eco.users;
Object.keys(caps).forEach((uid) => {
  const lend = Object.values(r.eco.copies).filter((c) => c.owner === uid && r.eco.films[c.film].rarity === "lendario").length;
  assert.ok(lend <= 2, "teto de Lendários estourado");
});
assert.ok(r.byRarity.some((x) => x.vendasEstreia > 0), "a simulação vende cópias nas estreias");
assert.ok(r.snapshots.length >= 2, "relatório ao longo do tempo");
console.log(`ok simulação de ${r.weeks} semanas: M$ ${r.circulation} em circulação, ${Object.keys(r.eco.copies).length} cópias`);
console.log("Todos os testes da simulação passaram.");
