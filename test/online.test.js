// Teste online: sobe o servidor, conecta 3 jogadores + 1 espectador e joga uma partida inteira.
// Depois testa as contas do Mercado e reinicia o servidor para conferir que nada se perdeu.
// Usa o WebSocket nativo do Node 22+.
const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 3999;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ml-online-"));
const DATA = path.join(DATA_DIR, "market.json");
function startServer() {
  const p = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT), ML_DATA: DATA, ML_ADMINS: "", ML_FILMS: "off" }, stdio: ["ignore", "pipe", "inherit"] });
  p.ready = new Promise((r) => p.stdout.on("data", (b) => /rodando/.test(String(b)) && r()));
  return p;
}
let srv = startServer();
const cleanup = () => { srv.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(name) { this.name = name; this.token = "tok_" + name + "_" + Math.random().toString(36).slice(2, 12); this.seq = 0; this.waits = {}; this.state = null; this.chat = []; this.reacts = []; }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      this.ws.onopen = () => res();
      this.ws.onerror = rej;
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.t === "ack") { this.waits[m.id](m.d); delete this.waits[m.id]; }
        if (m.t === "state") this.state = m.d;
        if (m.t === "chat") this.chat.push(m.d);
        if (m.t === "react") this.reacts.push(m.d);
        if (m.t === "auth:out") this.out = true;
      };
    });
  }
  call(t, d) { return new Promise((res) => { const id = ++this.seq; this.waits[id] = res; this.ws.send(JSON.stringify({ t, id, d })); }); }
  get st() { return this.state && this.state.st; }
}

(async () => {
  try {
    await srv.ready;
    const http = await fetch(`http://localhost:${PORT}/health`).then((r) => r.json());
    assert.ok(http.ok, "health");
    const idx = await fetch(`http://localhost:${PORT}/sala/ABCD`); assert.strictEqual(idx.status, 200, "link de convite");
    const trav = await fetch(`http://localhost:${PORT}/..%2fserver.js`); assert.notStrictEqual(trav.status, 200, "path traversal bloqueado");

    const A = new Client("Ana"), B = new Client("Beto"), C = new Client("Caio"), W = new Client("Watcher");
    await Promise.all([A, B, C, W].map((c) => c.connect()));
    const created = await A.call("room:create", { name: "Ana", token: A.token });
    assert.ok(created.ok && created.code, "criar sala: " + JSON.stringify(created));
    const code = created.code;
    assert.ok((await B.call("room:join", { code, name: "Beto", token: B.token })).ok);
    assert.ok((await C.call("room:join", { code: code.toLowerCase(), name: "Caio", token: C.token })).ok, "código sem diferenciar maiúsculas");
    assert.ok((await W.call("room:join", { code, name: "x", token: W.token, watch: true })).watching, "espectador");
    assert.ok((await B.call("room:join", { code: "ZZZZ", name: "Beto", token: B.token })).error, "sala inexistente");
    // B volta para a sala certa (o join inválido não tira ninguém)
    await B.call("room:join", { code, name: "Beto", token: B.token });
    assert.ok((await B.call("room:settings", { money: 5 })).error, "só host muda regras");
    assert.ok((await A.call("room:settings", { money: 15, maxFilms: 2, formats: ["classic", "sealed", "dutch"], market: true, missions: true, turnSeconds: 2, sealedSeconds: 2, dutchStepMs: 300, autoNextSeconds: 1 })).ok);
    await sleep(100);
    assert.strictEqual(B.st.settings.money, 15, "regras chegam a todos");
    assert.strictEqual(B.st.players.length, 3);

    await B.call("chat:send", { text: "bora!" });
    W.ws.send(JSON.stringify({ t: "react", d: { e: "🔥" } }));
    await sleep(100);
    assert.ok(A.chat.some((m) => m.text === "bora!" && m.name === "Beto"), "chat");
    assert.ok(A.reacts.some((r) => r.e === "🔥"), "reação");

    // emoji no limite não é cortado no meio
    await sleep(750);
    await B.call("chat:send", { text: "a".repeat(139) + "🔥🔥" });
    // doação na sala
    assert.ok((await W.call("room:donate", { amount: 1 })).error, "espectador não doa");
    assert.ok((await B.call("room:donate", { amount: 15 })).error, "precisa guardar R$ 1");
    assert.ok((await B.call("room:donate", { amount: 4, text: "bora 💸" })).ok, "doar");
    assert.ok((await B.call("room:donate", { amount: 1 })).error, "uma doação por vez");
    await sleep(100);
    assert.ok(!A.chat.some((m) => m.text && /\uD83D$/.test(m.text)), "emoji partido no chat");
    const don = A.chat.find((m) => m.donate);
    assert.ok(don && don.donate === 4 && don.name === "Beto" && don.text === "bora 💸", "doação chega no chat de todos");
    assert.strictEqual(A.st.players.find((p) => p.name === "Beto").donated, 4);

    const lots = Array.from({ length: 6 }, (_, i) => ({ id: "tt" + (500 + i), title: "Filme " + i, year: 1980 + i * 7, g: ["Terror", "Drama"], r: 7 + i / 10, img: "https://evil.example.com/x.jpg" }));
    assert.ok((await B.call("game:start", { lots })).error, "só host começa");
    assert.ok((await A.call("game:start", { lots })).ok, "começar");
    await sleep(100);
    assert.strictEqual(A.st.phase, "playing");
    assert.strictEqual(A.st.lots[0].img, null, "imagem de domínio estranho é descartada");
    assert.ok(A.st.lots.every((f) => f.r === null), "nota escondida durante a live");
    assert.ok(A.st.players.find((p) => p.id !== A.state.you).missions[0].hidden, "missão alheia escondida");
    assert.ok(!A.st.players.find((p) => p.id === A.state.you).missions[0].hidden, "minha missão visível");
    assert.ok((await W.call("game:act", { type: "pass" })).error, "espectador não joga");

    // Reconexão: Caio cai e volta com o mesmo token
    C.ws.close(); await sleep(150);
    assert.strictEqual(A.st.players.find((p) => p.name === "Caio").connected, false, "aparece desconectado");
    const C2 = new Client("Caio"); C2.token = C.token; await C2.connect();
    const rj = await C2.call("room:join", { code, name: "Caio", token: C.token });
    assert.ok(rj.rejoined, "reconectou no mesmo lugar");
    const players = { [A.state.you]: A, [B.state.you]: B, [C2.state ? C2.state.you : rj.you]: C2 };
    await sleep(100);

    let guard = 0, sawSealedSecret = false;
    while (A.st.phase === "playing" && guard++ < 400) {
      const lot = A.st.lot;
      if (lot.stage === "done") { await sleep(120); continue; }
      if (lot.format === "classic") {
        const who = players[lot.turn];
        if (who) await who.call("game:act", Math.random() < 0.5 ? { type: "bid", amount: lot.high + 1 } : { type: "pass" });
      } else if (lot.format === "sealed") {
        for (const c of Object.values(players)) {
          const me = c.state.you;
          if (lot.eligible.includes(me) && !(lot.submitted || []).includes(me)) await c.call("game:act", { type: "sealed", amount: 1 + Math.floor(Math.random() * 3) });
          if (c.st.lot && c.st.lot.format === "sealed" && c.st.lot.stage === "bid") { assert.deepStrictEqual(c.st.lot.bids, {}, "lance secreto vazou"); sawSealedSecret = true; }
        }
      } else {
        if (Math.random() < 0.3) { const c = Object.values(players)[Math.floor(Math.random() * 3)]; await c.call("game:act", { type: "buy" }); }
      }
      await sleep(80);
    }
    await sleep(200);
    assert.strictEqual(A.st.phase, "over", "partida terminou");
    assert.strictEqual(W.st.phase, "over", "espectador vê o fim");
    assert.ok(A.st.players.every((p) => p.missions.every((m) => !m.hidden)), "missões reveladas no fim");
    const spent = A.st.players.reduce((a, p) => a + (15 - p.donated - p.money), 0);
    assert.strictEqual(spent, A.st.results.reduce((a, r) => a + r.price, 0), "dinheiro confere");
    assert.ok(A.st.lots.every((f) => f.r !== null), "notas reveladas no fim");

    // voto da galera: jogadores e espectador votam; o host encerra
    const [sa, sb, sc] = [A.state.you, B.state.you, C2.state.you];
    assert.ok((await A.call("game:vote", { target: sa })).error, "não vota em si mesmo");
    assert.ok((await A.call("game:vote", { target: sb })).ok);
    assert.ok((await B.call("game:vote", { target: sc })).ok);
    assert.ok((await W.call("game:vote", { target: sb })).ok, "espectador vota");
    assert.ok((await W.call("game:vote", { target: sb })).ok, "espectador repete o voto sem contar duas vezes");
    await sleep(100);
    assert.deepStrictEqual(W.st.votes, {}, "votos secretos com a votação aberta");
    assert.strictEqual(W.st.voteTotal, 3); assert.strictEqual(W.st.myVote, sb);
    assert.ok((await B.call("game:closeVote")).error, "só host encerra");
    assert.ok((await A.call("game:closeVote")).ok, "encerrar votação");
    await sleep(100);
    assert.strictEqual(B.st.voting, "closed");
    assert.strictEqual(Object.values(B.st.votes).filter((t) => t === sb).length, 2, "contagem revelada");
    assert.ok(A.chat.some((m) => /galera escolheu a coleção de Beto/.test(m.text)), "anúncio do voto no chat");
    assert.ok((await C2.call("game:vote", { target: sa })).error, "votação fechada");
    assert.ok((await A.call("game:lobby")).ok, "voltar para a sala");
    await sleep(100);
    assert.strictEqual(B.st.phase, "lobby");
    console.log("ok partida online completa:", A.st.results.filter((r) => r.by).length, "filmes vendidos; lance secreto testado:", sawSealedSecret);

    /* ---------- Mercado: contas ---------- */
    const MC = require("../public/market-config.js");
    const U1 = new Client("u1"), U2 = new Client("u2"), U3 = new Client("u3"), BAD = new Client("bad"), R = new Client("r"), T = new Client("t");
    await Promise.all([U1, U2, U3, BAD, R, T].map((c) => c.connect()));
    assert.ok((await U1.call("market:me")).error, "precisa entrar antes");
    const r1 = await U1.call("auth:register", { name: "Cibele", password: "pipoca123" });
    assert.ok(r1.ok && r1.session && r1.me.admin, "primeira conta vira admin: " + JSON.stringify(r1));
    assert.strictEqual(r1.me.wallet.free, MC.signupBonus, "boas-vindas");
    assert.strictEqual(r1.me.auth, undefined, "o hash da senha não sai do servidor");
    assert.ok((await U2.call("auth:register", { name: "cibele", password: "outra123" })).error, "nome repetido");
    assert.ok((await U2.call("auth:register", { name: "André", password: "123" })).error, "senha curta");
    const r2 = await U2.call("auth:register", { name: "André", password: "cinema99" });
    assert.ok(r2.ok && !r2.me.admin, "segunda conta não é admin");
    assert.ok((await U3.call("auth:register", { name: "Kirito", password: "katana77" })).ok);

    // senha errada e bloqueio
    for (let i = 0; i < MC.loginTries; i++) assert.strictEqual((await BAD.call("auth:login", { name: "Kirito", password: "errada" + i })).error, "Nome ou senha incorretos.");
    assert.ok(/Muitas tentativas/.test((await BAD.call("auth:login", { name: "Kirito", password: "katana77" })).error), "bloqueia depois de errar demais");
    assert.ok((await R.call("auth:login", { name: "kirito", password: "katana77" })).error, "o bloqueio vale para o nome em qualquer conexão");
    assert.strictEqual((await R.call("auth:login", { name: "Ninguém", password: "qualquer" })).error, "Nome ou senha incorretos.", "nome inexistente dá a mesma mensagem");

    // login, volta com o token e extrato
    const L = await R.call("auth:login", { name: "CIBELE", password: "pipoca123" });
    assert.ok(L.ok && L.me.id === r1.me.id, "login sem diferenciar maiúsculas");
    assert.ok((await T.call("auth:resume", { session: "token-falso" })).error, "token falso");
    assert.strictEqual((await T.call("auth:resume", { session: r1.session })).me.name, "Cibele", "volta com o token salvo");
    const me = await T.call("market:me");
    assert.strictEqual(me.ledger[0].kind, "signup"); assert.deepStrictEqual(me.collection, []);

    // catálogo do Mercado (buscas desligadas no teste: ML_FILMS=off)
    assert.ok((await BAD.call("market:catalog")).error, "catálogo só para quem entrou");
    const cat = await T.call("market:catalog");
    assert.ok(cat.ok && Array.isArray(cat.films), "catálogo responde");
    assert.ok((await U2.call("admin:refillCatalog")).error, "só admin atualiza o catálogo");
    assert.ok(/desligadas/.test((await U1.call("admin:refillCatalog")).error), "sem buscas no teste");
    assert.ok(cat.films.some((f) => f.rarity === "obra"), "filmes de exemplo no catálogo mesmo sem internet");

    // estreias da Casa: no modo de teste, as 3 abrem a cada início
    let au = await U1.call("market:auctions");
    for (let i = 0; i < 30 && au.open.length < 3; i++) { await sleep(100); au = await U1.call("market:auctions"); }
    assert.deepStrictEqual(au.open.map((a) => a.event).sort(), ["day", "month", "week"], "estreias do dia, da semana e do mês");
    const dayA = au.open.find((a) => a.event === "day");
    assert.ok((await U1.call("market:bid", { id: dayA.id, amount: dayA.minBid - 1 })).error, "abaixo do mínimo");
    // comprador fantasma: a Casa não disputa Comum e Incomum; nas faixas raras, pode cobrir (sorteio no servidor)
    const weekA = au.open.find((a) => a.event === "week");
    assert.strictEqual(weekA.houseChance, Math.round(MC.ghostChance[weekA.film.rarity] * 100), "a tela mostra a chance da Casa");
    const rw = await U2.call("market:bid", { id: weekA.id, amount: weekA.minBid });
    const ceiling = Math.round(weekA.minBid * (1 + MC.ghostAbove[weekA.film.rarity]));
    const reservedW = (await U2.call("market:me")).me.wallet.reserved;
    if (rw.house) assert.ok(rw.high > weekA.minBid && rw.high <= ceiling && reservedW === 0, "a Casa cobriu até o teto, e nada fica reservado: " + JSON.stringify(rw));
    else assert.strictEqual(reservedW, weekA.minBid, "a Casa deixou passar: o lance fica reservado");
    assert.ok((await U1.call("admin:cancelAuction", { id: weekA.id })).ok, "cancelar devolve o lance");
    const rb = await U1.call("market:bid", { id: dayA.id, amount: dayA.minBid });
    assert.ok(rb.ok && !rb.house, "na estreia do dia a Casa não disputa: " + JSON.stringify(rb));
    const won = dayA.minBid;
    assert.strictEqual((await U1.call("market:me")).me.wallet.reserved, won, "o lance fica reservado");
    assert.ok((await U2.call("market:bid", { id: dayA.id, amount: won })).error, "precisa passar o maior lance");
    assert.ok((await U1.call("market:sell", { copy: "tt0068646#1" })).error, "só vende cópia que é sua");

    // ferramentas de admin: encerrar antes do tempo entrega a cópia na hora
    assert.ok((await U2.call("admin:closeAuction", { id: dayA.id })).error, "só admin encerra");
    assert.ok((await U2.call("admin:accounts")).error, "só admin vê as contas");
    const closed = await U1.call("admin:closeAuction", { id: dayA.id });
    assert.ok(closed.ok && closed.result.winnerName === "Cibele" && closed.result.price === won, "encerrar agora: " + JSON.stringify(closed));
    const meWin = await U1.call("market:me");
    assert.deepStrictEqual([meWin.me.wallet.free, meWin.me.wallet.reserved], [MC.signupBonus - won, 0], "pagou com o reservado");
    assert.strictEqual(meWin.collection.length, 1, "a cópia entrou na coleção");
    assert.strictEqual(meWin.collection[0].film.id, dayA.film.id);
    // pontuação, ranking e temporada
    assert.ok(meWin.score.total > 0 && meWin.score.base === meWin.collection[0].film.ref, "pontos da coleção: " + JSON.stringify(meWin.score));
    assert.ok(meWin.caps.some((c) => c.rarity === "lendario" && c.cap === 2), "tetos por raridade no market:me");
    const rk = await U2.call("market:ranking");
    assert.strictEqual(rk.ranking[0].name, "Cibele", "ranking de colecionadores");
    assert.ok(MC.seasonGenres.includes(rk.season.genre), "temporada do mês");
    assert.ok((await U2.call("admin:season", { genre: "Drama" })).error, "só admin troca a temporada");
    assert.strictEqual((await U1.call("admin:season", { genre: "Drama" })).season.genre, "Drama");
    assert.ok((await U1.call("admin:season", { genre: "Faroeste" })).error, "gênero fora da lista");
    assert.strictEqual((await U1.call("admin:season", { genre: "" })).season.override, false, "volta ao sorteio do mês");
    assert.ok((await U1.call("admin:grant", { name: "andré", amount: 50 })).ok, "dar M$");
    assert.ok((await U1.call("admin:grant", { name: "andré", amount: 0 })).error, "valor inválido");
    const accs = (await U1.call("admin:accounts")).accounts;
    assert.strictEqual(accs.find((u) => u.name === "André").wallet.free, MC.signupBonus + 50, "André recebeu");
    assert.strictEqual(accs.find((u) => u.name === "Cibele").copies.length, 1, "admin vê a coleção de cada conta");
    const opened = await U1.call("admin:openEstreia", { event: "day" });
    assert.ok(opened.ok, "abrir estreia agora: " + JSON.stringify(opened));
    assert.ok((await U1.call("admin:openEstreia", { event: "ano" })).error, "estreia desconhecida");
    assert.ok((await U2.call("market:bid", { id: opened.id, amount: 20 })).ok);
    assert.ok((await U1.call("admin:cancelAuction", { id: opened.id })).ok, "cancelar");
    assert.strictEqual((await U2.call("market:me")).me.wallet.reserved, 0, "cancelar devolve o lance");
    // coleção de outra conta, pelo ranking: André vê a da Cibele, sem a carteira
    const pcol = await U2.call("market:collection", { id: r1.me.id });
    assert.ok(pcol.ok && pcol.name === "Cibele" && pcol.copies.length === 1 && !pcol.wallet, "ver a coleção de outro jogador: " + JSON.stringify(pcol).slice(0, 160));
    assert.ok((await U2.call("market:collection", { id: "ninguem" })).error, "conta inexistente");
    assert.ok((await BAD.call("market:collection", { id: r1.me.id })).error, "só para quem entrou");
    const paid = won;

    // leilão de jogador: Cibele anuncia a cópia que ganhou, André dá lance, o admin encerra
    const copyId = meWin.collection[0].id;
    assert.ok((await U2.call("market:list", { copy: copyId, format: "open", minutes: 15 })).error, "só o dono anuncia");
    assert.ok((await U1.call("market:list", { copy: copyId, format: "open", minutes: 7 })).error, "duração inválida");
    const listed = await U1.call("market:list", { copy: copyId, format: "open", minutes: 15, reserve: 0 });
    assert.ok(listed.ok, "anunciar: " + JSON.stringify(listed));
    assert.ok((await U1.call("market:sell", { copy: copyId })).error, "anunciada não vai para a Casa");
    const pl = (await U2.call("market:auctions")).players;
    assert.strictEqual(pl.length, 1, "aparece para os outros");
    assert.strictEqual(pl[0].sellerName, "Cibele");
    assert.ok((await U1.call("market:bid", { id: listed.id, amount: 50 })).error, "não dá lance no próprio leilão");
    assert.ok((await U2.call("market:bid", { id: listed.id, amount: 12 })).ok, "André dá lance");
    const sellerBefore = (await U1.call("market:me")).me.wallet.free;
    const sold = await U1.call("admin:closeAuction", { id: listed.id });
    assert.deepStrictEqual([sold.result.winnerName, sold.result.price, sold.result.fee], ["André", 12, 1], "vendido com taxa de 8%");
    assert.strictEqual((await U1.call("market:me")).me.wallet.free, sellerBefore + 11, "vendedor recebe 12 - 1");
    const andre = await U2.call("market:me");
    assert.deepStrictEqual([andre.collection.length, andre.collection[0].id], [1, copyId], "a cópia foi para o André");
    const cibWallet = (await U1.call("market:me")).me.wallet;

    // admin gera senha temporária; a conta sai das conexões abertas
    assert.ok((await U2.call("admin:reset", { name: "Cibele" })).error, "só admin reseta");
    const reset = await U1.call("admin:reset", { name: "andré" });
    assert.ok(reset.ok && /^[a-z0-9]{5}-[a-z0-9]{5}$/.test(reset.temp), "senha temporária");
    await sleep(50);
    assert.ok(U2.out, "aviso de sessão encerrada");
    assert.ok((await U2.call("market:me")).error, "a conta resetada saiu");
    assert.ok((await U2.call("auth:login", { name: "André", password: reset.temp })).ok, "entra com a temporária");
    assert.ok((await U2.call("auth:password", { old: "errada", new: "novasenha1" })).error, "precisa da senha atual");
    assert.ok((await U2.call("auth:password", { old: reset.temp, new: "novasenha1" })).ok, "troca a senha");

    // sair revoga o token
    assert.ok((await T.call("auth:logout")).ok);
    assert.ok((await T.call("market:me")).error, "saiu da conta");
    assert.ok((await T.call("auth:resume", { session: r1.session })).error, "token revogado");
    console.log("ok contas do Mercado");

    // reinício: contas, senhas, sessões e saldos vêm do arquivo
    srv.kill(); await new Promise((r) => srv.once("exit", r));
    srv = startServer(); await srv.ready;
    const Z = new Client("z"); await Z.connect();
    assert.ok((await Z.call("auth:login", { name: "André", password: "novasenha1" })).ok, "senha nova sobreviveu");
    assert.strictEqual((await Z.call("market:me")).collection[0].id, copyId, "a cópia comprada de outro jogador sobreviveu ao reinício");
    const z = await Z.call("auth:resume", { session: L.session });
    assert.strictEqual(z.me.name, "Cibele", "sessão sobreviveu");
    assert.deepStrictEqual(z.me.wallet, cibWallet, "saldo sobreviveu");
    assert.ok(cibWallet.free === MC.signupBonus - paid - MC.listingFee + 11, "pagou a estreia e a taxa de anúncio, recebeu a venda");
    let au2 = await Z.call("market:auctions");
    for (let i = 0; i < 30 && au2.open.length < 3; i++) { await sleep(100); au2 = await Z.call("market:auctions"); }
    assert.ok(au2.open.every((a) => !au.open.some((b) => b.id === a.id)), "estreias novas a cada início");
    assert.ok((await Z.call("auth:resume", { session: r1.session })).error, "token revogado continua revogado");
    console.log("ok Mercado sobrevive ao reinício do servidor");
    console.log("Todos os testes online passaram.");
    cleanup(); process.exit(0);
  } catch (e) {
    console.error(e); cleanup(); process.exit(1);
  }
})();
