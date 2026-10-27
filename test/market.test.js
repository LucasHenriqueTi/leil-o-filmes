// Teste do Mercado (fase 1): contas, carteira, extrato, sessões e mesada.
const assert = require("assert");
const M = require("../public/market.js");

const W = M.WEEK;
const cfg = (o) => Object.assign({}, M.CONFIG, { signupBonus: 30, allowance: 30, allowanceDay: 1, allowanceHour: 0, tzOffsetMin: -180, allowanceCatchUp: 1, scoreWeights: { imdb: 1, metacritic: 1, rt: 1 } }, o || {});
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
// Notas: formatos, média e Unanimidade
{
  assert.strictEqual(M.parseScore("8.8/10"), 8.8);
  assert.strictEqual(M.parseScore("74/100"), 7.4);
  assert.strictEqual(M.parseScore("87%"), 8.7);
  assert.strictEqual(M.parseScore("7,5/10"), 7.5, "vírgula decimal");
  assert.strictEqual(M.parseScore("sem nota"), null);
  assert.strictEqual(M.parseScore("120/100"), null, "fora de 0 a 10");
  assert.strictEqual(M.refRating({ imdb: 8 }, cfg()), null, "uma nota só não basta");
  assert.deepStrictEqual(M.refRating({ imdb: 8, rt: 9 }, cfg()), { ref: 8.5, n: 2, spread: 1, unanimous: true }, "diferença 1,0 ainda é Unanimidade");
  assert.deepStrictEqual(M.refRating({ imdb: 8, metacritic: 6.9, rt: 9 }, cfg()), { ref: 8, n: 3, spread: 2.1, unanimous: false });
  assert.strictEqual(M.refRating({ imdb: 8, metacritic: null, rt: "" }, cfg()), null, "nota vazia não conta");
  assert.strictEqual(M.refRating({ imdb: 7, rt: 8.2 }, cfg({ unanimityMaxSpread: 1.5 })).unanimous, true, "limiar configurável");
  console.log("ok notas");
}

// Raridade: bordas das faixas, Tomate Podre, Obra de Arte e Garimpo
{
  const R = (ref, g, n) => M.rarityOf(ref, !!g, n || 2, cfg());
  [[0, "podre"], [1.5, "podre"], [1.6, "comum"], [6.5, "comum"], [6.6, "incomum"], [7.5, "incomum"], [7.6, "raro"], [8.3, "raro"],
    [8.4, "epico"], [8.7, "epico"], [8.8, "lendario"], [9.1, "lendario"], [9.2, "obra"], [10, "obra"]]
    .forEach(([ref, key]) => assert.strictEqual(R(ref), key, `nota ${ref}`));
  assert.strictEqual(R(6.5, true), "incomum", "Garimpo sobe uma faixa");
  assert.strictEqual(R(7.6, true), "raro", "Garimpo para em Raro");
  assert.strictEqual(R(8.5, true), "epico", "Garimpo não rebaixa");
  assert.strictEqual(R(9.6, true), "obra", "Garimpo não rebaixa a Obra de Arte");
  assert.strictEqual(R(1.2, true), "podre", "Garimpo não tira do Tomate Podre");
  assert.strictEqual(M.rarityOf(8.0, true, 2, cfg({ garimpoCap: "obra" })), "epico", "com teto maior, o Garimpo passa de Raro");
  assert.strictEqual(M.rarityOf(8.9, true, 2, cfg({ garimpoCap: "obra" })), "obra", "e pula o Tomate Podre na subida");
  // as duas faixas extremas podem exigir as 3 notas
  const strict = cfg({ garimpoCap: "obra", rarities: M.CONFIG.rarities.map((r) => (r.key === "obra" || r.key === "podre" ? Object.assign({}, r, { requireScores: 3 }) : r)) });
  assert.strictEqual(M.rarityOf(9.5, false, 3, strict), "obra", "Obra de Arte com 3 notas");
  assert.strictEqual(M.rarityOf(9.8, false, 2, strict), "lendario", "Obra de Arte exige as 3 notas");
  assert.strictEqual(M.rarityOf(1.0, false, 3, strict), "podre", "Tomate Podre com 3 notas");
  assert.strictEqual(M.rarityOf(1.0, false, 2, strict), "comum", "Tomate Podre exige as 3 notas");
  assert.strictEqual(M.rarityOf(9.0, true, 2, strict), "lendario", "nem com teto maior o Garimpo dispensa as 3 notas");
  console.log("ok raridade");
}

// Catálogo e cópias numeradas
{
  const eco = M.create();
  M.addUser(eco, { id: "a", name: "Ana", auth }, MON, cfg());
  M.addUser(eco, { id: "b", name: "Beto", auth }, MON, cfg());
  const film = (id, scores, o) => Object.assign({ id, title: "Filme " + id, year: 2001, g: ["Drama"], links: 80, scores, img: "https://upload.wikimedia.org/x.jpg" }, o || {});
  assert.ok(M.addFilm(eco, film("123", { imdb: 8, rt: 8 }), MON, cfg()), "IMDb inválido");
  assert.ok(M.addFilm(eco, film("tt0000001", { imdb: 8 }), MON, cfg()), "uma nota só fica fora");
  assert.strictEqual(M.addFilm(eco, film("tt0000002", { imdb: 8.5, metacritic: 8.4, rt: 8.6 }), MON, cfg()), null);
  assert.ok(M.addFilm(eco, film("tt0000002", { imdb: 9, rt: 9 }), MON, cfg()), "filme repetido");
  const f = eco.films.tt0000002;
  assert.deepStrictEqual([f.rarity, f.supply, f.minted, f.ref, f.unanimous, f.garimpo], ["epico", 3, 0, 8.5, true, false]);
  assert.strictEqual(M.addFilm(eco, film("tt0000003", { imdb: 6.2, rt: 6.6 }, { links: 20, img: "https://evil.example.com/x.jpg" }), MON, cfg()), null);
  assert.deepStrictEqual([eco.films.tt0000003.rarity, eco.films.tt0000003.garimpo, eco.films.tt0000003.img], ["incomum", true, null], "Garimpo e pôster de domínio estranho descartado");
  assert.strictEqual(M.addFilm(eco, film("tt0000004", { imdb: 9.2, metacritic: 10, rt: 9.7 }), MON, cfg()), null);
  assert.deepStrictEqual([eco.films.tt0000004.rarity, eco.films.tt0000004.supply], ["obra", 1]);

  // a tiragem nasce aos poucos, numerada, até o limite
  for (let i = 1; i <= 3; i++) assert.strictEqual(M.mintCopy(eco, "tt0000002", "house", MON + i), null);
  assert.ok(M.mintCopy(eco, "tt0000002", "house", MON), "não passa da tiragem");
  assert.ok(M.mintCopy(eco, "tt9999999", "house", MON), "filme fora do Mercado");
  assert.ok(M.mintCopy(eco, "tt0000004", "zz", MON), "dono inválido");
  assert.deepStrictEqual(Object.keys(eco.copies), ["tt0000002#1", "tt0000002#2", "tt0000002#3"]);
  assert.strictEqual(M.copyLabel(eco, eco.copies["tt0000002#2"]), "cópia 2/3");

  // dono e histórico
  assert.strictEqual(M.transferCopy(eco, "tt0000002#2", "a", 12, "house-auction", MON + 10), null);
  assert.strictEqual(M.transferCopy(eco, "tt0000002#2", "b", 20, "sale", MON + 20), null);
  assert.ok(M.transferCopy(eco, "tt0000002#2", "b", 1, "sale", MON), "já é do dono");
  assert.ok(M.transferCopy(eco, "tt0000002#2", "a", -1, "sale", MON), "preço negativo");
  assert.ok(M.transferCopy(eco, "tt0000002#9", "a", 1, "sale", MON), "cópia inexistente");
  const h = eco.copies["tt0000002#2"].history;
  assert.deepStrictEqual(h.map((x) => [x.from, x.to, x.price, x.kind]), [[null, "house", 0, "mint"], ["house", "a", 12, "house-auction"], ["a", "b", 20, "sale"]]);

  const col = M.collectionOf(eco, "b");
  assert.strictEqual(col.length, 1); assert.strictEqual(col[0].label, "cópia 2/3"); assert.strictEqual(col[0].film.rarity, "epico");
  assert.deepStrictEqual(M.collectionOf(eco, "a"), []);
  const cat = M.catalogView(eco);
  assert.deepStrictEqual(cat.map((x) => x.rarity), ["obra", "epico", "incomum"], "do mais raro para o mais comum");
  assert.deepStrictEqual([cat[1].left, cat[1].house], [0, 2]);
  assert.strictEqual(M.openFilms(eco), 2, "filmes com cópias ainda por emitir");
  books(eco);
  console.log("ok catálogo e cópias");
}

// Correções manuais
{
  const base = { id: "tt0000009", title: "X", scores: { imdb: 7 } };
  assert.strictEqual(M.applyOverrides(base, {}), base);
  const o = M.applyOverrides(base, { tt0000009: { scores: { metacritic: 8 }, film: { title: "Título certo" } } });
  assert.deepStrictEqual(o.scores, { imdb: 7, metacritic: 8 }, "completa a nota que faltava");
  assert.strictEqual(o.title, "Título certo");
  assert.strictEqual(base.scores.metacritic, undefined, "não mexe no original");
  assert.ok(M.refRating(o.scores), "com a correção, o filme entra no Mercado");
  console.log("ok correções");
}

// Peso do Rotten Tomatoes e raridade que só congela na primeira cópia
{
  const r = M.refRating({ metacritic: 7.9, rt: 9.4 });   // config real: o RT vale metade
  assert.strictEqual(r.ref, 8.4, "o Tomatometer não empurra a média até Lendário");
  assert.strictEqual(r.spread, 1.5, "a Unanimidade compara as notas sem peso");
  assert.strictEqual(M.refRating({ imdb: 0, rt: 9 }, cfg({ scoreWeights: { imdb: 1, rt: 0 } })).ref, 0, "peso zero ignora a fonte na média");
  const eco = M.create();
  M.addFilm(eco, { id: "tt0000101", title: "A", links: 80, scores: { metacritic: 8.3, rt: 9.4 } }, MON, cfg());
  M.addFilm(eco, { id: "tt0000102", title: "B", links: 80, scores: { metacritic: 8.3, rt: 9.4 } }, MON, cfg());
  assert.strictEqual(eco.films.tt0000101.rarity, "lendario", "com pesos iguais era Lendário");
  M.mintCopy(eco, "tt0000102", "house", MON);
  assert.strictEqual(M.refreeze(eco), 1);
  assert.deepStrictEqual([eco.films.tt0000101.ref, eco.films.tt0000101.rarity, eco.films.tt0000101.supply], [8.7, "epico", 3], "sem cópias, segue a fórmula nova");
  assert.strictEqual(eco.films.tt0000102.rarity, "lendario", "com cópia emitida, fica congelado");
  M.addFilm(eco, { id: "tt0000103", title: "C", links: 80, scores: { imdb: 7, rt: 7 } }, MON);
  assert.strictEqual(M.pruneCatalog(eco, new Set(["tt0000103"])), 1, "tira só quem não tem cópias e não foi pedido");
  assert.deepStrictEqual(Object.keys(eco.films).sort(), ["tt0000102", "tt0000103"]);
  console.log("ok peso do RT e congelamento");
}

// Estreias da Casa: agenda, lances, prorrogação, fechamento, recompra
const bidNG = (...x) => M.bid(...x, cfg({ ghostBuyer: false }));   // aqui o foco são lances e prorrogação; o fantasma tem bloco próprio
{
  const X = require("../public/market-films.js");
  const eco = M.create();
  ["a", "b", "c"].forEach((id) => M.addUser(eco, { id, name: "Conta " + id, auth }, MON, cfg()));
  X.examples.forEach((f) => assert.strictEqual(M.addFilm(eco, f, MON), null, f.title));
  const [day, week, month] = M.CONFIG.estreias;
  assert.strictEqual(new Date(M.nextEstreia(day, MON)).toISOString(), "2026-10-26T23:00:00.000Z", "hoje às 20h");
  assert.strictEqual(new Date(M.nextEstreia(week, MON)).toISOString(), "2026-10-31T23:00:00.000Z", "sábado às 20h");
  assert.strictEqual(new Date(M.nextEstreia(month, MON)).toISOString(), "2026-11-01T23:00:00.000Z", "dia 1º às 20h");
  assert.strictEqual(new Date(M.nextEstreia(month, Date.UTC(2026, 10, 2))).toISOString(), "2026-12-01T23:00:00.000Z", "depois do dia 1º, no mês seguinte");

  // a cada início (modo de teste) abre uma de cada, já valendo
  assert.strictEqual(M.restartEstreias(eco, MON, M.CONFIG, () => 0).length, 3);
  const open = (k) => Object.values(eco.auctions).find((a) => a.status === "open" && a.event === k);
  const d = open("day");
  assert.deepStrictEqual([d.film, eco.films[d.film].rarity, d.minBid], ["tt0325980", "incomum", 3], "do dia: Comum ou Incomum");
  assert.ok(["raro", "epico"].includes(eco.films[open("week").film].rarity), "da semana: Raro ou Épico");
  assert.ok(["lendario", "podre", "obra"].includes(eco.films[open("month").film].rarity), "do mês: Lendário, Tomate Podre ou Obra de Arte");

  // lances: mínimo, saldo livre, reserva e devolução para quem foi superado
  assert.ok(bidNG(eco, d.id, "a", 2, MON + 1000), "abaixo do lance mínimo");
  assert.strictEqual(bidNG(eco, d.id, "a", 3, MON + 1000), null);
  assert.deepStrictEqual(eco.users.a.wallet, { free: 27, reserved: 3 });
  assert.ok(bidNG(eco, d.id, "a", 5, MON + 1000), "já está na frente");
  assert.ok(bidNG(eco, d.id, "b", 3, MON + 1000), "precisa passar o maior lance");
  assert.ok(bidNG(eco, d.id, "b", 31, MON + 1000), "acima do saldo livre");
  assert.strictEqual(bidNG(eco, d.id, "b", 4, MON + 2000), null);
  assert.deepStrictEqual(eco.users.a.wallet, { free: 30, reserved: 0 }, "quem foi superado recebe o dinheiro de volta");

  // prorrogação: lance nos últimos 30 s soma 30 s
  const end = d.endsAt;
  assert.strictEqual(bidNG(eco, d.id, "c", 5, end - 40000), null);
  assert.strictEqual(d.endsAt, end, "fora da janela não prorroga");
  assert.strictEqual(bidNG(eco, d.id, "a", 6, end - 10000), null);
  assert.deepStrictEqual([d.endsAt, d.extended], [end + 30000, 1]);
  assert.ok(bidNG(eco, d.id, "b", 9, end + 30000), "depois do fim não vale");

  // fechamento: o vencedor paga com o reservado e a cópia nasce para ele
  const before = M.supply(eco);
  assert.deepStrictEqual(M.tickAuctions(eco, end + 30000), [d.id]);
  const cid = "tt0325980#1";
  assert.strictEqual(eco.copies[cid].owner, "a");
  assert.deepStrictEqual(eco.copies[cid].history.map((h) => [h.from, h.to, h.price, h.kind]), [[null, "house", 0, "mint"], ["house", "a", 6, "estreia"]]);
  assert.deepStrictEqual(eco.users.a.wallet, { free: 24, reserved: 0 });
  assert.strictEqual(M.supply(eco), before - 6, "o pagamento sai de circulação");
  assert.strictEqual(M.auctionView(eco, d, "a").result.winnerName, "Conta a");

  // sem lances: nada é emitido
  const w = open("week");
  M.tickAuctions(eco, w.endsAt);
  assert.deepStrictEqual([w.status, w.result.winner, eco.films[w.film].minted], ["closed", null, 0]);

  // valor de referência e recompra: base 3 × 2 = 6, média com a venda de 6 = 6; recompra 40% = 2
  assert.strictEqual(M.refValue(eco, "tt0325980"), 6);
  assert.strictEqual(M.buybackPrice(eco, "tt0325980"), 2);
  assert.ok(M.sellToHouse(eco, "b", cid, end + 40000), "só o dono vende");
  assert.strictEqual(M.sellToHouse(eco, "a", cid, end + 40000), null);
  assert.deepStrictEqual([eco.copies[cid].owner, eco.users.a.wallet.free], ["house", 26]);
  assert.strictEqual(M.refValue(eco, "tt0325980"), 6, "a recompra não conta como venda no valor de referência");
  assert.deepStrictEqual(M.pickLot(eco, ["incomum"], () => 0), { film: "tt0325980", copy: cid }, "a cópia recomprada volta numa estreia, sem emitir outra");

  // sem lucro garantido: a Casa nunca recompra acima do lance mínimo da faixa
  Object.values(eco.films).forEach((f) => { const min = M.rarity(f.rarity).minBid; assert.ok(M.buybackPrice(eco, f.id) <= Math.max(1, min - 1), "recompra acima do mínimo em " + f.title); });

  // cancelar devolve o lance; a agenda segue depois do reinício
  const m = open("month");
  assert.strictEqual(bidNG(eco, m.id, "c", m.minBid, end + 1000), null);
  assert.strictEqual(eco.users.c.wallet.reserved, m.minBid);
  M.restartEstreias(eco, end + 50000, M.CONFIG, () => 0);
  assert.deepStrictEqual([m.status, eco.users.c.wallet.free, eco.users.c.wallet.reserved], ["canceled", 30, 0], "reinício cancela e devolve");
  // limpar o catálogo leva junto as estreias sem venda dos filmes removidos, e a vitrine continua montando
  assert.strictEqual(Object.values(eco.auctions).filter((a) => a.status === "open").length, 3);
  const gone = open("week");
  M.cancelAuction(eco, gone.id, end + 51000);
  M.pruneCatalog(eco, new Set(X.examples.map((f) => f.id).filter((id) => id !== gone.film)));
  assert.ok(!eco.films[gone.film] && !eco.auctions[gone.id], "filme e estreia antiga removidos");
  assert.doesNotThrow(() => M.auctionsView(eco, "a"));
  const nextDay = eco.house.next.day;
  assert.ok(M.dueAuctions(eco, nextDay));
  assert.strictEqual(M.openDueEstreias(eco, nextDay).length, 1, "a agenda abre a próxima estreia do dia");
  assert.strictEqual(eco.house.next.day, nextDay + 864e5);
  // admin: abrir estreia fora da agenda e ver as contas
  const agenda = Object.assign({}, eco.house.next);
  const now1 = M.openEstreiaNow(eco, "month", nextDay + 1, M.CONFIG, () => 0);
  assert.ok(now1.id && eco.auctions[now1.id].status === "open", "abre na hora");
  assert.deepStrictEqual(eco.house.next, agenda, "não mexe na agenda");
  assert.ok(M.openEstreiaNow(eco, "ano", nextDay).error, "estreia desconhecida");
  const accs = M.accountsView(eco);
  assert.deepStrictEqual(accs.map((u) => u.name), ["Conta a", "Conta b", "Conta c"]);
  assert.strictEqual(accs[0].auth, undefined, "sem hash de senha");
  const view = M.auctionsView(eco, "a");
  assert.ok(view.open.length >= 3 && view.recent.length >= 2 && view.next.day, "vitrine com abertas, encerradas e agenda");
  books(eco);
  console.log("ok estreias da Casa, lances, prorrogação e recompra");
}
// Leilões dos jogadores: anúncio, taxas, formatos, reserva secreta, agendamento e limites
{
  const X = require("../public/market-films.js");
  const eco = M.create(), T0 = MON, MIN = 60e3;
  ["a", "b", "c", "d"].forEach((id) => { M.addUser(eco, { id, name: "Conta " + id, auth }, T0, cfg()); M.credit(eco, id, 70, "admin", T0); });   // M$ 100 cada
  X.examples.forEach((f) => M.addFilm(eco, f, T0));
  const give = (film, uid) => { M.mintCopy(eco, film, uid, T0); return `${film}#${eco.films[film].minted}`; };
  const raro = give("tt0441773", "a"), epico = give("tt0088247", "a"), comum = give("tt0418279", "a"), incomum = give("tt0325980", "a"), raro2 = give("tt0816692", "b");
  const list = (uid, o, now) => M.listCopy(eco, uid, Object.assign({ format: "open", minutes: 15 }, o), now == null ? T0 : now);
  const supply0 = M.supply(eco);

  // validações e taxas
  assert.ok(list("b", { copy: raro }).error, "só o dono anuncia");
  assert.ok(list("a", { copy: raro, format: "leilao" }).error, "formato inválido");
  assert.ok(list("a", { copy: raro, minutes: 7 }).error, "duração fora da lista");
  assert.ok(list("a", { copy: raro, startsAt: T0 + 8 * 864e5 }).error, "agendar até 7 dias");
  assert.ok(list("a", { copy: raro, format: "dutch", startPrice: 6 }).error, "relógio precisa começar acima do mínimo");
  assert.strictEqual(M.listingCost(eco, comum, true), 7, "anúncio + vitrine");
  assert.strictEqual(M.listingCost(eco, epico, true), 2, "Épico vai para a vitrine de graça");
  const open1 = list("a", { copy: raro, reserve: 25 }).id;
  assert.ok(open1 && eco.users.a.wallet.free === 98, "taxa de anúncio cobrada");
  assert.ok(list("a", { copy: raro }).error, "cópia já anunciada");
  assert.ok(M.sellToHouse(eco, "a", raro, T0), "cópia anunciada não vai para a Casa");
  const feat = list("a", { copy: epico }).id;
  assert.strictEqual(eco.auctions[feat].featured, true, "Épico entra na vitrine sozinho");
  assert.ok(list("a", { copy: comum }).error, "até 2 anúncios por jogador");

  // Aberto com reserva secreta não alcançada: a cópia fica com o dono e o lance volta
  const a1 = eco.auctions[open1];
  assert.ok(M.bid(eco, open1, "a", 10, T0 + MIN), "não dá lance no próprio leilão");
  assert.strictEqual(M.bid(eco, open1, "b", 20, T0 + MIN), null);
  assert.strictEqual(M.auctionView(eco, a1, "b").reserve, null, "reserva escondida de quem dá lance");
  assert.strictEqual(M.auctionView(eco, a1, "b").hasReserve, true, "mas todos sabem que existe");
  assert.strictEqual(M.auctionView(eco, a1, "a").reserve, 25, "o dono vê a própria reserva");
  M.tickAuctions(eco, a1.endsAt);
  assert.deepStrictEqual([a1.result.winner, a1.result.reserveMissed, eco.copies[raro].owner, eco.users.b.wallet.free], [null, true, "a", 100], "abaixo da reserva: nada muda de dono");

  // Aberto vendido: comprador paga, dono recebe menos a taxa de 8%
  const sale = list("a", { copy: raro }, a1.endsAt).id, s = eco.auctions[sale];
  M.bid(eco, sale, "b", 20, a1.endsAt + MIN); M.bid(eco, sale, "c", 25, a1.endsAt + MIN);
  assert.deepStrictEqual(eco.users.b.wallet, { free: 100, reserved: 0 }, "superado recebe de volta");
  const aBefore = eco.users.a.wallet.free;
  M.closeAuction(eco, sale, a1.endsAt + 2 * MIN);
  assert.deepStrictEqual([s.result.winner, s.result.price, s.result.fee], ["c", 25, 2]);
  assert.strictEqual(eco.copies[raro].owner, "c");
  assert.strictEqual(eco.users.a.wallet.free, aBefore + 25 - 2, "vendedor recebe 25 - 2 de taxa");
  assert.deepStrictEqual(eco.copies[raro].history.slice(-1).map((h) => [h.from, h.to, h.price, h.kind]), [["a", "c", 25, "sale"]]);

  // Lance secreto: o maior leva e paga o próprio lance; empate fica com quem mandou antes; ninguém vê os lances até o fim
  M.cancelAuction(eco, feat, T0);
  const sealed = list("a", { copy: epico, format: "sealed" }, T0 + 10 * MIN).id, sl = eco.auctions[sealed];
  assert.ok(M.bid(eco, sealed, "b", 9, T0 + 11 * MIN), "abaixo do mínimo da raridade (Épico M$ 10)");
  M.bid(eco, sealed, "b", 12, T0 + 11 * MIN); M.bid(eco, sealed, "c", 15, T0 + 12 * MIN); M.bid(eco, sealed, "d", 15, T0 + 13 * MIN);
  M.bid(eco, sealed, "c", 15, T0 + 14 * MIN);   // repetir o mesmo valor não perde a vez
  const vb = M.auctionView(eco, sl, "b");
  assert.deepStrictEqual([vb.high, vb.highBy, vb.myBid, vb.bids, vb.mine], [0, null, 12, 3, true], "lances escondidos, cada um vê o seu");
  assert.strictEqual(eco.users.c.wallet.reserved, 15, "lance secreto fica reservado");
  M.closeAuction(eco, sealed, sl.endsAt);
  assert.deepStrictEqual([sl.result.winner, sl.result.price], ["c", 15], "empate: quem mandou antes");
  assert.deepStrictEqual(sl.result.reveal.map((b) => b.v), [15, 15, 12], "lances revelados no fim");
  assert.deepStrictEqual([eco.users.b.wallet.reserved, eco.users.d.wallet.reserved, eco.users.c.wallet.reserved], [0, 0, 0]);
  assert.strictEqual(eco.copies[epico].owner, "c");

  // Secreto de 2º preço: o maior leva pagando o segundo lance (ou a reserva/mínimo, se for maior)
  const vk = list("a", { copy: incomum, format: "vickrey" }, T0 + 20 * MIN).id, v1 = eco.auctions[vk];
  M.bid(eco, vk, "b", 30, T0 + 21 * MIN); M.bid(eco, vk, "d", 11, T0 + 21 * MIN);
  const bFree = eco.users.b.wallet.free + eco.users.b.wallet.reserved;
  M.closeAuction(eco, vk, v1.endsAt);
  assert.deepStrictEqual([v1.result.winner, v1.result.price], ["b", 11], "paga o segundo maior");
  assert.strictEqual(eco.users.b.wallet.free, bFree - 11, "o resto do lance volta");
  const vk2 = list("b", { copy: incomum, format: "vickrey", reserve: 8 }, v1.endsAt).id, v2 = eco.auctions[vk2];
  M.bid(eco, vk2, "c", 20, v1.endsAt + MIN);
  M.closeAuction(eco, vk2, v2.endsAt);
  assert.deepStrictEqual([v2.result.winner, v2.result.price], ["c", 8], "um lance só: paga a reserva");

  // Relógio holandês: o preço cai do inicial até o mínimo; o primeiro a comprar leva na hora
  const du = list("b", { copy: raro2, format: "dutch", startPrice: 46, minutes: 15 }, T0 + 40 * MIN).id, dd = eco.auctions[du];
  const half = dd.startsAt + (dd.endsAt - dd.startsAt) / 2;
  assert.strictEqual(M.dutchPrice(dd, dd.startsAt), 46);
  assert.strictEqual(M.dutchPrice(dd, half), 26, "metade do caminho entre 46 e 6");
  assert.strictEqual(M.dutchPrice(dd, dd.endsAt + MIN), 6, "não passa do mínimo");
  assert.strictEqual(M.auctionView(eco, dd, "c").floor, 6, "no relógio o mínimo é visível");
  assert.strictEqual(M.bid(eco, du, "d", 0, half), null);
  assert.deepStrictEqual([dd.status, dd.result.winner, dd.result.price, eco.copies[raro2].owner], ["closed", "d", 26, "d"], "comprou e fechou na hora");

  // Agendado: abre na hora marcada; o dono desiste antes de ter lance (a taxa não volta)
  const later = T0 + 3 * 3600e3, sch = list("c", { copy: raro, startsAt: later }, T0 + 50 * MIN).id, sc = eco.auctions[sch];
  assert.strictEqual(sc.status, "scheduled");
  assert.ok(/ainda não começou/.test(M.bid(eco, sch, "d", 10, T0 + 51 * MIN)));
  assert.ok(M.dueAuctions(eco, later));
  assert.deepStrictEqual(M.startDue(eco, later), [sch]);
  assert.strictEqual(sc.status, "open");
  const cFree = eco.users.c.wallet.free;
  assert.strictEqual(M.unlist(eco, "c", sch, later + 1), null);
  assert.deepStrictEqual([sc.status, eco.users.c.wallet.free, eco.copies[raro].owner], ["canceled", cFree, "c"], "desistiu sem reembolso, cópia continua dele");
  const sch2 = list("c", { copy: raro }, later + 2).id;
  M.bid(eco, sch2, "d", 6, later + 3);
  assert.ok(M.unlist(eco, "c", sch2, later + 4), "com lance, vai até o fim");
  assert.ok(M.unlist(eco, "d", sch2, later + 4), "só o dono desiste");

  // limite geral de anúncios
  const tight = cfg({ maxActiveUserAuctions: 1 });
  assert.ok(M.listCopy(eco, "d", { copy: raro2, format: "open", minutes: 15 }, later + 5, tight).error, "limite de anúncios no Mercado");

  // o dinheiro que sumiu é exatamente o das taxas
  const fees = eco.ledger.filter((e) => e.kind === "fee").reduce((x, e) => x - e.delta, 0);
  const bought = eco.ledger.filter((e) => e.kind === "purchase").reduce((x, e) => x - e.delta, 0);
  const sold = eco.ledger.filter((e) => e.kind === "sale").reduce((x, e) => x + e.delta, 0);
  assert.strictEqual(bought, sold, "o que os compradores pagaram foi para os vendedores");
  assert.strictEqual(M.supply(eco), supply0 - fees, "só as taxas saem de circulação");
  books(eco);
  console.log("ok leilões dos jogadores: formatos, taxas, reserva, agenda e limites");
}

// Fase 5: teto por raridade, comprador fantasma, temporada, pontuação da coleção e ranking
{
  const X = require("../public/market-films.js");
  const eco = M.create(), MIN = 60e3, [day, , month] = M.CONFIG.estreias;
  ["a", "b"].forEach((id) => { M.addUser(eco, { id, name: "Conta " + id, auth }, MON, cfg()); M.credit(eco, id, 470, "admin", MON); });   // M$ 500 cada
  X.examples.forEach((f) => M.addFilm(eco, f, MON));
  M.setSeason(eco, "Terror", MON);   // nenhum exemplo é de Terror: os valores não dependem do mês em que o teste roda
  const lend = (n) => { const id = "tt000020" + n; M.addFilm(eco, { id, title: "Lendário " + n, links: 80, scores: { imdb: 8.8, metacritic: 8.8 } }, MON); return id; };

  // teto: no máximo 2 Lendários por jogador, contando os lances na frente
  M.mintCopy(eco, "tt0468569", "a", MON); M.mintCopy(eco, "tt0111161", "a", MON);
  const l1 = M.openAuction(eco, month, { film: lend(1) }, MON), l2 = M.openAuction(eco, month, { film: lend(2) }, MON), l3 = M.openAuction(eco, month, { film: lend(3) }, MON);
  assert.ok(/Teto/.test(M.bid(eco, l1, "a", 50, MON + MIN)), "já tem 2 Lendários");
  assert.strictEqual(M.bid(eco, l1, "b", 50, MON + MIN), null);
  assert.strictEqual(M.bid(eco, l2, "b", 50, MON + MIN), null);
  assert.ok(/Teto/.test(M.bid(eco, l3, "b", 50, MON + MIN)), "dois lances na frente já contam como 2");
  assert.strictEqual(M.capCheck(eco, "b", "raro"), null, "Raro não tem teto");

  // comprador fantasma: teto fixo por faixa; a cada lance abaixo dele, a Casa cobre com uma chance que cai pela metade
  const COBRE = () => 0, PASSA = () => 0.99, NUNCA = () => { throw new Error("não devia sortear"); };
  const ghostOf = (rar, minBid) => M.ghostCeiling(eco, { rarity: rar, minBid }, MON, M.CONFIG);
  assert.deepStrictEqual(M.CONFIG.rarities.map((r) => ghostOf(r.key, r.minBid)), [0, 0, 8, 14, 24, 45, 45], "a Casa não disputa Comum e Incomum; o teto sobe com a raridade");
  // Raro (Interestelar, mínimo 6, teto 8): chance de 25%
  const g = M.openAuction(eco, day, { film: "tt0816692" }, MON), ga = eco.auctions[g];
  assert.strictEqual(M.ghostCeiling(eco, ga, MON + 100 * 864e5, M.CONFIG), 8, "o teto não sobe com temporada nem com vendas");
  assert.strictEqual(M.auctionView(eco, ga, "a").houseChance, 25);
  assert.strictEqual(M.bid(eco, g, "a", 6, MON + MIN, null, COBRE), null);
  assert.deepStrictEqual([ga.highBy, ga.high, eco.users.a.wallet.reserved], ["house", 7, 0], "a Casa cobre e nada fica reservado");
  assert.deepStrictEqual([M.auctionView(eco, ga, "a").highName, M.auctionView(eco, ga, "a").houseChance], ["Casa", 13], "a chance cai pela metade");
  assert.ok(M.bid(eco, g, "a", 7, MON + MIN, null, COBRE), "precisa passar o lance da Casa");
  assert.strictEqual(M.bid(eco, g, "a", 8, MON + MIN, null, NUNCA), null, "no teto, a Casa nem sorteia");
  assert.deepStrictEqual([ga.highBy, ga.high, eco.users.a.wallet.reserved, M.auctionView(eco, ga, "a").houseChance], ["a", 8, 8, 0], "passou do teto: a Casa está fora");
  assert.strictEqual(M.bid(eco, g, "b", 9, MON + MIN, null, NUNCA), null);
  M.tickAuctions(eco, ga.endsAt);
  assert.strictEqual(eco.copies["tt0816692#1"].owner, "b");
  // Épico (O Exterminador do Futuro, mínimo 10, teto 14): a Casa pode deixar passar, cobrir depois e parar no teto
  const k = M.openAuction(eco, day, { film: "tt0088247" }, MON), ka = eco.auctions[k];
  assert.strictEqual(M.bid(eco, k, "a", 10, MON + MIN, null, PASSA), null);
  assert.strictEqual(ka.highBy, "a", "o sorteio deixou passar");
  const bRes = eco.users.b.wallet.reserved;
  assert.strictEqual(M.bid(eco, k, "b", 11, MON + MIN, null, COBRE), null);
  assert.deepStrictEqual([ka.highBy, ka.high, eco.users.a.wallet.reserved, eco.users.b.wallet.reserved], ["house", 12, 0, bRes], "cobriu o lance de outro jogador; o lance de quem estava na frente volta");
  assert.strictEqual(M.auctionView(eco, ka, "a").houseChance, 20);
  assert.strictEqual(M.bid(eco, k, "a", 13, MON + MIN, null, COBRE), null);
  assert.deepStrictEqual([ka.highBy, ka.high, ka.ghostCovers], ["house", 14, 2], "nunca passa do teto");
  M.cancelAuction(eco, k, MON + MIN);
  // Obra de Arte: cada cobertura pula um quarto do caminho até o teto (25 → 45: +5)
  assert.strictEqual(M.bid(eco, M.openAuction(eco, month, { film: "tt0068646" }, MON), "a", 25, MON + MIN, null, COBRE), null);
  assert.strictEqual(Object.values(eco.auctions).find((x) => x.film === "tt0068646" && x.status === "open").high, 30);
  // a Casa não disputa as faixas comuns
  const c0 = M.openAuction(eco, day, { film: "tt0325980" }, MON);
  assert.strictEqual(M.bid(eco, c0, "a", 3, MON + MIN, null, NUNCA), null);
  assert.strictEqual(eco.auctions[c0].highBy, "a", "Incomum sai pelo lance mínimo");
  M.cancelAuction(eco, c0, MON + MIN);
  const h = M.openAuction(eco, day, { film: "tt0441773" }, MON), ha = eco.auctions[h];
  M.bid(eco, h, "b", 6, MON + MIN, null, COBRE);
  M.tickAuctions(eco, ha.endsAt);
  assert.deepStrictEqual([ha.result.winner, ha.result.house, eco.films.tt0441773.minted, eco.users.b.wallet.free + eco.users.b.wallet.reserved], [null, true, 0, 491], "a Casa terminou na frente: nada é emitido, ninguém paga (b só pagou o Interestelar)");
  assert.strictEqual(M.bid(eco, M.openAuction(eco, day, { film: "tt0441773" }, MON), "b", 6, MON + MIN, cfg({ ghostBuyer: false })), null, "dá para desligar o fantasma");

  // temporada: um gênero por mês, igual para todos; o admin pode trocar
  const s = M.season(eco, MON);
  assert.ok(M.CONFIG.seasonGenres.includes(s.genre));
  assert.deepStrictEqual([s.month, new Date(s.endsAt).toISOString()], ["2026-10", "2026-11-01T03:00:00.000Z"]);
  assert.strictEqual(M.season(eco, MON + 10 * 864e5).genre, s.genre, "o mesmo gênero o mês inteiro");
  assert.ok(M.setSeason(eco, "Faroeste", MON), "só gêneros da lista");
  assert.strictEqual(M.setSeason(eco, "Drama", MON), null);
  assert.deepStrictEqual([M.season(eco, MON).genre, M.season(eco, MON).override], ["Drama", true]);
  assert.strictEqual(M.season(eco, Date.UTC(2026, 10, 15)).override, false, "a troca do admin vale só no mês");
  assert.strictEqual(M.refValue(eco, "tt0111161"), 30, "Um Sonho de Liberdade: 15 × 2");
  assert.strictEqual(M.refValue(eco, "tt0111161", null, MON), 38, "Drama em alta: +25%");
  console.log("ok teto por raridade, comprador fantasma e temporada");

  // pontuação: notas de referência + conjuntos + temporada (cada filme conta uma vez)
  const sc = M.create();
  M.addUser(sc, { id: "a", name: "Ana", auth }, MON, cfg()); M.addUser(sc, { id: "b", name: "Beto", auth }, MON, cfg());
  X.examples.forEach((f) => M.addFilm(sc, f, MON));
  [1, 2, 3].forEach((n) => M.addFilm(sc, { id: "tt000030" + n, title: "Saga " + n, year: 1990 + n, dir: "Diretor " + n, g: ["Terror"], series: "Saga Teste", links: 80, scores: { imdb: 6, metacritic: 6 } }, MON));
  ["tt0816692", "tt1375666", "tt1375666", "tt0468569", "tt0000301", "tt0000302", "tt0000303"].forEach((id) => M.mintCopy(sc, id, "a", MON));
  M.setSeason(sc, "Drama", MON);
  const p = M.collectionScore(sc, "a", MON);
  assert.strictEqual(p.films, 6, "duas cópias do mesmo filme contam uma vez");
  assert.strictEqual(p.base, 43, "7,9 + 8,2 + 8,9 + 3 × 6,0");
  assert.deepStrictEqual(p.bonuses.map((b) => [b.kind, b.label, b.pts]), [["series", "Saga Teste", 4], ["director", "Christopher Nolan", 2], ["season", "Drama", 4]], "conjuntos no começo da escada");
  assert.strictEqual(p.total, 53);
  // escada: cada filme a mais soma, até o teto
  const D = M.CONFIG.collectionBonuses.director;
  assert.deepStrictEqual([2, 3, 4, 5, 9, 20].map((n) => M.setPoints(D, n)), [0, 2, 3, 4, 8, 8], "Mesmo diretor: +2 com 3 filmes, +1 por filme a mais, até +8");
  assert.deepStrictEqual(M.rankingView(sc, MON).map((r) => [r.name, r.total]), [["Ana", 53], ["Beto", 0]]);
  books(eco); books(sc);
  console.log("ok pontuação da coleção e ranking");
}
// Tomate Podre: vale como a Obra de Arte, com a lógica invertida
{
  const X = require("../public/market-films.js");
  const eco = M.create();
  M.addUser(eco, { id: "a", name: "Ana", auth }, MON, cfg());
  X.examples.forEach((f) => M.addFilm(eco, f, MON));
  const podre = eco.films.tt0795461, obra = eco.films.tt0068646;
  assert.deepStrictEqual([podre.rarity, podre.supply, M.rarity("podre").minBid], ["podre", 1, M.rarity("obra").minBid], "uma cópia só e o lance mínimo da Obra de Arte");
  assert.strictEqual(M.refValue(eco, "tt0795461"), M.refValue(eco, "tt0068646"), "vale o mesmo que a Obra de Arte");
  assert.deepStrictEqual([M.filmPoints(podre), M.filmPoints(obra)], [9.1, 9.6], "na coleção vale 10 − nota; os outros, a nota");
  M.mintCopy(eco, "tt0795461", "a", MON);
  assert.strictEqual(M.collectionScore(eco, "a", MON).base, 9.1);
  assert.ok(M.capCheck(eco, "a", "podre"), "teto de 1 Tomate Podre por jogador");
  // o Garimpo segue o config atual nos filmes ainda sem cópias
  M.addFilm(eco, { id: "tt0000201", title: "Obscuro", links: 28, scores: { imdb: 6, metacritic: 6 } }, MON, cfg({ garimpoBelowLinks: 30 }));
  assert.deepStrictEqual([eco.films.tt0000201.garimpo, eco.films.tt0000201.rarity], [true, "incomum"]);
  M.refreeze(eco, cfg());
  assert.deepStrictEqual([eco.films.tt0000201.garimpo, eco.films.tt0000201.rarity], [false, "comum"], "com 25 páginas de corte, 28 não é mais Garimpo");
  console.log("ok tomate podre");
}

// coleção pública (ranking): filmes, cópias e pontos de qualquer conta, sem a carteira
{
  const X = require("../public/market-films.js");
  const eco = M.create();
  M.addUser(eco, { id: "a", name: "Ana", auth }, MON, cfg());
  X.examples.forEach((f) => M.addFilm(eco, f, MON));
  M.mintCopy(eco, "tt0418279", "a", MON); M.mintCopy(eco, "tt0068646", "a", MON);
  const pc = M.publicCollection(eco, "a", MON);
  assert.deepStrictEqual([pc.name, pc.copies.map((c) => [c.film.title, c.label, c.listed])], ["Ana", [["O Poderoso Chefão", "cópia 1/1", false], ["Transformers", "cópia 1/20", false]]], "do mais raro para o mais comum");
  assert.strictEqual(pc.score.total, M.collectionScore(eco, "a", MON).total);
  assert.ok(!("wallet" in pc) && !JSON.stringify(pc).includes("buyback"), "nada da carteira nem da recompra");
  assert.strictEqual(M.publicCollection(eco, "zzz", MON), null);
  console.log("ok coleção pública");
}

// tags dos filmes (Cult, Oscar, Nacional) e os conjuntos de bônus
{
  const X = require("../public/market-films.js");
  const eco = M.create();
  M.addUser(eco, { id: "a", name: "Ana", auth }, MON, cfg());
  X.examples.forEach((f) => M.addFilm(eco, f, MON));
  assert.deepStrictEqual([M.filmTags(eco.films.tt0068646), eco.films.tt0068646.oscars], [[], ["filme", "atuacao", "roteiro"]], "O Poderoso Chefão: Oscars por família");
  assert.ok(X.cult.length >= 30 && new Set(X.cult).size === X.cult.length, "lista de cults sem repetição");
  const film = (n, t) => M.addFilm(eco, Object.assign({ id: "tt000040" + n, title: "Filme " + n, year: 1950 + n * 10, dir: "Diretor " + n, g: ["G" + n], links: 80, scores: { imdb: 7, metacritic: 7 } }, t), MON);
  [1, 2, 3].forEach((n) => film(n, { cult: true }));
  [4, 5].forEach((n) => film(n, { nacional: true }));
  assert.deepStrictEqual(M.catalogView(eco).find((f) => f.id === "tt0000401").tags, ["cult"], "a tela recebe as tags");
  ["tt0000401", "tt0000402", "tt0000403", "tt0000404", "tt0000405"].forEach((id) => M.mintCopy(eco, id, "a", MON));
  let sc = M.collectionScore(eco, "a", MON, cfg({ seasonPts: 0 }));
  assert.deepStrictEqual(sc.bonuses.map((b) => [b.kind, b.name, b.label, b.pts]), [["cult", "Cults", "", 3]], "3 cults: +3; 2 nacionais ainda não");
  assert.strictEqual(M.applyTags(eco, { tt0000403: { nacional: true }, tt9999999: { cult: true } }), 1, "atualiza as tags do catálogo e ignora quem não está nele");
  sc = M.collectionScore(eco, "a", MON, cfg({ seasonPts: 0 }));
  assert.deepStrictEqual(sc.bonuses.map((b) => b.kind), ["cult", "nacional"], "o mesmo filme conta em mais de um conjunto");
  // Oscar: cada família é um conjunto (3 com Atuação: +4); famílias diferentes não se somam
  M.applyTags(eco, { tt0000401: { oscars: ["atuacao", "nada"] }, tt0000402: { oscars: ["atuacao"] }, tt0000404: { oscars: ["atuacao", "roteiro"] }, tt0000405: { oscars: ["roteiro"] } });
  assert.deepStrictEqual(eco.films.tt0000401.oscars, ["atuacao"], "família desconhecida fica de fora");
  assert.deepStrictEqual(M.catalogView(eco).find((f) => f.id === "tt0000404").oscars, ["atuacao", "roteiro"], "a tela recebe as famílias");
  sc = M.collectionScore(eco, "a", MON, cfg({ seasonPts: 0 }));
  assert.deepStrictEqual(sc.bonuses.filter((b) => b.kind === "oscar").map((b) => [b.label, b.n, b.pts]), [["Atuação", 3, 2]], "3 Oscars de Atuação: +2; 2 de Roteiro ainda não");
  console.log("ok tags");
}
console.log("Todos os testes do Mercado passaram.");
