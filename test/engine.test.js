// Teste do motor: partidas aleatórias em todos os formatos, checando invariantes.
const assert = require("assert");
const E = require("../public/engine.js");

function films(n) {
  const G = ["Terror", "Drama", "Ação", "Comédia", "Ficção científica"];
  return Array.from({ length: n }, (_, i) => ({ id: "tt" + (1000 + i), title: "Filme " + i, year: 1970 + i * 3, g: [G[i % 5], G[(i + 2) % 5]], r: 6 + (i % 4) }));
}
let seed = 7; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function play(formats, opts = {}) {
  const st = E.create({ money: 20, maxFilms: 3, formats, market: true, missions: true, turnSeconds: 5, sealedSeconds: 5, dutchStepMs: 500, autoNextSeconds: 2, ...opts });
  ["a", "b", "c", "d"].forEach((id, i) => assert.strictEqual(E.addPlayer(st, id, "P" + i), null));
  assert.ok(E.addPlayer(st, "x", "p0"), "nome duplicado deve falhar");
  let now = 1e6;
  assert.strictEqual(E.start(st, films(10), now, rng), null);
  let steps = 0;
  while (st.phase === "playing" && steps++ < 5000) {
    const lot = st.lot;
    if (lot.stage === "done") { if (rng() < 0.5) E.next(st, now); else { now += 2100; E.tick(st, now); } continue; }
    const r = rng();
    if (lot.format === "classic") {
      const p = st.players.find((x) => x.id === lot.turn);
      if (r < 0.15) { now += 5100; E.tick(st, now); }
      else if (r < 0.45) assert.strictEqual(E.act(st, p.id, { type: "pass" }, now), null);
      else { const v = lot.high + 1 + Math.floor(rng() * 3); const m0 = p.money; const e = E.act(st, p.id, { type: "bid", amount: v }, now); if (v <= m0) assert.strictEqual(e, null); else assert.ok(e); }
      assert.ok(E.act(st, "zz", { type: "pass" }, now));
    } else if (lot.format === "sealed") {
      const pending = lot.eligible.filter((id) => !lot.bids[id]);
      if (r < 0.1) { now += 5100; E.tick(st, now); }
      else { const id = pending[0]; const p = st.players.find((x) => x.id === id); E.act(st, id, { type: "sealed", amount: Math.floor(rng() * (p.money + 1)) }, now); }
    } else {
      if (r < 0.2) { const id = lot.eligible[Math.floor(rng() * lot.eligible.length)]; E.act(st, id, { type: "buy" }, now); }
      else { now += 500; E.tick(st, now); }
    }
    st.players.forEach((p) => { assert.ok(p.money >= 0, "saldo negativo"); assert.ok(p.films.length <= 3, "passou do limite"); });
    const v = E.view(st, "a");
    if (v.lot && v.lot.format === "sealed" && v.lot.stage === "bid") assert.deepStrictEqual(v.lot.bids, {}, "lance secreto vazou");
    v.players.filter((p) => p.id !== "a").forEach((p) => assert.ok(p.missions.every((m) => m.hidden), "missão vazou"));
  }
  assert.strictEqual(st.phase, "over", "partida não terminou");
  const spent = st.players.reduce((a, p) => a + (20 - p.money), 0);
  const paid = st.results.reduce((a, r) => a + r.price, 0);
  assert.strictEqual(spent, paid, "dinheiro não bate");
  assert.strictEqual(st.results.length, 10, "todo lote tem resultado");
  const sc = E.scores(st);
  assert.strictEqual(sc.length, 4);
  return { st, sc };
}

for (const f of [["classic"], ["sealed"], ["dutch"], ["classic", "sealed", "dutch"]]) {
  for (let i = 0; i < 40; i++) play(f);
  const { sc, st } = play(f);
  console.log("ok", f.join("+"), "| vencedor", sc[0].id, sc[0].total, "| mercado", E.market(st).slice(0, 3).map((m) => m.genre + ":" + m.count).join(", "));
}
// Relógio: preço cai e ninguém compra -> sem comprador
{
  const st = E.create({ formats: ["dutch"], dutchStepMs: 300, autoNextSeconds: 0 });
  E.addPlayer(st, "a", "A"); E.addPlayer(st, "b", "B");
  E.start(st, films(1), 0, rng);
  assert.strictEqual(st.lot.price, 20);
  E.tick(st, 1500 + 300 * 25);
  assert.strictEqual(st.lot.stage, "done"); assert.strictEqual(st.lot.result.by, null);
  console.log("ok relógio sem comprador");
}
// Lance secreto: empate vai para quem enviou primeiro
{
  const st = E.create({ formats: ["sealed"] });
  E.addPlayer(st, "a", "A"); E.addPlayer(st, "b", "B"); E.addPlayer(st, "c", "C");
  E.start(st, films(2), 0, rng);
  E.act(st, "b", { type: "sealed", amount: 7 }, 10);
  E.act(st, "a", { type: "sealed", amount: 7 }, 20);
  E.act(st, "c", { type: "sealed", amount: 3 }, 30);
  assert.strictEqual(st.lot.result.by, "b"); assert.strictEqual(st.lot.result.price, 7);
  console.log("ok empate no lance secreto");
}
// Doação na sala: sai do dinheiro inicial e sempre sobra R$ 1 para jogar
{
  const st = E.create({ money: 10 });
  E.addPlayer(st, "a", "A"); E.addPlayer(st, "b", "B");
  assert.ok(E.donate(st, "a", 0), "doação mínima é R$ 1");
  assert.ok(E.donate(st, "zz", 1), "só jogador doa");
  assert.strictEqual(E.donate(st, "a", 3), null);
  assert.strictEqual(E.donate(st, "a", 6), null);
  assert.ok(E.donate(st, "a", 1), "precisa guardar R$ 1");
  assert.strictEqual(E.donateLeft(st, st.players[0]), 0);
  E.start(st, films(2), 0, rng);
  assert.strictEqual(st.players[0].money, 1, "começa com o que sobrou");
  assert.strictEqual(st.players[1].money, 10);
  assert.ok(E.donate(st, "b", 1), "não doa com o leilão em andamento");
  E.finish(st);
  assert.strictEqual(E.scores(st).find((r) => r.id === "a").spent, 0, "doação não conta como gasto em lances");
  E.backToLobby(st);
  assert.strictEqual(st.players[0].donated, 0, "nova rodada zera as doações");
  console.log("ok doação na sala");
}
console.log("Todos os testes do motor passaram.");
