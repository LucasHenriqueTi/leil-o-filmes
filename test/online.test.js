// Teste online: sobe o servidor, conecta 3 jogadores + 1 espectador e joga uma partida inteira.
// Usa o WebSocket nativo do Node 22+.
const assert = require("assert");
const { spawn } = require("child_process");
const path = require("path");

const PORT = 3999;
const srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "inherit"] });
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
      };
    });
  }
  call(t, d) { return new Promise((res) => { const id = ++this.seq; this.waits[id] = res; this.ws.send(JSON.stringify({ t, id, d })); }); }
  get st() { return this.state && this.state.st; }
}

(async () => {
  try {
    await new Promise((r) => srv.stdout.on("data", (b) => /rodando/.test(String(b)) && r()));
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
    console.log("Todos os testes online passaram.");
    srv.kill(); process.exit(0);
  } catch (e) {
    console.error(e); srv.kill(); process.exit(1);
  }
})();
