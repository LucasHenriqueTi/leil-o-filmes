/* ============================================================
   Martelo Live — interface
   Telas: início → sala (regras, jogadores, lotes) → ao vivo → fim da transmissão
   Modos: online (servidor é a autoridade) e local (mesmo aparelho, motor no navegador)
   ============================================================ */
(function () {
"use strict";
const E = window.Engine, C = window.Catalog, N = window.Net, MK = window.Market, MC = window.MarketConfig;
const $app = document.getElementById("app");
const store = C.store;
const GROUP_TAG = E.GROUP_TAG;

/* ---------- utilidades ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR");
const mny = (n) => MC.currency + " " + Number(n || 0).toLocaleString("pt-BR");   // dinheiro do Mercado (separado do R$ da partida rápida)
const pts = (n) => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rid = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join(""); };
const hue = (str) => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const initial = (name) => esc((name || "?").trim()[0] || "?").toUpperCase();
let token = store.get("ml-token");
if (!token || !/^[a-zA-Z0-9_-]{16,64}$/.test(token)) { token = rid(32); store.set("ml-token", token); }

const urlCode = (() => {
  const m = location.pathname.match(/\/sala\/([A-Za-z0-9]{4})/);
  return (m ? m[1] : new URLSearchParams(location.search).get("sala") || "").toUpperCase().slice(0, 4);
})();

/* ---------- estado da interface ---------- */
const LOCAL_RULES = Object.assign({}, E.DEFAULTS, { turnSeconds: 0, sealedSeconds: 0, autoNextSeconds: 0 });
const S = {
  mode: null,                 // null | "online" | "local"
  name: store.get("ml-name") || "",
  joinCode: urlCode,
  code: null, you: null, host: null, viewers: 0, st: null, chat: [],
  local: store.get("ml-local") || null, history: [],
  rulesLocal: E.cleanSettings(store.get("ml-rules-local") || LOCAL_RULES),
  setup: Object.assign({ localPlayers: ["Cibele", "André", "Kirito", "Pinho"], lotMode: "random", genres: ["Ficção científica"], tier: "media", lots: 10, picked: [], custom: [], draw: [] }, store.get("ml-setup") || {}),
  ui: { err: "", showDraw: false, drawing: false, drawMsg: "", search: [], searchMsg: "", preparing: false, sealedOpen: null, synOpen: false, modal: null, toast: null, joining: false, donate: { v: 1, text: "" }, emojiOpen: false },
  sound: store.get("ml-sound") !== false,
  auth: store.get("ml-auth") || null, me: null, market: null,   // Mercado: token da conta, conta e carteira
  acct: { tab: "register", name: "", pass: "", busy: false, pwOld: "", pwNew: "" },
  mtab: store.get("ml-mtab") || "painel", showcase: null,   // Mercado: aba aberta e vitrine pública
  // Lista ou Pôsteres em cada lugar (ml-catview era a escolha antiga, só do catálogo)
  views: Object.assign({ catalog: store.get("ml-catview") || "list", collection: "list", recent: "list" }, store.get("ml-views") || {}),
  fold: Object.assign({ info: true, donate: true, rules: true }, store.get("ml-fold") || {}), // painéis escondidos (os três começam fechados)
  lastTop: null, zoom: {}
};
const saveSetup = () => store.set("ml-setup", S.setup);
const saveLocal = () => store.set("ml-local", S.local);
if (S.local && S.local.phase === "lobby") S.local = null;
if (S.local) S.mode = "local";

const cur = () => (S.mode === "online" ? S.st : S.local);
const isHost = () => S.mode === "local" || (!!S.you && S.you === S.host);
const now = () => (S.mode === "online" || S.mode === "market" ? N.now() : Date.now());
const pl = (id) => { const st = cur(); return st && st.players.find((p) => p.id === id); };
const nameOf = (id) => (pl(id) || {}).name || "Alguém";
const colorOf = (id) => (pl(id) || {}).color || "#a99cc4";
const rules = () => (S.mode === "online" ? (S.st ? S.st.settings : E.DEFAULTS) : S.local ? S.local.settings : S.rulesLocal);

function toast(text, bad) {
  S.ui.toast = { text, bad, id: Math.random() };
  const id = S.ui.toast.id;
  renderToast();
  setTimeout(() => { if (S.ui.toast && S.ui.toast.id === id) { S.ui.toast = null; renderToast(); } }, 3200);
}

/* ---------- pôster ---------- */
function poster(f, cls) {
  const img = C.posterOf(f), h = hue(f.title);
  return `<div class="poster ${cls || ""}" style="background:linear-gradient(160deg,hsl(${h} 50% 34%),hsl(${(h + 50) % 360} 55% 12%))"><div class="gen"><i>${esc(f.year)}</i><b>${esc(f.title)}</b></div>${img ? `<img src="${esc(img)}" alt="Pôster de ${esc(f.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</div>`;
}
function zoomable(f, extra) {
  const key = String(f.id) + (f.paid != null ? "-p" : "");
  S.zoom[key] = Object.assign({}, f, extra || {});
  return `<button type="button" class="zoom" data-zoom="${key}" aria-label="Ampliar pôster de ${esc(f.title)}">${poster(f)}</button>`;
}

/* ---------- painel que esconde: o título vira botão e o conteúdo só é montado aberto ---------- */
const foldBtn = (key, title) => `<button type="button" class="fold" data-fold="${key}" aria-expanded="${!S.fold[key]}"><span class="chev" aria-hidden="true"></span>${title}</button>`;
function panel(key, title, body, extra, cls) {
  const closed = !!S.fold[key];
  return `<section class="panel ${cls || ""} ${closed ? "folded" : ""}"><div class="panel-head">${foldBtn(key, `<h2>${title}</h2>`)}${extra || ""}</div>${closed ? "" : body}</section>`;
}

/* ---------- ícones ---------- */
const eye = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const FMT_ICON = { classic: "🔨", sealed: "✉️", dutch: "⏱️" };

/* ============================================================
   TOPO
   ============================================================ */
function topbar() {
  const st = cur();
  const live = st && st.phase === "playing";
  const online = S.mode === "online" || S.mode === "market";
  return `<header class="topbar"><div class="wrap">
    <button class="brand" data-act="home" aria-label="Martelo Live, voltar ao início"><span class="word">martelo</span><span class="onair ${live ? "" : "idle"}">${live ? "AO VIVO" : "live"}</span></button>
    <span class="spacer"></span>
    ${online && S.code ? `<span class="chip-code">Sala <b>${esc(S.code)}</b><button data-act="copy-link">Copiar convite</button></span>
      <span class="viewers num" title="Pessoas conectadas na sala">${eye}${S.viewers}</span>` : ""}
    ${S.mode === "local" ? `<span class="hint">Mesmo aparelho</span>` : ""}
    ${S.me ? `<button class="chip-acct num" ${S.mode === "market" ? `data-mtab="carteira"` : `data-act="market"`} title="${S.mode === "market" ? "Carteira" : "Abrir o Mercado"}"><span class="avatar sm">${initial(S.me.name)}</span><span class="nm">${esc(S.me.name)} · ${mny(S.me.wallet.free)}</span></button>` : ""}
    ${online ? `<span class="conn ${N.status}" title="${{ on: "Conectado", connecting: "Reconectando…", unavailable: "Servidor indisponível", off: "Desconectado" }[N.status]}"></span>` : ""}
  </div>${S.mode === "market" && S.me ? marketTabs(S.me) : ""}</header>`;
}

/* ============================================================
   INÍCIO
   ============================================================ */
/* ---------- vitrine do Mercado na tela inicial: o que está acontecendo, para convidar a entrar ---------- */
function marketShowcase() {
  const sc = S.showcase;
  if (!N.available || !sc) return "";
  const live = sc.open.concat(sc.featured), st = sc.stats;
  return `<section class="showcase">
    <div class="sc-head"><div><span class="onair">MERCADO AO VIVO</span><h2>Monte uma coleção que fica salva.</h2>
      <p class="lede">Estreias com cópias numeradas, coleções que valem pontos e um ranking da galera. ${S.me ? "Seus filmes e sua carteira esperam por você." : `Crie sua conta e ganhe <b>${mny(MC.signupBonus)}</b> para começar, mais ${mny(MC.allowance)} toda semana.`}</p></div>
      <div class="sc-cta"><button class="btn coin big" data-act="market-join">${S.me ? "Abrir o Mercado" : `Criar conta e ganhar ${mny(MC.signupBonus)}`}</button>${S.me ? "" : `<button class="btn quiet" data-act="market-login">Já tenho conta</button>`}</div></div>
    <div class="sc-stats"><span><b class="num">${st.accounts}</b> ${st.accounts === 1 ? "colecionador" : "colecionadores"}</span><span><b class="num">${st.films}</b> filmes no catálogo</span><span><b class="num">${st.copies}</b> ${st.copies === 1 ? "cópia" : "cópias"} com dono</span><span><b class="num">${live.length}</b> ${live.length === 1 ? "leilão aberto" : "leilões abertos"}</span></div>
    ${seasonBanner(sc.season)}
    <div class="mgrid">${liveNow(live, sc.next, "join")}${mpanel("", "🏆 Ranking", rankList(sc.ranking))}</div>
    ${sc.recent.length ? mpanel("", "Chegaram ao catálogo", filmStrip(sc.recent)) : ""}
  </section>`;
}
async function loadShowcase() {
  const r = await N.call("market:showcase");
  if (!r.error) { S.showcase = r; S.showcaseAt = Date.now(); if (screen() === "home" || (S.mode === "market" && !S.me)) render(); }
}
const DEMO_FILM = C.BASE.find((f) => f.id === "tt1375666") || C.BASE[0];
function renderHome() {
  const onlineOk = N.available && N.status !== "unavailable";
  return `<main class="wrap home">
    <section class="hero">
      <div>
        <h1>Leilão de filmes ao vivo com a galera.</h1>
        <p class="lede">Todo mundo começa com o mesmo dinheiro. Os filmes entram em lotes, os lances aparecem na hora para todos e, no fim, vence quem montou a melhor coleção.</p>
        <form class="entry" id="entryForm" autocomplete="off">
          <div class="field"><label for="nm">Seu nome</label><input class="input" id="nm" maxlength="18" placeholder="Como a galera te chama" value="${esc(S.name)}"></div>
          <button class="btn go big" type="button" data-act="create" ${onlineOk ? "" : "disabled"}>Criar sala online</button>
          <div class="divider">ou entre com o código da sala</div>
          <div class="row"><input class="input code-in" id="code" maxlength="4" placeholder="ABCD" value="${esc(S.joinCode)}" aria-label="Código da sala">
            <button class="btn" type="submit" ${onlineOk ? "" : "disabled"}>Entrar</button>
            <button class="btn ghost" type="button" data-act="watch" ${onlineOk ? "" : "disabled"}>Só assistir</button></div>
          ${S.ui.err ? `<p class="err">${esc(S.ui.err)}</p>` : ""}
          ${onlineOk ? "" : `<p class="hint">As salas online funcionam quando o site está publicado no servidor do Martelo Live. Aqui você pode jogar no mesmo aparelho.</p>`}
          <div class="divider">sem internet ou todos juntos na sala</div>
          <button class="btn ghost" type="button" data-act="local">Jogar no mesmo aparelho</button>
          ${N.available ? `<div class="divider">carteira e coleção que ficam salvas</div>
          <button class="btn coin" type="button" data-act="market" ${onlineOk ? "" : "disabled"}>${S.me ? `Abrir o Mercado (${esc(S.me.name)})` : "Mercado: entrar ou criar conta"}</button>` : ""}
        </form>
      </div>
      <div class="stage demo" aria-label="Prévia de um lote ao vivo">
        <div class="backdrop">${C.posterOf(DEMO_FILM) ? `<img src="${esc(C.posterOf(DEMO_FILM))}" alt="" referrerpolicy="no-referrer">` : ""}</div>
        <div class="hud top"><span class="onair">AO VIVO</span><span class="tag">Lote 3 de 10</span><span class="tag fmt-tag">🔨 Aberto</span></div>
        <div class="content">${poster(DEMO_FILM)}
          <div class="info"><h2 class="title">${esc(DEMO_FILM.title)}</h2><div class="orig">${esc(DEMO_FILM.orig)} (${DEMO_FILM.year})</div>
            <div class="chips"><span class="chip">${esc(DEMO_FILM.dir)}</span><span class="chip">Ficção científica</span></div>
            <p class="synopsis">Um ladrão que invade sonhos recebe a missão inversa: plantar uma ideia na mente de alguém. Quanto mais fundo a equipe desce, mais difícil fica saber o que é real.</p></div></div>
        <div class="scrub"><div class="track"><div class="fill demo-fill"></div></div></div>
      </div>
    </section>
    ${marketShowcase()}
    <section>
      <h2 class="section-title">Três jeitos de leiloar</h2>
      <div class="formats">
        ${Object.entries(E.FORMATS).map(([k, f]) => `<div class="fmt"><span class="ico">${FMT_ICON[k]}</span><b>${f.name}</b><p>${f.desc}</p></div>`).join("")}
        <div class="fmt"><span class="ico">🎲</span><b>Misto</b><p>Marque mais de um formato e cada lote sorteia o seu. Ninguém sabe o que vem.</p></div>
      </div>
    </section>
    <section>
      <h2 class="section-title">Regras extras</h2>
      <div class="formats">
        <div class="fmt extra"><span class="ico">📈</span><b>Mercado de gêneros</b><p>Os três gêneros mais comprados na partida dão bônus no fim: +3, +2 e +1 ponto por filme.</p></div>
        <div class="fmt extra"><span class="ico">🕵️</span><b>Missões secretas</b><p>Cada jogador recebe um objetivo escondido, como ter 2 filmes de terror. Cumpriu, ganha pontos.</p></div>
        <div class="fmt extra"><span class="ico">⭐</span><b>Dois jeitos de ganhar</b><p>As notas ficam escondidas durante a live. No fim, vence quem somar mais nota no IMDb, e a galera, assistindo ou jogando, vota na melhor coleção.</p></div>
      </div>
    </section>
  </main>`;
}

/* ============================================================
   SALA (lobby): jogadores, regras, lotes
   ============================================================ */
function seg(name, options, value, disabled) {
  return `<div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-rule="${name}" data-val="${v}" aria-pressed="${String(value) === String(v)}" ${disabled ? "disabled" : ""}>${l}</button>`).join("")}</div>`;
}
function switchBtn(attrs, on, title, desc, disabled) {
  return `<button type="button" class="switch" ${attrs} aria-pressed="${!!on}" ${disabled ? "disabled" : ""}><span class="knob"></span><span><b>${title}</b><span>${desc}</span></span></button>`;
}
function rulesPanel() {
  const r = rules(), host = isHost(), ro = !host;
  const fmts = Object.entries(E.FORMATS).map(([k, f]) => switchBtn(`data-fmt="${k}"`, r.formats.includes(k), `${FMT_ICON[k]} ${f.name}`, f.desc, ro)).join("");
  return panel("rules", "Regras", `
    <div class="grid-3">
      <div class="field"><label for="r-money">Dinheiro inicial</label><div class="money"><span>R$</span><input class="input num" id="r-money" type="number" min="1" max="9999" value="${r.money}" ${ro ? "disabled" : ""}></div></div>
      <div class="field"><label for="r-max">Filmes por jogador</label><input class="input num" id="r-max" type="number" min="1" max="50" value="${r.maxFilms}" ${ro ? "disabled" : ""}></div>
    </div>
    <div class="field"><span class="label">Formato do leilão</span><div class="fmt-pick">${fmts}</div>
      ${r.formats.length > 1 ? `<p class="hint">Cada lote sorteia um dos ${r.formats.length} formatos marcados.</p>` : ""}</div>
    <div class="field"><span class="label">Regras extras</span><div class="fmt-pick">
      ${switchBtn('data-flag="market"', r.market, "📈 Mercado de gêneros", "Os 3 gêneros mais comprados dão +3, +2 e +1 ponto por filme no fim.", ro)}
      ${switchBtn('data-flag="missions"', r.missions, "🕵️ Missões secretas", "Cada um recebe um objetivo escondido que vale pontos extras.", ro)}
    </div></div>
    <div class="field"><span class="label">Tempo por vez no Aberto</span>${seg("turnSeconds", [[0, "Sem limite"], [10, "10 s"], [20, "20 s"], [40, "40 s"]], r.turnSeconds, ro)}</div>
    <div class="field"><span class="label">Tempo do Lance secreto</span>${seg("sealedSeconds", [[0, "Sem limite"], [15, "15 s"], [25, "25 s"], [45, "45 s"]], r.sealedSeconds, ro)}</div>
    <div class="field"><span class="label">Velocidade do Relógio holandês</span>${seg("dutchStepMs", [[1400, "Lento"], [900, "Normal"], [500, "Rápido"]], r.dutchStepMs, ro)}</div>
    <div class="field"><span class="label">Próximo lote</span>${seg("autoNextSeconds", [[0, "Quando o host mandar"], [5, "Sozinho em 5 s"], [8, "Em 8 s"], [15, "Em 15 s"]], r.autoNextSeconds, ro)}</div>`,
    ro ? `<span class="hint">Definidas por ${esc(nameOf(S.host))}</span>` : "");
}
function playersPanel() {
  if (S.mode === "local") {
    const list = S.setup.localPlayers.map((n, i) => `<div class="prow"><span class="avatar sm" style="background:${E.COLORS[i % E.COLORS.length]}">${initial(n)}</span>
      <input class="input" id="lp-${i}" data-lp="${i}" value="${esc(n)}" maxlength="18" placeholder="Jogador ${i + 1}">
      <button class="x" data-rmlp="${i}" aria-label="Remover jogador" ${S.setup.localPlayers.length <= 2 ? "disabled" : ""}>×</button></div>`).join("");
    return mpanel("players", "Jogadores", `<div class="plist">${list}</div>
      <button class="btn ghost" data-act="addlp" ${S.setup.localPlayers.length >= E.MAX_PLAYERS ? "disabled" : ""}>Adicionar jogador</button>
      <p class="hint">Todos jogam neste aparelho, passando a vez. No Lance secreto, cada um digita escondido.</p>`, `<span class="hint num">${S.setup.localPlayers.length} de ${E.MAX_PLAYERS}</span>`);
  }
  const st = S.st, link = location.origin + "/sala/" + S.code;
  const rows = st.players.map((p) => `<div class="prow"><span class="avatar sm" style="background:${p.color}">${initial(p.name)}</span>
    <span class="nm">${esc(p.name)}${p.id === S.you ? " (você)" : ""}</span>
    ${p.donated ? `<span class="donated num" title="Doou na sala">${DON_TIERS[donTier(p.donated)][1]} ${brl(p.donated)}</span>` : ""}
    ${p.id === S.host ? `<span class="crown" title="Comanda a sala">♛</span>` : ""}
    <span class="conn ${p.connected ? "on" : ""}" title="${p.connected ? "Conectado" : "Desconectado"}"></span>
    ${isHost() && p.id !== S.you ? `<button class="x" data-kick="${p.id}" aria-label="Remover ${esc(p.name)}">×</button>` : ""}</div>`).join("");
  return panel("info", "Informações da sala", `<div class="invite"><span class="hint">Código da sala</span><span class="code">${esc(S.code)}</span>
      <span class="link">${esc(link)}</span>
      <div class="toolbar"><button class="btn" data-act="copy-link">Copiar link de convite</button><button class="btn ghost" data-act="copy-code">Copiar código</button></div></div>`,
    `<span class="hint">Código <b>${esc(S.code)}</b></span>`)
    + mpanel("players", "Na sala", `<div class="plist">${rows}</div>
    ${S.you ? "" : `<p class="hint">Você está assistindo. Lances ficam com quem entrou como jogador.</p>`}`, `<span class="hint num">${st.players.length} de ${E.MAX_PLAYERS}</span>`);
}
/* ---------- doação na sala (estilo donate de live) ---------- */
function donateMax() { const me = S.you && pl(S.you); return me ? E.donateLeft(S.st, me) : 0; }
const donValue = () => Math.max(1, Math.min(donateMax(), Math.floor(+S.ui.donate.v) || 1));
function donPreview(v) {
  const P = donParams(v), [, emo, title] = DON_TIERS[P.k], nx = DON_TIERS[P.k + 1];
  return `<span class="emo">${emo}</span><div><b>${esc(title)}</b><span class="hint num">${P.rain} itens caindo · ${Math.round(P.dur / 1000)} s na tela${P.shake ? " · tela tremendo" : ""}${nx ? ` · com mais ${brl(nx[0] - v)} vira ${nx[1]}` : ""}</span></div>`;
}
function donatePanel() {
  if (S.mode !== "online" || !S.you || !pl(S.you)) return "";
  const me = pl(S.you), max = donateMax(), v = donValue(), r = rules();
  const quick = [1, 2, 5, 10].map((d) => `<button type="button" data-dquick="${d}" ${d > max ? "disabled" : ""}>${brl(d)}</button>`).join("") + `<button type="button" data-dquick="${max}" ${max < 1 ? "disabled" : ""}>Tudo</button>`;
  return panel("donate", "Mandar um donate", `
    <p class="hint">Aparece na tela de todo mundo, com som. Cada real a mais deixa o alerta mais exagerado. O valor sai do seu dinheiro inicial.</p>
    <div class="bidrow"><div class="stepper"><button type="button" data-dstep="-1" aria-label="Diminuir">−</button>
      <input id="donv" type="number" inputmode="numeric" min="1" max="${max}" value="${v}" aria-label="Valor da doação" ${max < 1 ? "disabled" : ""}><button type="button" data-dstep="1" aria-label="Aumentar">+</button></div></div>
    <div class="quick">${quick}</div>
    <div class="don-preview" id="donPreview">${donPreview(v)}</div>
    <input class="input" id="donText" maxlength="80" placeholder="Mensagem do donate (opcional)" value="${esc(S.ui.donate.text)}" autocomplete="off">
    <div class="actions"><button class="btn" data-act="donate-test">Testar só para mim</button><button class="btn coin big" id="donBtn" data-act="donate" ${max < 1 ? "disabled" : ""}>Doar ${brl(v)}</button></div>
    <p class="hint num">${me.donated ? `Você já doou ${brl(me.donated)}. ` : ""}Você começa o leilão com ${brl(Math.max(1, r.money - (me.donated || 0)))}.</p>`,
    `<span class="hint num">Mínimo R$ 1</span>`, "donate-panel");
}
function syncDonate() {
  const v = donValue(), btn = document.getElementById("donBtn"), pv = document.getElementById("donPreview");
  if (btn) btn.textContent = "Doar " + brl(v);
  if (pv) pv.innerHTML = donPreview(v);
}
function lotsPanel() {
  const s = S.setup, u = S.ui;
  if (S.mode === "online" && !isHost()) {
    return panel("lots", "Lotes", `<div class="curtain"><div><b>Filmes escondidos</b><p>${esc(nameOf(S.host))} está montando os lotes. Cada filme só aparece quando o lote dele entrar no ar.</p></div></div>`);
  }
  const modeBtn = (k, t, d) => `<button type="button" class="mode" data-lotmode="${k}" aria-pressed="${s.lotMode === k}"><b>${t}</b><span>${d}</span></button>`;
  const catalog = [...C.BASE, ...s.custom];
  const picked = catalog.filter((f) => s.picked.includes(f.id));
  const n = s.lotMode === "pick" ? picked.length : s.draw.length;
  let body = "";
  if (s.lotMode === "genre") {
    body += `<div class="genres" role="group" aria-label="Categorias">${[...C.CATS.map((c) => c.name), GROUP_TAG].map((g) => `<button type="button" data-genre="${esc(g)}" aria-pressed="${s.genres.includes(g)}">${esc(g)}</button>`).join("")}</div>`;
  }
  if (s.lotMode !== "pick") {
    body += `<div class="field"><span class="label">Popularidade</span><div class="seg" role="group">${Object.entries(C.TIERS).map(([k, t]) => `<button type="button" data-tier="${k}" aria-pressed="${s.tier === k}" title="${esc(t.desc)}">${t.label}</button>`).join("")}</div></div>`;
    body += `<div class="grid-3"><div class="field"><label for="lots-n">Filmes no leilão</label><input class="input num" id="lots-n" type="number" min="1" max="200" value="${s.lots}"></div></div>`;
    const src = C.status.wikidata === "off" ? "do catálogo embutido" : "entre milhares de filmes";
    body += `<div class="toolbar"><p class="hint" aria-live="polite">${u.drawing ? "Sorteando filmes…" : s.lotMode === "genre" && !s.genres.length ? "Escolha pelo menos uma categoria." : `${n} filmes sorteados ${src}.`}</p><button class="btn" data-act="redraw" ${u.drawing ? "disabled" : ""}>🎲 Sortear de novo</button></div>`;
    if (u.drawMsg) body += `<p class="hint" style="color:var(--coin)">${esc(u.drawMsg)}</p>`;
    body += u.showDraw
      ? `<div class="toolbar"><p class="hint">Prévia visível para quem está olhando a tela.</p><button class="btn ghost" data-act="peek">Esconder prévia</button></div>
         <div class="pool">${s.draw.map((f) => `<div class="pool-item">${poster(f)}<span class="t">${esc(f.title)}</span>${C.ratingOf(f) ? `<span class="s">★ ${pts(C.ratingOf(f))}</span>` : ""}</div>`).join("")}</div>`
      : `<div class="curtain"><div><b class="num">${u.drawing ? "Sorteando…" : n + " filmes na mesa"}</b><p>Ficam escondidos até cada lote entrar no ar.</p></div><button class="btn" data-act="peek" ${u.drawing || !n ? "disabled" : ""}>Ver filmes sorteados</button></div>`;
  } else {
    body += `<div class="toolbar"><p class="hint">Toque nos pôsteres para montar os lotes. ${n} escolhidos.</p><button class="btn ghost" data-act="pickclear" ${n ? "" : "disabled"}>Limpar</button></div>`;
    body += `<div class="pool">${catalog.map((f) => { const on = s.picked.includes(f.id); return `<button type="button" class="pool-item pick" data-pick="${esc(f.id)}" aria-pressed="${on}">${poster(f)}${on ? `<span class="check">✓</span>` : ""}<span class="t">${esc(f.title)}</span></button>`; }).join("")}</div>`;
    body += `<form class="search" id="searchForm"><input class="input" id="q" placeholder="Buscar outro filme no IMDb" autocomplete="off"><button class="btn" type="submit">Buscar</button></form>`;
    if (u.searchMsg) body += `<p class="hint">${esc(u.searchMsg)}</p>`;
    if (u.search.length) body += `<div class="results">${u.search.map((f, i) => { const inCat = catalog.some((x) => x.id === f.id); return `<div class="result"><div class="ph">${poster(f)}</div><div class="meta"><b>${esc(f.title)}</b><span>${esc(f.year)}${f.r ? ` · ★ ${pts(f.r)}` : ""}</span></div><button class="btn" data-add="${i}" ${inCat ? "disabled" : ""}>${inCat ? "Adicionado" : "Adicionar"}</button></div>`; }).join("")}</div>`;
  }
  return panel("lots", "Lotes", `
    <div class="modes">${modeBtn("random", "Aleatório", "Sorteia de milhares")}${modeBtn("genre", "Por categoria", "Sorteia dos gêneros escolhidos")}${modeBtn("pick", "Escolher", "Você marca cada filme")}</div>
    ${body}`, `<span class="hint num">${n} ${n === 1 ? "filme" : "filmes"}</span>`);
}
function lotsForStart() {
  const s = S.setup;
  if (s.lotMode === "pick") return C.sample([...C.BASE, ...s.custom].filter((f) => s.picked.includes(f.id)), 999);
  return s.draw;
}
function renderRoom() {
  const host = isHost(), r = rules();
  const n = lotsForStart().length;
  let bar;
  if (host) {
    bar = `<p class="hint num">${S.mode === "local" ? S.setup.localPlayers.length : S.st.players.length} jogadores · ${brl(r.money)} cada · ${n} lotes · até ${r.maxFilms} filmes por pessoa</p>
      <div class="toolbar">${S.ui.err ? `<p class="err">${esc(S.ui.err)}</p>` : ""}<button class="btn quiet" data-act="leave">Sair</button>
      <button class="btn go big" data-act="start" ${S.ui.preparing || S.ui.drawing || !n ? "disabled" : ""}>${S.ui.preparing ? "Preparando os lotes…" : "Começar o leilão"}</button></div>`;
  } else {
    bar = `<p class="hint">${S.you ? `Aguardando ${esc(nameOf(S.host))} começar o leilão.` : "Você entrou como espectador."}</p><button class="btn quiet" data-act="leave">Sair da sala</button>`;
  }
  return `<main class="wrap room ${S.mode === "local" ? "solo" : ""}">
    <div class="col">${playersPanel()}${donatePanel()}</div>
    <div class="col">${lotsPanel()}${rulesPanel()}</div>
    ${S.mode === "online" ? sidePanel() : ""}
  </main>
  <div class="startbar"><div class="wrap">${bar}</div></div>`;
}

/* ============================================================
   AO VIVO
   ============================================================ */
function scrub(from, until, calm) {
  if (!until) return `<div class="scrub"><div class="track"></div></div>`;
  return `<div class="scrub"><div class="track"><div class="fill ${calm ? "calm" : ""}" data-from="${from}" data-until="${until}"></div></div><span class="secs num" data-until="${until}"></span></div>`;
}
function stagePanel(st) {
  const f = st.lots[st.idx], lot = st.lot, fm = E.FORMATS[lot.format];
  const img = C.posterOf(f);
  const syn = C.synopsisOf(f);
  const dots = st.lots.length <= 30 ? `<span class="lot-dots" aria-hidden="true">${st.lots.map((_, i) => `<i class="${i < st.idx ? "done" : i === st.idx ? "now" : ""}"></i>`).join("")}</span>` : "";
  const genres = (f.g || []).filter((g) => g !== GROUP_TAG).slice(0, 3);
  let synHtml = "";
  if (syn && syn.text) synHtml = `<p class="synopsis ${S.ui.synOpen ? "open" : ""}">${esc(syn.text)}</p><div class="syn-foot"><span>Sinopse: ${esc(syn.src)}</span>${syn.text.length > 280 ? `<button data-act="syn">${S.ui.synOpen ? "Mostrar menos" : "Ler tudo"}</button>` : ""}</div>`;
  else if (!syn || syn.loading) synHtml = `<p class="synopsis" style="color:var(--mute)">Carregando sinopse…</p>`;
  const from = lot.stage === "done" ? (lot.deadline ? lot.deadline - rules().autoNextSeconds * 1000 : 0) : lot.format === "classic" ? (lot.deadline ? lot.deadline - rules().turnSeconds * 1000 : 0) : (lot.deadline ? lot.deadline - rules().sealedSeconds * 1000 : 0);
  return `<section class="stage" style="--bd:linear-gradient(135deg,hsl(${hue(f.title)} 45% 22%),#0d0815)">
    <div class="backdrop">${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : ""}</div>
    <div class="hud top"><span class="onair">AO VIVO</span><span class="tag num">Lote ${st.idx + 1} de ${st.lots.length}</span>${dots}<span class="tag fmt-tag">${FMT_ICON[lot.format]} ${fm.name}</span></div>
    <div class="content">${zoomable(f)}
      <div class="info"><h2 class="title">${esc(f.title)}</h2>${f.orig && f.orig !== f.title ? `<div class="orig">${esc(f.orig)}</div>` : ""}
        <div class="chips">${f.year ? `<span class="chip">${esc(f.year)}</span>` : ""}${f.dir ? `<span class="chip">${esc(f.dir)}</span>` : ""}${genres.map((g) => `<span class="chip">${esc(g)}</span>`).join("")}${f.by ? `<span class="chip">Indicado por ${esc(f.by)}</span>` : ""}</div>
        ${synHtml}
        <a class="hint" href="https://www.imdb.com/title/${esc(f.id)}/" target="_blank" rel="noopener">Ver no IMDb</a>
      </div></div>
    ${lot.format === "dutch" && lot.stage === "bid" ? `<div class="scrub"><div class="track"><div class="fill" style="width:${Math.round((lot.price / Math.max(1, lot.startPrice)) * 100)}%"></div></div></div>` : scrub(from, lot.deadline, lot.stage === "done")}
  </section>`;
}
function canControl(pid) { return S.mode === "local" || pid === S.you; }
function bidControls(st, pid) {
  const lot = st.lot, p = pl(pid), min = lot.high + 1, max = p.money;
  const draft = S.ui.bidDraft && S.ui.bidDraft.lot === st.idx && S.ui.bidDraft.v >= min && S.ui.bidDraft.v <= max ? S.ui.bidDraft.v : min;
  const quick = [1, 2, 5].map((d) => `<button type="button" data-quick="${lot.high + d}" ${lot.high + d > max ? "disabled" : ""}>+${d}</button>`).join("") + `<button type="button" data-quick="${max}">Tudo</button>`;
  return `<div class="bidrow"><div class="stepper"><button type="button" data-step="-1" aria-label="Diminuir">−</button>
      <input id="bidv" type="number" inputmode="numeric" min="${min}" max="${max}" value="${draft}" aria-label="Valor do lance"><button type="button" data-step="1" aria-label="Aumentar">+</button></div></div>
    <div class="quick">${quick}</div>
    <div class="actions"><button class="btn" data-act="pass">Passar</button><button class="btn coin big" data-act="bid">Dar lance</button></div>
    <p class="hint num">De ${brl(min)} até ${brl(max)}, o saldo de ${esc(p.name)}.</p>`;
}
function sealedInput(pid, label) {
  const p = pl(pid);
  return `<div class="bidrow"><div class="stepper"><button type="button" data-step="-1" aria-label="Diminuir">−</button>
      <input id="bidv" type="number" inputmode="numeric" min="0" max="${p.money}" value="${Math.min(p.money, 1)}" aria-label="Valor do lance secreto"><button type="button" data-step="1" aria-label="Aumentar">+</button></div></div>
    <div class="actions"><button class="btn" data-sealed0="${pid}">Não quero</button><button class="btn coin big" data-sealed="${pid}">${label}</button></div>
    <p class="hint num">Até ${brl(p.money)}. Ninguém vê o valor até a revelação. Empate fica com quem enviou primeiro.</p>`;
}
function deckPanel(st) {
  const lot = st.lot, r = rules();
  let read = "", ctl = "", mine = false;
  if (lot.stage === "done") {
    const res = lot.result;
    read = res.by
      ? `<div class="readout"><span class="label">Vendido para ${esc(nameOf(res.by))}</span><span class="val num">${brl(res.price)}</span><span class="by">${res.tie ? "Empate desfeito por quem enviou primeiro." : lot.format === "dutch" ? "Apertou primeiro no relógio." : ""}</span></div>`
      : `<div class="readout"><span class="label">Resultado</span><span class="val zero">Sem lances</span><span class="by">O filme volta para a prateleira.</span></div>`;
    if (res.reveal && res.reveal.length) {
      ctl += `<div class="reveal"><span class="label">Lances revelados</span>${res.reveal.map((b, i) => `<div class="row ${i === 0 ? "win" : ""}"><span class="avatar sm" style="background:${colorOf(b.p)}">${initial(nameOf(b.p))}</span><span>${esc(nameOf(b.p))}</span><b class="num">${brl(b.v)}</b></div>`).join("")}</div>`;
    }
    const last = st.idx >= st.lots.length - 1;
    if (isHost()) ctl += `<div class="toolbar"><button class="btn go big" data-act="next">${last ? "Ver o resultado final" : "Próximo lote"}</button>${lot.deadline ? `<span class="hint">ou sozinho em <span class="num" data-until="${lot.deadline}"></span></span>` : ""}</div>`;
    else ctl += `<p class="hint">${lot.deadline ? `Próximo lote em <span class="num" data-until="${lot.deadline}"></span>` : `Aguardando ${esc(nameOf(S.host))} chamar o próximo lote.`}</p>`;
  } else if (lot.format === "classic") {
    const turn = pl(lot.turn);
    read = `<div class="readout"><span class="label">Maior lance</span><span class="val num ${lot.high ? "" : "zero"}">${brl(lot.high)}</span><span class="by">${lot.highBy ? `de <b>${esc(nameOf(lot.highBy))}</b>` : "Ninguém deu lance ainda"}</span></div>`;
    mine = canControl(lot.turn) && S.mode === "online";
    ctl = `<div class="turnline"><span class="avatar" style="background:${turn.color}">${initial(turn.name)}</span>${S.mode === "online" && lot.turn === S.you ? `<span class="you">Sua vez</span>` : `<span>Vez de <span class="who">${esc(turn.name)}</span></span>`}${lot.deadline ? `<span class="hint num" style="margin-left:auto"><span data-until="${lot.deadline}"></span></span>` : ""}</div>`;
    ctl += canControl(lot.turn) ? bidControls(st, lot.turn) : `<p class="hint">${S.you ? (lot.eligible.includes(S.you) ? "Aguarde a sua vez." : "Você está aguardando o fim do leilão.") : "Você está assistindo."}</p>`;
  } else if (lot.format === "sealed") {
    const subm = lot.submitted || Object.keys(lot.bids || {});
    read = `<div class="readout"><span class="label">Lance secreto</span><span class="val">?</span><span class="by num">${subm.length} de ${lot.eligible.length} já enviaram</span></div>`;
    const chips = `<div class="submitted">${lot.eligible.map((id) => `<span class="${subm.includes(id) ? "ok" : ""}">${subm.includes(id) ? "✓" : "…"} ${esc(nameOf(id))}</span>`).join("")}</div>`;
    if (S.mode === "local") {
      const pending = lot.eligible.filter((id) => !lot.bids[id]);
      const who = pending[0];
      if (who && S.ui.sealedOpen === who) ctl = `<div class="turnline"><span class="avatar" style="background:${colorOf(who)}">${initial(nameOf(who))}</span><span>Lance de <span class="who">${esc(nameOf(who))}</span></span></div>${sealedInput(who, "Enviar escondido")}`;
      else if (who) ctl = `<div class="privacy"><b>Passe o aparelho para ${esc(nameOf(who))}.</b><span class="hint">Os outros não olham. O valor some da tela depois de enviado.</span><button class="btn mint" data-open-sealed="${who}">Sou ${esc(nameOf(who))}, mostrar meu campo</button></div>`;
      ctl += chips;
    } else if (S.you && lot.eligible.includes(S.you)) {
      mine = lot.myBid == null;
      ctl = lot.myBid == null ? sealedInput(S.you, "Enviar lance secreto")
        : `<p><b>${lot.myBid ? `Seu lance: ${brl(lot.myBid)}` : "Você não quis este lote"}</b><br><span class="hint">Pode trocar até a revelação.</span></p>${sealedInput(S.you, "Trocar lance")}`;
      ctl += chips;
    } else ctl = `<p class="hint">${S.you ? "Você está aguardando o fim do leilão." : "Você está assistindo."}</p>${chips}`;
  } else {
    const secs = (r.dutchStepMs / 1000).toLocaleString("pt-BR");
    read = `<div class="readout"><span class="label">Preço agora</span><span class="val num">${brl(lot.price)}</span><span class="falling">▼ cai R$ 1 a cada ${secs} s</span><span class="by num">Começou em ${brl(lot.startPrice)}</span></div>`;
    if (S.mode === "local") {
      ctl = `<p class="hint">Quem apertar primeiro compra pelo preço da tela.</p><div class="dutch-btns">${lot.eligible.map((id) => { const p = pl(id); return `<button class="btn ${p.money >= lot.price ? "coin" : ""}" data-buy="${id}" ${p.money >= lot.price ? "" : "disabled"}><span>${esc(p.name)}</span><small class="num">${p.money >= lot.price ? "Comprar" : "Saldo " + brl(p.money)}</small></button>`; }).join("")}</div>`;
    } else if (S.you && lot.eligible.includes(S.you)) {
      const me = pl(S.you), ok = me.money >= lot.price;
      mine = ok;
      ctl = `<button class="btn ${ok ? "coin" : ""} big" data-buy="${S.you}" ${ok ? "" : "disabled"} style="width:100%">${ok ? `Comprar por ${brl(lot.price)}` : `Seu saldo é ${brl(me.money)}. Espere o preço cair.`}</button><p class="hint">Quem apertar primeiro leva. Se ninguém comprar até R$ 1, o filme fica sem dono.</p>`;
    } else ctl = `<p class="hint">${S.you ? "Você está aguardando o fim do leilão." : "Você está assistindo."}</p>`;
  }
  const undo = S.mode === "local" && S.history.length ? `<button class="btn quiet" data-act="undo">Desfazer</button>` : "";
  return `<section class="deck ${mine ? "mine" : ""}">${read}<div class="controls">${ctl}${undo ? `<div class="toolbar">${undo}</div>` : ""}</div></section>`;
}
function statusPill(st, p) {
  const lot = st.lot;
  if (lot && lot.stage === "bid") {
    if (lot.format === "classic") {
      if (lot.highBy === p.id) return `<span class="pill top">Maior lance</span>`;
      if (lot.inLot.includes(p.id)) return `<span class="pill in">Na disputa</span>`;
      if (lot.passed.includes(p.id)) return `<span class="pill out">Passou</span>`;
    } else if (lot.format === "sealed" && lot.eligible.includes(p.id)) {
      const subm = lot.submitted || Object.keys(lot.bids || {});
      return subm.includes(p.id) ? `<span class="pill sent">Enviou</span>` : `<span class="pill in">Pensando</span>`;
    } else if (lot.format === "dutch" && lot.eligible.includes(p.id)) {
      return p.money >= lot.price ? `<span class="pill in">Pode comprar</span>` : `<span class="pill out">Esperando cair</span>`;
    }
  }
  if (p.films.length >= st.settings.maxFilms) return `<span class="pill wait">Limite cheio</span>`;
  if (p.money < 1) return `<span class="pill wait">Sem saldo</span>`;
  return `<span class="pill out">Fora do lote</span>`;
}
function crewPanel(st) {
  return `<section class="crew">${st.players.map((p) => {
    const turn = st.lot && st.lot.stage === "bid" && st.lot.format === "classic" && st.lot.turn === p.id;
    return `<div class="pc ${turn ? "turn" : ""} ${p.connected === false && S.mode === "online" ? "off" : ""}" style="--pc:${p.color}">
      <div class="top"><span class="avatar sm" style="background:${p.color}">${initial(p.name)}</span><span class="name">${esc(p.name)}${p.id === S.you ? "<small>você</small>" : ""}${p.id === S.host && S.mode === "online" ? `<span class="crown">♛</span>` : ""}</span><span class="cash num">${brl(p.money)}</span></div>
      <div class="row2"><span class="slots" aria-label="${p.films.length} de ${st.settings.maxFilms} filmes">${Array.from({ length: Math.min(st.settings.maxFilms, 20) }, (_, k) => `<i class="${k < p.films.length ? "full" : ""}"></i>`).join("")}</span>${statusPill(st, p)}</div>
      ${p.films.length ? `<div class="owned">${p.films.map((f) => zoomable(f)).join("")}</div>` : ""}
      ${S.mode === "local" && st.settings.missions ? `<button class="btn quiet" data-peek-mission="${p.id}" style="align-self:flex-start;padding:4px 0">Ver missão secreta</button>` : ""}
    </div>`;
  }).join("")}</section>`;
}
function extrasPanel(st) {
  const r = st.settings;
  if (!r.market && !r.missions) return "";
  let market = "", mission = "";
  if (r.market) {
    const rows = E.market(st);
    market = panel("market", "Bolsa de gêneros",
      rows.length ? `<div class="ticker">${rows.map((m, i) => `<div class="tick ${m.bonus ? "hot" : ""}"><b>${esc(m.genre)}</b><span class="num">${m.count} ${m.count === 1 ? "filme" : "filmes"}</span>${m.bonus ? `<em>+${m.bonus} por filme</em>` : ""}</div>`).join("")}</div>` : `<p class="hint">Nenhum filme vendido ainda. O gênero principal de cada compra entra na bolsa.</p>`,
      `<span class="hint">Top 3 vale +3, +2 e +1 por filme</span>`);
  }
  if (r.missions) {
    const me = S.you && pl(S.you);
    if (S.mode === "online" && me) {
      mission = panel("mission", "Sua missão secreta", me.missions.map((m) => `<div class="mission"><span class="seal">🕵️</span><div><p>${esc(m.text)}</p><span class="pts">+${m.pts} pontos se cumprir</span></div></div>`).join(""));
    } else if (S.mode === "local") {
      mission = panel("mission", "Missões secretas", `<p class="hint">Cada jogador tem uma. Use "Ver missão secreta" no seu cartão, com os outros sem olhar.</p>`);
    } else mission = panel("mission", "Missões secretas", `<p class="hint">Reveladas no fim da transmissão.</p>`);
  }
  return `<div class="extras">${market || ""}${mission || ""}</div>`;
}

/* ---------- chat ao vivo ---------- */
function logText(e) {
  const n = (id) => `<b>${esc(nameOf(id))}</b>`;
  switch (e.k) {
    case "lot": return ["lot", `Lote ${e.n} no ar: ${esc(e.title)} (${E.FORMATS[e.format].name})`];
    case "bid": return ["bid", `${n(e.p)} deu um lance de ${brl(e.v)}`];
    case "pass": return ["", `${n(e.p)} passou`];
    case "timeout": return ["", `${n(e.p)} não respondeu a tempo e passou`];
    case "broke": return ["", `${n(e.p)} não tem saldo para cobrir ${brl(e.v)}`];
    case "sealed": return ["bid", `${n(e.p)} enviou um lance secreto`];
    case "sealedPass": return ["", `${n(e.p)} não quis este lote`];
    case "reveal": return ["", e.bids.length ? `Lances revelados: ${e.bids.map((b) => `${esc(nameOf(b.p))} ${brl(b.v)}`).join(", ")}` : "Ninguém deu lance secreto"];
    case "sold": return ["sold", `Vendido! ${esc(e.title)} para ${n(e.p)} por ${brl(e.v)}`];
    case "unsold": return ["", `${esc(e.title)} ficou sem lances`];
    case "nobody": return ["", "Ninguém mais pode comprar. Fim do leilão."];
    case "end": return ["lot", "Fim da transmissão"];
  }
  return ["", ""];
}
function sidePanel() {
  const st = cur();
  const items = [];
  if (st) st.log.slice(0, 120).forEach((e) => { const [cls, html] = logText(e); if (html) items.push({ at: e.at || 0, html: `<div class="sys ${cls}"><span>${html}</span></div>` }); });
  if (S.mode === "online") S.chat.forEach((m) => items.push({ at: m.at, html: m.donate ? `<div class="msg donate"><span class="amt num">${DON_TIERS[donTier(m.donate)][1]} ${brl(m.donate)}</span><span class="n" style="color:${colorOf(m.from)}">${esc(m.name)}</span>${m.text ? esc(m.text) : "mandou um donate"}</div>`
    : m.from === null && !m.watcher ? `<div class="sys"><span>${esc(m.text)}</span></div>` : `<div class="msg ${m.watcher ? "watcher" : ""} ${onlyEmoji(m.text) ? "big" : ""}"><span class="n" style="color:${m.from ? colorOf(m.from) : "var(--mute)"}">${esc(m.name)}</span>${esc(m.text)}</div>` }));
  items.sort((a, b) => a.at - b.at);
  const reacts = ["🔥", "😱", "😂", "💸", "🍿", "👏", "🤡", "💀"].map((e) => `<button type="button" data-react="${e}" aria-label="Reagir com ${e}">${e}</button>`).join("");
  if (S.fold.chat) return `<aside class="side folded" aria-label="Chat ao vivo"><div class="head">${foldBtn("chat", "<b>Chat ao vivo</b>")}</div></aside>`;
  return `<aside class="side" aria-label="Chat ao vivo">
    <div class="head">${foldBtn("chat", "<b>Chat ao vivo</b>")}${S.mode === "online" ? `<span class="viewers num">${eye}${S.viewers}</span><button type="button" class="snd" data-act="sound" aria-pressed="${S.sound}" title="${S.sound ? "Som ligado" : "Som desligado"}">${S.sound ? "🔊" : "🔇"}</button>` : ""}</div>
    <div class="feed" id="feed">${items.map((i) => i.html).join("") || `<p class="hint">${S.mode === "online" ? "Mande um oi para a galera." : "Os lances aparecem aqui."}</p>`}</div>
    <div class="reacts">${reacts}</div>
    ${S.mode === "online" && S.ui.emojiOpen ? `<div class="emoji-pick" role="group" aria-label="Emojis">${EMOJIS.map((e) => `<button type="button" data-emoji="${e}" aria-label="Inserir ${e}">${e}</button>`).join("")}</div>` : ""}
    ${S.mode === "online" ? `<form class="compose" id="chatForm" autocomplete="off"><button type="button" class="emoji-btn" data-act="emoji" aria-expanded="${S.ui.emojiOpen}" aria-label="Escolher emoji">😀</button><input class="input" id="chatText" maxlength="140" placeholder="Escreva no chat"><button class="btn" type="submit">Enviar</button></form>` : `<div style="height:12px"></div>`}
  </aside>`;
}
function renderLive() {
  const st = cur();
  return `<main class="wrap live"><div class="main">${stagePanel(st)}${deckPanel(st)}${extrasPanel(st)}${crewPanel(st)}</div>${sidePanel()}</main>`;
}

/* ============================================================
   FIM DA TRANSMISSÃO
   ============================================================ */
// voto da galera: online o servidor só manda o meu voto e, depois de fechar, a contagem sem nomes
function voteBox(st, p, tally, fav) {
  const n = tally[p.id] || 0;
  if (st.voting !== "open") return `<div class="vote-line ${fav ? "fav" : ""}"><span>🗳️ Voto da galera</span><b class="num">${n} ${n === 1 ? "voto" : "votos"}</b></div>`;
  if (S.mode === "local") return "";
  if (p.id === S.you) return `<div class="vote-line"><span class="hint">Sua coleção. Não vale votar nela.</span></div>`;
  const mine = st.myVote === p.id;
  return `<button class="btn ${mine ? "mint" : ""}" data-vote="${p.id}" aria-pressed="${mine}">${mine ? "✓ Seu voto" : "Votar nesta coleção"}</button>`;
}
function localVotePanel(st) {
  if (S.mode !== "local" || st.voting !== "open") return "";
  const rows = st.players.map((v) => `<div class="voter"><span class="avatar sm" style="background:${v.color}">${initial(v.name)}</span><span class="nm">${esc(v.name)}</span>
    <div class="seg" role="group" aria-label="Voto de ${esc(v.name)}">${st.players.filter((p) => p.id !== v.id).map((p) => `<button type="button" data-vote="${p.id}" data-voter="${v.id}" aria-pressed="${st.votes[v.id] === p.id}">${esc(p.name)}</button>`).join("")}</div></div>`).join("");
  return panel("vote", "Votação da melhor coleção", `<div class="voters">${rows}</div>`, `<span class="hint">Ninguém vota em si mesmo</span>`);
}
function renderFinal() {
  const st = cur(), sc = E.scores(st), r = st.settings;
  const top = sc[0], winner = pl(top.id);
  const mk = r.market ? E.market(st) : [];
  const open = st.voting === "open", tally = E.voteTally(st);
  const total = S.mode === "online" ? st.voteTotal || 0 : Object.keys(st.votes || {}).length;
  const vw = open ? null : E.voteWinner(st), fan = vw && pl(vw.id);
  let crowd;
  if (open) crowd = `<section class="champion crowd"><span class="avatar">🗳️</span><div><span class="label">Voto da galera</span><h1>Votação aberta</h1>
      <p class="num">Quem joga e quem assiste escolhe a melhor coleção. ${total} ${total === 1 ? "voto" : "votos"} até agora.${S.mode === "online" && !st.myVote ? " Vote nos cartões abaixo." : ""}</p>
      ${isHost() ? `<div class="toolbar"><button class="btn mint" data-act="close-vote">Encerrar votação</button></div>` : ""}</div></section>`;
  else if (fan) crowd = `<section class="champion crowd"><span class="avatar" style="background:${fan.color}">${initial(fan.name)}</span><div><span class="label">Voto da galera</span><h1>${esc(fan.name)} montou a melhor coleção</h1>
      <p class="num">${vw.votes} de ${total} ${total === 1 ? "voto" : "votos"}. Empate fica com quem somou mais nota.</p></div></section>`;
  else crowd = `<section class="champion crowd"><span class="avatar">🗳️</span><div><span class="label">Voto da galera</span><h1>Ninguém votou</h1><p>A votação foi encerrada sem votos.</p></div></section>`;
  const cards = sc.map((row, i) => {
    const p = pl(row.id);
    const cols = [["Notas", pts(row.ratings)]];
    if (r.market) cols.push(["Mercado", "+" + row.market]);
    if (r.missions) cols.push(["Missões", "+" + row.missionPts]);
    cols.push(["Total", pts(row.total)]);
    return `<article class="stand ${fan && fan.id === p.id ? "fav" : ""}" style="--pc:${p.color}">
      <div class="head"><span class="rank num">${i + 1}º</span><span class="avatar" style="background:${p.color}">${initial(p.name)}</span><h3>${esc(p.name)}</h3><span class="hint num">sobrou ${brl(p.money)}</span></div>
      <div class="breakdown" style="grid-template-columns:repeat(${cols.length},minmax(0,1fr))">${cols.map(([l, v], k) => `<div class="${k === cols.length - 1 ? "total" : ""}"><span>${l}</span><b class="num">${v}</b></div>`).join("")}</div>
      ${p.films.length ? `<div class="coll">${p.films.map((f) => { const ri = f.r != null ? { v: f.r, src: f.rsrc || "IMDb" } : null; return `<div class="item"><div style="width:40px">${zoomable(f)}</div><div class="t">${esc(f.title)}<small>${ri ? `★ ${pts(ri.v)} ${esc(ri.src)}` : "sem nota"}${f.year ? ` · ${esc(f.year)}` : ""}</small></div><span class="paid num">${brl(f.paid)}</span></div>`; }).join("")}</div>` : `<p class="empty">Não arrematou nenhum filme.</p>`}
      ${r.missions ? `<div class="mis-list">${row.missions.map((m) => `<div><span class="${m.ok ? "ok" : "no"}">${m.ok ? "✓" : "✗"}</span><span>${esc(m.text)} ${m.ok ? `(+${m.pts})` : ""}</span></div>`).join("")}</div>` : ""}
      ${voteBox(st, p, tally, fan && fan.id === p.id)}
    </article>`;
  }).join("");
  const unsold = st.results.filter((x) => !x.by);
  const actions = isHost()
    ? `<button class="btn go big" data-act="again">Nova rodada com a mesma galera</button><button class="btn quiet" data-act="leave">Sair</button>`
    : `<p class="hint">Aguardando ${esc(nameOf(S.host))} abrir outra rodada.</p><button class="btn quiet" data-act="leave">Sair</button>`;
  const main = `<div class="main final">
    <div class="champs">
      <section class="champion"><span class="avatar" style="background:${winner.color}">${initial(winner.name)}</span>
        <div><span class="label">Soma das notas</span><h1>${esc(winner.name)} venceu nas notas</h1><p class="num">${pts(top.total)} pontos com ${winner.films.length} ${winner.films.length === 1 ? "filme" : "filmes"}. Empate vai para quem guardou mais dinheiro.</p></div></section>
      ${crowd}
    </div>
    ${localVotePanel(st)}
    <div class="standings">${cards}</div>
    ${r.market && mk.length ? panel("market", "Bolsa de gêneros no fechamento", `<div class="ticker">${mk.map((m) => `<div class="tick ${m.bonus ? "hot" : ""}"><b>${esc(m.genre)}</b><span class="num">${m.count} ${m.count === 1 ? "filme" : "filmes"}</span>${m.bonus ? `<em>+${m.bonus} por filme</em>` : ""}</div>`).join("")}</div>`) : ""}
    ${unsold.length ? panel("unsold", "Ficaram sem dono", `<div class="chips" style="display:flex;flex-wrap:wrap;gap:6px">${unsold.map((x) => `<span class="chip">${esc(x.title)}</span>`).join("")}</div>`, `<span class="hint num">${unsold.length}</span>`) : ""}
    <div class="toolbar">${actions}</div>
  </div>`;
  return `<main class="wrap live">${main}${sidePanel()}</main>`;
}

/* ============================================================
   MERCADO: conta, carteira e coleção que ficam salvas
   ============================================================ */
const fmtWhen = (t) => new Date(t).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
/* ---------- Mercado: abas no topo e uma tela por assunto ---------- */
const MTABS = [["painel", "Painel", "🏠"], ["estreias", "Estreias", "🎟️"], ["leiloes", "Leilões", "🔨"], ["colecao", "Coleção", "🎞️"],
  ["catalogo", "Catálogo", "📚"], ["ranking", "Ranking", "🏆"], ["carteira", "Carteira", "👛"], ["admin", "Admin", "🛠️"]];
function marketTabs(me) {
  const A = S.auctions || {}, m = S.market || {};
  const badge = { estreias: (A.open || []).length, leiloes: (A.players || []).length, colecao: (m.collection || []).length };
  return `<nav class="mtabs" aria-label="Mercado"><div class="wrap">${MTABS.filter(([k]) => k !== "admin" || me.admin).map(([k, l, i]) =>
    `<button type="button" class="mtab" data-mtab="${k}" aria-current="${S.mtab === k ? "page" : "false"}"><span aria-hidden="true">${i}</span>${l}${badge[k] ? `<span class="badge num">${badge[k]}</span>` : ""}</button>`).join("")}</div></nav>`;
}
// painel sem botão de esconder: dentro das abas cada tela já tem um assunto só
// explicação num balão (mouse em cima, foco pelo teclado ou toque), em vez de um parágrafo na tela
const tipAttr = (html) => `data-tip="${esc(html)}"`;
const tip = (html, wide) => `<button type="button" class="tip" ${tipAttr(html)}${wide ? " data-tip-wide" : ""} aria-label="${esc(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())}">?</button>`;
function mpanel(key, title, body, extra, cls) {
  return `<section class="panel ${cls || ""}"><div class="panel-head"><h2>${title}</h2>${extra || ""}</div>${body}</section>`;
}
const BENEFITS = () => [
  ["🎁", `${mny(MC.signupBonus)} de boas-vindas`, `e mais ${mny(MC.allowance)} de mesada toda semana, igual para todos.`],
  ["🎟️", "Estreias com cópias numeradas", "Uma por dia, uma por semana e uma por mês, cada vez mais raras. A Casa disputa junto."],
  ["🏆", "Coleção que vale pontos", "Trilogias, diretores e o gênero da temporada dão bônus. Suba no ranking da galera."],
  ["🔨", "Revenda entre jogadores", "Anuncie suas cópias em quatro formatos de leilão, com reserva secreta."]
];
function renderMarket() {
  const a = S.acct;
  if (!S.me) {
    const reg = a.tab === "register", sc = S.showcase;
    return `<main class="wrap market auth">
      <section class="panel auth-panel">
        <div><h1 class="market-title">${reg ? "Crie sua conta no Mercado" : "Entre no Mercado"}</h1><p class="hint">Sua carteira e sua coleção de filmes ficam salvas entre as partidas.</p></div>
        <div class="seg" role="group" aria-label="Entrar ou criar conta">
          <button type="button" data-acct-tab="register" aria-pressed="${reg}">Criar conta</button>
          <button type="button" data-acct-tab="login" aria-pressed="${!reg}">Já tenho conta</button></div>
        <form class="entry" id="authForm">
          <div class="field"><label for="au-name">Nome</label><input class="input" id="au-name" maxlength="18" autocomplete="username" value="${esc(a.name)}"></div>
          <div class="field"><label for="au-pass">Senha</label><input class="input" id="au-pass" type="password" maxlength="200" autocomplete="${reg ? "new-password" : "current-password"}" value="${esc(a.pass)}"></div>
          ${reg ? `<p class="hint">Pelo menos ${MC.passwordMin} caracteres. Se esquecer, um admin gera uma senha temporária para você.</p>` : ""}
          ${S.ui.err ? `<p class="err">${esc(S.ui.err)}</p>` : ""}
          <button class="btn ${reg ? "coin" : "go"} big" type="submit" ${a.busy ? "disabled" : ""}>${a.busy ? "Um momento…" : reg ? `Criar conta e ganhar ${mny(MC.signupBonus)}` : "Entrar"}</button>
        </form>
        <ul class="benefits">${BENEFITS().map(([i, t, d]) => `<li><span aria-hidden="true">${i}</span><div><b>${esc(t)}</b><p>${esc(d)}</p></div></li>`).join("")}</ul>
      </section>
      <aside class="auth-side">${sc ? liveNow(sc.open.concat(sc.featured), sc.next, "join") + (sc.ranking.length ? mpanel("", "Ranking agora", rankList(sc.ranking)) : "") : ""}</aside>
    </main>`;
  }
  const m = S.market || { me: S.me, ledger: [], collection: [] }, me = m.me;
  const tab = S.mtab === "admin" && !me.admin ? "painel" : S.mtab;
  const views = {
    painel: () => dashboard(m, me),
    estreias: () => auctionsPanel(me),
    leiloes: () => userAuctionsPanel(me) || mpanel("players", "Leilões dos jogadores", `<p class="hint">Carregando…</p>`),
    colecao: () => collectionPanel(m),
    catalogo: () => catalogPanel(me),
    ranking: () => rankingPanel(me) || mpanel("ranking", "Ranking de colecionadores", `<p class="hint">Carregando…</p>`),
    carteira: () => walletView(m, me),
    admin: () => adminPanel(me)
  };
  return `<main class="wrap market tabbed">${(views[tab] || views.painel)()}</main>`;
}

/* ---------- Painel: o resumo do Mercado para quem entrou ---------- */
function stat(tab, label, value, sub, cls) {
  return `<button type="button" class="stat ${cls || ""}" data-mtab="${tab}"><span class="label">${label}</span><b class="num">${value}</b><span class="hint">${sub || ""}</span></button>`;
}
function dashboard(m, me) {
  const w = me.wallet, s = m.score || { total: 0, bonuses: [] }, R = S.ranking, A = S.auctions || { open: [], players: [], next: {} };
  const pos = R ? R.ranking.findIndex((r) => r.id === me.id) + 1 : 0;
  const live = A.open.concat((A.players || []).filter((a) => a.status === "open")), leading = live.filter((a) => a.mine);
  const recent = S.catalog ? S.catalog.films.slice().sort((x, y) => (y.addedAt || 0) - (x.addedAt || 0)).slice(0, 10) : [];
  const caps = (m.caps || []).map((c) => `${rarName(c.rarity)} ${c.owned}/${c.cap}`).join(" · ");
  return `<section class="hello"><h1>Olá, ${esc(me.name)}</h1><p class="hint">Próxima mesada de ${mny(MC.allowance)}: ${esc(fmtWhen(me.nextAllowanceAt))}.</p></section>
    <div class="stats">
      ${stat("carteira", "Saldo livre", mny(w.free), w.reserved ? `+ ${mny(w.reserved)} reservados em lances` : "pronto para dar lance", "coin")}
      ${stat("ranking", "Pontos", pts(s.total), pos ? `${pos}º de ${R.ranking.length} no ranking` : "monte sua coleção", "mint")}
      ${stat("colecao", "Coleção", `${m.collection.length} ${m.collection.length === 1 ? "cópia" : "cópias"}`, caps ? `teto: ${caps}` : "")}
      ${stat("estreias", "Ao vivo agora", `${live.length} ${live.length === 1 ? "leilão" : "leilões"}`, leading.length ? `você está na frente em ${leading.length}` : "dê o primeiro lance", "live")}
    </div>
    ${seasonBanner(R && R.season)}
    ${liveNow(live, A.next, "tab")}
    <div class="mgrid">
      ${mpanel("", "Top do ranking", R ? rankList(R.ranking.slice(0, 5), me.id) : `<p class="hint">Carregando…</p>`, `<button class="btn quiet" data-mtab="ranking">Ver tudo</button>`)}
      ${mpanel("", "Chegaram ao catálogo", recent.length ? filmStrip(recent) : `<p class="hint">Carregando…</p>`, `<button class="btn quiet" data-mtab="catalogo">Ver catálogo</button>`)}
    </div>`;
}
// leilões abertos em formato compacto: no Mercado leva à aba certa; na tela inicial convida a entrar
function miniAuction(a, mode) {
  const f = a.film, user = a.kind === "user", fmt = a.format || "open", secret = fmt === "sealed" || fmt === "vickrey";
  const price = fmt === "dutch" ? `<b class="num" data-dutch="${a.startPrice}|${a.floor}|${a.startsAt}|${a.endsAt}">${mny(a.startPrice)}</b>`
    : secret ? `<b class="num">${a.bids} ${a.bids === 1 ? "lance" : "lances"}</b>` : `<b class="num">${mny(a.highBy ? a.high : a.minBid)}</b>`;
  const who = user ? `${FMT_ICO[fmt]} ${esc(a.formatName)} · ${esc(a.sellerName)}` : `${EVENT_ICON[a.event] || "🎬"} ${esc(a.eventName)}`;
  const goto = mode === "join" ? `data-act="market-join" data-after="${user ? "leiloes" : "estreias"}"` : `data-mtab="${user ? "leiloes" : "estreias"}"`;
  return `<button type="button" class="mini r-${esc(f.rarity)}" ${goto}>
    <span class="mp">${poster(f)}</span>
    <span class="mi"><span class="ev">${who}</span><b class="t">${esc(f.title)}</b>${genreLine(f, 2)}<span class="tags">${rarBadge(f.rarity)}${isHot(f) ? `<span class="chip hot">🔥 em alta</span>` : ""}<span class="hint num">${esc(a.lot)}</span></span></span>
    <span class="mr"><span class="clock num" data-clock="${a.endsAt}"></span>${price}<span class="hint">${fmt === "dutch" ? "preço agora" : secret ? "secretos" : a.highBy ? (a.highBy === "house" ? "da Casa" : a.mine ? "seu lance" : "maior lance") : "lance mínimo"}</span></span>
  </button>`;
}
function liveNow(list, next, mode) {
  const nx = MC.estreias.filter((ev) => next && next[ev.key]).map((ev) => `${EVENT_ICON[ev.key] || ""} ${esc(ev.name)}: ${esc(fmtWhen(next[ev.key]))}`);
  return `<section class="panel live-now"><div class="panel-head"><h2><span class="onair">AO VIVO</span> Acontecendo agora</h2>${mode === "tab" ? `<button class="btn quiet" data-mtab="estreias">Ver estreias</button>` : ""}</div>
    ${list.length ? `<div class="minis">${list.slice(0, 6).map((a) => miniAuction(a, mode)).join("")}</div>` : `<p class="hint">Nenhum leilão aberto neste momento.</p>`}
    ${nx.length ? `<p class="hint">Próximas estreias: ${nx.join(" · ")}</p>` : ""}</section>`;
}
function rankList(rows, meId) {
  if (!rows.length) return `<p class="hint">Ninguém tem filmes ainda. A primeira cópia já põe você no topo.</p>`;
  return `<ol class="rank-mini">${rows.map((r, i) => `<li class="${r.id && r.id === meId ? "me" : ""}" ${r.id ? `data-rank="${esc(r.id)}" role="button" tabindex="0" title="Ver a coleção de ${esc(r.name)}"` : ""}><span class="pos num">${["🥇", "🥈", "🥉"][i] || i + 1 + "º"}</span><b>${esc(r.name)}</b><span class="hint num">${r.films} ${r.films === 1 ? "filme" : "filmes"}</span><b class="num total">${pts(r.total)}</b></li>`).join("")}</ol>`;
}
function filmStrip(list) {
  return `<div class="strip">${list.map((f) => `<div class="tile r-${esc(f.rarity)}">${zoomable(f, { r: f.ref, rsrc: "nota de referência" })}<span class="t">${esc(f.title)}</span><span class="tags">${rarBadge(f.rarity)}<b class="num">${pts(f.ref)}</b></span></div>`).join("")}</div>`;
}

/* ---------- Coleção e Carteira ---------- */
function collectionPanel(m) {
  const actions = (c, compact) => c.listed
    ? `<span class="pill top">anunciada</span><button class="btn quiet" data-mtab="leiloes">${compact ? "Ver leilão" : "Ver no painel de leilões"}</button>`
    : `<button class="btn" data-list="${esc(c.id)}">Anunciar</button><button class="btn ghost num" data-sell="${esc(c.id)}" title="A Casa paga ${Math.round(MC.buybackPct * 100)}% do valor de referência (${mny(c.value)})">${compact ? `Vender · ${mny(c.buyback)}` : `Vender para a Casa · ${mny(c.buyback)}`}</button>`;
  const grid = S.views.collection === "grid";
  const cards = grid
    ? `<div class="pgrid">${m.collection.map((c) => posterCard(c.film, {
        label: c.label,
        foot: `<span class="meta num"><span>${esc(c.label)}</span><b class="ref">★ ${pts(c.film.ref)}</b></span>`,
        detail: `<span class="hint num">Valor de referência ${mny(c.value)} · a Casa paga ${mny(c.buyback)}</span>`,
        below: actions(c, true)
      })).join("")}</div>`
    : `<div class="mlist">${m.collection.map((c) => `<div class="citem">${filmRow(c.film, `<span class="serial num">${esc(c.label)}</span>`)}<div class="cact">${actions(c, false)}</div></div>`).join("")}</div>`;
  const body = scoreBox(m) + (m.collection.length
    ? `<div class="cat-tools"><span class="label">Suas cópias</span>${viewToggle("collection")}</div>${cards}`
    : `<div class="curtain"><div><b>Nenhum filme ainda</b><p>Suas cópias chegam pelas estreias da Casa e pelos leilões dos jogadores.</p></div><button class="btn coin" data-mtab="estreias">Ver estreias</button></div>`);
  return mpanel("collection", "Coleção", body, m.collection.length ? `<span class="hint num">${m.collection.length} ${m.collection.length === 1 ? "cópia" : "cópias"}</span>` : "");
}
function walletView(m, me) {
  const a = S.acct, w = me.wallet;
  const rows = m.ledger.map((e) => `<div class="lrow"><span>${esc(MK.KINDS[e.kind] || e.kind)}${e.ref ? ` <small>${esc(e.ref)}</small>` : ""}</span><span class="when">${esc(new Date(e.at).toLocaleDateString("pt-BR"))}</span><b class="num ${e.delta < 0 ? "out" : "in"}">${e.delta < 0 ? "−" : "+"}${mny(Math.abs(e.delta))}</b></div>`).join("");
  return `<div class="mgrid">
    <div class="col">
      ${mpanel("wallet", `Carteira de ${esc(me.name)}${me.admin ? ` <span class="pill top">admin</span>` : ""}`,
        `<div class="bal"><span class="label">Saldo livre</span><b class="num">${mny(w.free)}</b>${w.reserved ? `<span class="hint num">Mais ${mny(w.reserved)} reservados em lances</span>` : ""}</div>
        <p class="hint">Próxima mesada de ${mny(MC.allowance)}: ${esc(fmtWhen(me.nextAllowanceAt))}.</p>`,
        `<button class="btn quiet" data-act="logout">Sair da conta</button>`, "wallet")}
      ${mpanel("account", "Conta", `<form class="acct-form" id="pwForm">
          <input class="input" id="pw-old" type="password" placeholder="Senha atual" autocomplete="current-password" value="${esc(a.pwOld)}">
          <input class="input" id="pw-new" type="password" placeholder="Senha nova" autocomplete="new-password" value="${esc(a.pwNew)}">
          <button class="btn" type="submit">Trocar senha</button></form>
        ${me.admin ? `<form class="acct-form" id="resetForm" autocomplete="off"><input class="input" id="rs-name" maxlength="18" placeholder="Nome da conta"><button class="btn" type="submit">Gerar senha temporária</button></form>
          <p class="hint">A pessoa sai da conta em todos os aparelhos e entra com a senha temporária.</p>` : ""}`)}
    </div>
    ${mpanel("ledger", "Extrato", `<div class="ledger">${rows || `<p class="hint">Nenhuma movimentação ainda.</p>`}</div>`)}
  </div>`;
}
/* ---------- pontuação da coleção, tetos, temporada e ranking ---------- */
const BONUS_ICO = Object.assign({ series: "🎞️", director: "🎬", decade: "📅", genre: "🎭", season: "🔥" }, Object.fromEntries(Object.entries(MC.filmTags || {}).map(([k, t]) => [k, t.icon])));
const bonusChips = (s) => s.bonuses.map((b) => `<span class="chip bonus" title="${esc(b.name)}: ${b.n} filmes">${b.icon || BONUS_ICO[b.kind] || "★"} ${esc(b.name)}${b.label ? ": " + esc(b.label) : ""} <b class="num">+${pts(b.pts)}</b></span>`).join("");
// tags do filme (Cult, Nacional) e os Oscars num selo só ("🏆 Oscar ×3"), com a explicação no balão
const oscarChip = (f) => {
  const fams = (f.oscars || []).map((k) => (MC.oscarFamilies || {})[k]).filter(Boolean);
  if (!fams.length) return "";
  const list = fams.map((o) => `${o.icon} ${esc(o.name)}`).join("<br>");
  return `<span class="chip ftag" tabindex="0" ${tipAttr(`<b>Oscar</b><br>${list}`)}>🏆 Oscar${fams.length > 1 ? ` ×${fams.length}` : ""}</span>`;
};
const tagChips = (f) => oscarChip(f) + (f.tags || []).map((k) => { const t = (MC.filmTags || {})[k]; return t ? `<span class="chip ftag" tabindex="0" ${tipAttr(esc(t.desc))}>${t.icon} ${esc(t.name)}</span>` : ""; }).join("");
function scoreBox(m) {
  const s = m.score, caps = (m.caps || []).map((c) => `${esc(rarName(c.rarity))}: <b class="num">${c.owned} de ${c.cap}</b>`).join(" · ");
  if (!s) return "";
  return `<div class="scorebox"><div><span class="label">Pontos da coleção</span><b class="num">${pts(s.total)}</b>
      <span class="hint num">${pts(s.base)} das notas${s.bonuses.length ? " + bônus" : ""}</span></div>
    ${s.bonuses.length ? `<div class="chips">${bonusChips(s)}</div>` : `<p class="hint">Nenhum bônus ainda ${tip(`Bônus de conjunto: 3 filmes da mesma série, do mesmo diretor, cults, nacionais ou com Oscar da mesma família (Atuação, Roteiro…), e 4 da mesma década ou do mesmo gênero. Cada conjunto começa pequeno e cresce a cada filme a mais, até um teto. Filmes do gênero da temporada também somam. A tabela completa está no "?" do Catálogo.`)}</p>`}
    ${caps ? `<p class="hint">Teto por jogador: ${caps}</p>` : ""}</div>`;
}
function seasonBanner(s) {
  s = s || (S.ranking && S.ranking.season);
  if (!s) return "";
  const until = new Date(s.endsAt - 1).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `<button type="button" class="season" ${tipAttr(`<b>${esc(s.genre)}</b> em alta até ${esc(until)}. Cada filme do gênero vale +${MC.seasonPts} pontos na coleção e ${Math.round((MC.seasonValueBoost - 1) * 100)}% a mais no valor de referência.${s.override ? " Escolhido pelo admin." : ""}`)}>🔥 <span>Temporada: <b>${esc(s.genre)}</b></span></button>`;
}
function rankingPanel(me) {
  const R = S.ranking;
  if (!R) return "";
  const rows = R.ranking.map((r, i) => `<button type="button" class="rank-row ${r.id === me.id ? "me" : ""}" data-rank="${esc(r.id)}" title="Ver a coleção de ${esc(r.name)}"><span class="pos num">${i + 1}º</span><b>${esc(r.name)}</b>
    <span class="hint num">${r.films} ${r.films === 1 ? "filme" : "filmes"}</span><span class="chips">${bonusChips(r)}</span><b class="num total">${pts(r.total)}</b></button>`).join("");
  return mpanel("ranking", `Ranking de colecionadores ${tip("Pontos = soma das notas de referência dos seus filmes (cada filme conta uma vez; um Tomate Podre vale 10 menos a nota dele) + bônus de conjunto + temporada.")}`, `${seasonBanner()}<div class="ranking">${rows}</div>`);
}
/* ---------- coleção de outro jogador (pelo ranking) ---------- */
async function openCollection(id) {
  const r0 = ((S.ranking && S.ranking.ranking) || []).find((r) => r.id === id);
  S.viewColl = { id, data: null, err: "" };
  S.ui.modal = { title: `Coleção de ${r0 ? r0.name : "…"}`, cls: "wide", body: collectionModal, actions: [{ label: "Fechar", cls: "go", run: () => { S.viewColl = null; } }] };
  render();
  const r = await N.call("market:collection", { id });
  if (!S.viewColl || S.viewColl.id !== id || !S.ui.modal) return;
  if (r.error) S.viewColl.err = r.error;
  else { S.viewColl.data = r; S.ui.modal.title = `Coleção de ${r.name}`; }
  render();
}
function collectionModal() {
  const v = S.viewColl;
  if (!v) return "";
  if (v.err) return `<p class="err">${esc(v.err)}</p>`;
  if (!v.data) return `<p class="hint">Carregando a coleção…</p>`;
  const d = v.data, s = d.score;
  const head = `<div class="scorebox"><div><span class="label">Pontos da coleção</span><b class="num">${pts(s.total)}</b>
      <span class="hint num">${s.films} ${s.films === 1 ? "filme" : "filmes"} · ${pts(s.base)} das notas${s.bonuses.length ? " + bônus" : ""}</span></div>
    ${s.bonuses.length ? `<div class="chips">${bonusChips(s)}</div>` : ""}</div>`;
  if (!d.copies.length) return head + `<p class="hint">Nenhum filme ainda.</p>`;
  return head + `<div class="pgrid">${d.copies.map((c) => posterCard(c.film, { label: c.label,
    foot: `<span class="meta num"><span>${esc(c.label)}</span><b class="ref">★ ${pts(c.film.ref)}</b></span>`,
    below: c.listed ? `<span class="pill top">anunciada</span>` : "" })).join("")}</div>`;
}
async function loadRanking() {
  const r = await N.call("market:ranking");
  if (!r.error) { S.ranking = r; render(); }
}

/* ---------- catálogo do Mercado: raridade, notas e tiragem ---------- */
const hotGenre = () => { const s = (S.ranking && S.ranking.season) || (S.showcase && S.showcase.season); return s ? s.genre : null; };
const isHot = (f) => !!hotGenre() && (f.g || []).includes(hotGenre());
const hotChip = (f) => (isHot(f) ? `<span class="chip hot" tabindex="0" ${tipAttr(`Gênero da temporada (<b>${esc(hotGenre())}</b>): vale +${MC.seasonPts} pontos na coleção e ${Math.round((MC.seasonValueBoost - 1) * 100)}% a mais no valor de referência.`)}>🔥 em alta</span>` : "");
const genreLine = (f, n) => ((f.g || []).length ? `<span class="hint fgenres">${esc(f.g.slice(0, n || 3).join(" · "))}</span>` : "");
const rarName = (k) => (MK.rarity(k) || {}).name || k;
const rarBadge = (k) => `<span class="rar r-${esc(k)}">${esc(rarName(k))}</span>`;
const filmScores = (f) => Object.entries(MK.SOURCES).filter(([k]) => f.scores[k] != null).map(([k, n]) => `${n} ${pts(f.scores[k])}`).join(" · ");
function filmRow(f, side) {
  return `<div class="mfilm r-${esc(f.rarity)}"><div class="ph">${zoomable(f, { r: f.ref, rsrc: "nota de referência" })}</div>
    <div class="meta"><b>${esc(f.title)}</b><span class="hint">${esc(f.year)}${f.dir ? " · " + esc(f.dir) : ""}</span>
      <div class="tags">${rarBadge(f.rarity)}${f.unanimous ? `<span class="seal" title="As notas quase não discordam">Unanimidade</span>` : ""}${f.garimpo ? `<span class="chip" title="Pouco lembrado: subiu uma raridade">Garimpo</span>` : ""}${hotChip(f)}${tagChips(f)}</div>
      ${genreLine(f)}<span class="hint num">${esc(filmScores(f))}</span></div>
    <div class="ref"><b class="num">${pts(f.ref)}</b>${side || ""}</div></div>`;
}
function catalogPanel(me) {
  const c = S.catalog;
  const admin = me.admin ? `<button class="btn quiet" data-act="refill" ${c && c.refilling ? "disabled" : ""}>Atualizar agora</button>` : "";
  if (!c) return mpanel("catalog", "Filmes do Mercado", `<p class="hint">Carregando o catálogo…</p>`, admin);
  // filtros de raridade e de gênero se somam; as contagens de raridade já respeitam o gênero escolhido
  const flt = S.ui.catFilter || "all", genres = {};
  c.films.forEach((f) => (f.g || []).forEach((g) => (genres[g] = (genres[g] || 0) + 1)));
  const gen = genres[S.ui.catGenre] ? S.ui.catGenre : "";
  const byGenre = gen ? c.films.filter((f) => (f.g || []).includes(gen)) : c.films, count = {};
  byGenre.forEach((f) => (count[f.rarity] = (count[f.rarity] || 0) + 1));
  const opts = [["all", `Todos (${byGenre.length})`], ...MC.rarities.slice().reverse().filter((r) => count[r.key] || flt === r.key).map((r) => [r.key, `${r.name} (${count[r.key] || 0})`])];
  const genreOpts = Object.entries(genres).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([g, n]) => `<option value="${esc(g)}" ${g === gen ? "selected" : ""}>${esc(g)} (${n})</option>`).join("");
  const list = byGenre.filter((f) => flt === "all" || f.rarity === flt);
  const copies = (f) => `<span class="hint num">${f.minted} de ${f.supply} ${f.supply === 1 ? "cópia emitida" : "cópias emitidas"}</span>`;
  const body = !c.films.length
    ? `<div class="curtain"><div><b>${c.refilling ? "A Casa está escolhendo os filmes…" : "Catálogo vazio"}</b><p>A Casa sorteia filmes com pelo menos ${MC.minScores} notas (IMDb, Metacritic ou Rotten Tomatoes) e cadastra sozinha.</p></div></div>`
    : `<div class="cat-tools"><div class="seg" role="group" aria-label="Filtrar por raridade">${opts.map(([k, l]) => `<button type="button" data-catf="${k}" aria-pressed="${flt === k}">${esc(l)}</button>`).join("")}</div>
         <div class="cat-side"><select class="input cat-genre" id="cat-genre" aria-label="Filtrar por gênero"><option value="">Todos os gêneros</option>${genreOpts}</select>${viewToggle("catalog")}</div></div>
       ${!list.length ? `<p class="hint">Nenhum filme com esse filtro.</p>` : S.views.catalog === "grid" ? `<div class="pgrid">${list.map((f) => posterCard(f)).join("")}</div>` : `<div class="mlist">${list.map((f) => filmRow(f, copies(f))).join("")}</div>`}`;
  return mpanel("catalog", `Filmes do Mercado ${tip(catalogLegend(), true)}`, body, admin);
}
// legenda do catálogo (no "?" do título): raridades, selos, tags, conjuntos e pontos, tudo lido do config
function catalogLegend() {
  const normal = MC.rarities.filter((r) => r.max == null);
  const range = (r) => {
    if (r.max != null) return `até ${pts(r.max)}`;
    const i = normal.indexOf(r);
    return i === 0 ? `até ${pts(normal[1].min - 0.1)}` : `${pts(r.min)}+`;
  };
  const chance = (k) => ((MC.ghostChance || {})[k] ? `${Math.round(MC.ghostChance[k] * 100)}%` : "—");
  const rarRows = MC.rarities.slice().reverse().map((r) => `<tr><td>${rarBadge(r.key)}</td><td class="num">${range(r)}</td><td class="num">${r.copies}</td><td class="num">${mny(r.minBid)}</td><td class="num">${chance(r.key)}</td></tr>`).join("");
  const B = MC.collectionBonuses, SET_TEXT = { series: "da mesma série", director: "do mesmo diretor", decade: "da mesma década", genre: "do mesmo gênero principal", cult: "cults", nacional: "nacionais" };
  // escada: "+2, +1 por filme a mais, até +8"
  const ladder = (b) => `+${b.pts}${b.step ? `<small>, +${b.step} por filme a mais, até +${b.max}</small>` : ""}`;
  const setRows = Object.entries(B).map(([k, b]) => `<tr><td>${BONUS_ICO[k] || "★"} ${esc(b.name)}</td><td>a partir de ${b.n} filmes ${SET_TEXT[k] || ""}</td><td>${ladder(b)}</td></tr>`).join("")
    + (MC.oscarSet ? `<tr><td>🏆 ${esc(MC.oscarSet.name)}</td><td>a partir de ${MC.oscarSet.n} filmes com Oscar da mesma família (cada família conta)</td><td>${ladder(MC.oscarSet)}</td></tr>` : "")
    + `<tr><td>🔥 Temporada</td><td>cada filme do gênero em alta no mês</td><td class="num">+${MC.seasonPts}</td></tr>`;
  const tags = Object.values(MC.filmTags || {}).map((t) => `<li>${t.icon} <b>${esc(t.name)}</b>: ${esc(t.desc)}</li>`).join("")
    + `<li>🏆 <b>Oscar</b>: por família, ${Object.values(MC.oscarFamilies || {}).map((o) => `${o.icon} ${esc(o.name)}`).join(", ")}.</li>`;
  return `<div class="legend">
    <h4>Raridades</h4>
    <table><tr><th>Faixa</th><th>Nota</th><th>Cópias</th><th>Lance</th><th>Casa</th></tr>${rarRows}</table>
    <p>Nota de referência: média de IMDb, Metacritic e Rotten Tomatoes (o RT vale metade). Casa: chance de ela cobrir um lance nas estreias.</p>
    <h4>Selos</h4>
    <ul><li><b>Unanimidade</b>: as notas quase não discordam (até ${pts(MC.unanimityMaxSpread)} de diferença).</li>
      <li><b>Garimpo</b>: filme pouco lembrado (menos de ${MC.garimpoBelowLinks} páginas na Wikipédia); sobe uma faixa, até ${esc(rarName(MC.garimpoCap))}.</li>
      <li>🔥 <b>em alta</b>: gênero da temporada; vale +${MC.seasonPts} pontos e ${Math.round((MC.seasonValueBoost - 1) * 100)}% a mais no valor de referência.</li></ul>
    <h4>Tags</h4><ul>${tags}</ul>
    <h4>Pontos da coleção</h4>
    <p>Cada filme vale a nota de referência (o Tomate Podre vale 10 menos a nota); cada filme conta uma vez. Os conjuntos somam:</p>
    <table>${setRows}</table></div>`;
}
// Lista ou Pôsteres: cada lugar (catálogo, coleção, últimos leilões) guarda a própria escolha em ml-views
function viewToggle(key) {
  const grid = S.views[key] === "grid";
  return `<div class="seg" role="group" aria-label="Modo de exibição"><button type="button" data-view="${key}:list" aria-pressed="${!grid}">☰ Lista</button><button type="button" data-view="${key}:grid" aria-pressed="${grid}">▦ Pôsteres</button></div>`;
}
// modo Pôsteres: só o pôster com moldura da raridade e um rodapé essencial; os detalhes sobem ao passar o mouse
// (ou ao tocar/focar, no celular e no teclado). o.foot troca a linha do rodapé, o.detail soma ao detalhe
// e o.below põe botões embaixo do card (fora da moldura).
function posterCard(f, o) {
  o = o || {};
  const tags = `${rarBadge(f.rarity)}${f.unanimous ? `<span class="seal">Unanimidade</span>` : ""}${f.garimpo ? `<span class="chip">Garimpo</span>` : ""}${hotChip(f)}${tagChips(f)}`;
  const scores = Object.entries(MK.SOURCES).filter(([k]) => f.scores[k] != null).map(([k, n]) => `<li><span>${esc(n)}</span><b class="num">${pts(f.scores[k])}</b></li>`).join("");
  const card = `<article class="pcard r-${esc(f.rarity)}" tabindex="0" aria-label="${esc(f.title)}, ${esc(rarName(f.rarity))}, nota ${pts(f.ref)}${o.label ? ", " + esc(o.label) : ""}">
    <div class="pin">
      <div class="pimg">${poster(f)}<span class="pbadge">${esc(rarName(f.rarity))}</span>
        <div class="pdetail">
          <b class="t">${esc(f.title)}</b>${f.orig && f.orig !== f.title ? `<span class="hint">${esc(f.orig)}</span>` : ""}
          <span class="hint">${esc(f.year)}${f.dir ? " · " + esc(f.dir) : ""}</span>
          <div class="tags">${tags}</div>
          <ul class="pscores">${scores}<li class="ref"><span>Referência</span><b class="num">${pts(f.ref)}</b></li></ul>
          ${(f.g || []).length ? `<span class="hint">${esc(f.g.slice(0, 3).join(" · "))}</span>` : ""}
          ${f.series ? `<span class="hint">Série: ${esc(f.series)}</span>` : ""}
          <span class="hint num">${f.minted} de ${f.supply} ${f.supply === 1 ? "cópia emitida" : "cópias emitidas"}${f.house ? ` · ${f.house} no estoque da Casa` : ""}</span>
          ${o.detail || ""}
        </div>
      </div>
      <div class="pfoot"><b class="t">${esc(f.title)}</b>${o.foot || `<span class="meta num"><span>${esc(f.year)}</span><b class="ref">★ ${pts(f.ref)}</b><span title="cópias emitidas">${f.minted}/${f.supply}</span></span>`}</div>
    </div>
  </article>`;
  return o.below ? `<div class="pcell">${card}<div class="pbelow">${o.below}</div></div>` : card;
}
// resultado curto de um leilão encerrado (rodapé do pôster)
function resultShort(a) {
  const r = a.result || {};
  if (r.winner) return `🏆 ${esc(r.winnerName)} · <b class="ref">${mny(r.price)}</b>`;
  return a.status === "canceled" ? "cancelado" : r.house ? "a Casa ficou na frente" : r.reserveMissed ? "reserva não atingida" : "sem lances";
}
/* ---------- estreias da Casa: leilões que emitem as cópias ---------- */
const EVENT_ICON = { day: "🎟️", week: "🎬", month: "🏆" };
const bidDrafts = {};   // valor digitado em cada leilão (sobrevive ao re-render)
const FMT_ICO = { open: "🔨", sealed: "✉️", vickrey: "🥈", dutch: "⏱️" };
const bidBox = (a, min, label, start) => `<form class="bid-form" id="bidForm-${esc(a.id)}"><div class="stepper"><button type="button" data-mstep="-1" data-aid="${esc(a.id)}" aria-label="Diminuir">−</button>
    <input id="mbid-${esc(a.id)}" type="number" inputmode="numeric" min="${min}" value="${Math.max(min, Math.floor(+bidDrafts[a.id]) || start || min)}" aria-label="Valor do lance"><button type="button" data-mstep="1" data-aid="${esc(a.id)}" aria-label="Aumentar">+</button></div>
    <button class="btn coin" type="submit">${label}</button></form>`;
// cartão de leilão: estreia da Casa ou leilão de jogador, em qualquer formato
function auctionCard(a, me) {
  const f = a.film, fmt = a.format || "open", user = a.kind === "user", scheduled = a.status === "scheduled";
  const free = `seu saldo livre ${mny(me.wallet.free)}`;
  let read, ctl;
  if (fmt === "dutch") {
    read = `<span class="label">Preço agora</span><b class="num" data-dutch="${a.startPrice}|${a.floor}|${a.startsAt}|${a.endsAt}">${mny(a.startPrice)}</b><span class="hint num">cai até ${mny(a.floor)}</span>`;
    ctl = `<button class="btn coin" data-dutch-buy="${esc(a.id)}" ${scheduled || a.isSeller ? "disabled" : ""}>Comprar agora</button><p class="hint">O primeiro a comprar leva pelo preço da hora · ${free}</p>`;
  } else if (fmt === "sealed" || fmt === "vickrey") {
    read = `<span class="label">${FMT_ICO[fmt]} ${esc(a.formatName)}</span><b class="num">${a.bids} ${a.bids === 1 ? "lance" : "lances"}</b><span class="hint">${fmt === "vickrey" ? "quem vence paga o 2º maior lance" : "quem vence paga o próprio lance"}</span>`;
    ctl = `${a.myBid ? `<p class="lead-ok">Seu lance secreto: ${mny(a.myBid)}. Dá para trocar até o fim.</p>` : ""}${bidBox(a, a.minBid, a.myBid ? "Trocar lance" : "Lance secreto", a.myBid)}<p class="hint num">Mínimo ${mny(a.minBid)} · ${free}</p>`;
  } else {
    const min = a.highBy ? a.high + 1 : a.minBid;
    read = `<span class="label">${a.highBy ? "Maior lance" : "Lance mínimo"}</span><b class="num">${mny(a.highBy ? a.high : a.minBid)}</b>
      <span class="hint">${a.highBy ? (a.mine ? "é seu" : a.highBy === "house" ? "da Casa" : `de ${esc(a.highName)}`) : "ninguém deu lance ainda"}</span>`;
    ctl = a.mine ? `<p class="lead-ok">Seu lance está na frente. Se alguém passar, o dinheiro volta para você na hora.</p>`
      : `${bidBox(a, min, "Dar lance")}<p class="hint num">Mínimo ${mny(min)} · ${free}</p>`;
  }
  if (a.isSeller) {
    ctl = `<p class="lead-ok">Seu leilão${a.reserve ? `, com reserva secreta de ${mny(a.reserve)}` : ""}.</p>
      ${a.bids || a.highBy ? `<p class="hint">Já tem lance: vai até o fim.</p>` : `<button class="btn quiet" data-unlist="${esc(a.id)}">Desistir (a taxa de anúncio não volta)</button>`}`;
  } else if (scheduled) ctl = `<p class="hint">Abre ${esc(fmtWhen(a.startsAt))}. Os lances valem a partir daí.</p>`;
  const head = user
    ? `<span class="ev">${FMT_ICO[fmt]} ${esc(a.formatName)} <small>de ${esc(a.sellerName)}</small></span>`
    : `<span class="ev">${EVENT_ICON[a.event] || "🎬"} ${esc(a.eventName)}</span>`;
  return `<article class="auction r-${esc(f.rarity)} ${a.featured ? "featured" : ""}">
    <div class="ahead">${head}<span class="clock-wrap">${scheduled ? `<span class="hint">abre em</span> <span class="clock num" data-clock="${a.startsAt}"></span>` : `<span class="clock num" data-clock="${a.endsAt}"></span>`}</span></div>
    ${filmRow(f, `<span class="serial num">${esc(a.lot)}</span>${a.fromStock ? `<span class="hint">volta do estoque da Casa</span>` : ""}${a.featured ? `<span class="pill top">vitrine</span>` : ""}`)}
    <div class="abody"><div class="aread">${read}</div><div class="actl">${ctl}</div></div>
    ${a.highBy === "house" ? `<p class="hint">🏠 A Casa está na frente${a.houseChance ? ` · ${a.houseChance}% de chance de cobrir de novo` : ""} ${tip("Nas estreias de Raro para cima, a Casa pode cobrir cada lance. A chance começa maior nas faixas mais raras e cai pela metade a cada cobertura, e ela nunca passa de um teto escondido. Se ela terminar na frente, a cópia não sai.")}</p>` : ""}
    ${a.highBy !== "house" && a.houseChance ? `<p class="hint">🏠 Casa: ${a.houseChance}% de chance de cobrir ${tip("Nas estreias de Raro para cima, a Casa pode cobrir cada lance. A chance começa maior nas faixas mais raras e cai pela metade a cada cobertura, e ela nunca passa de um teto escondido. Se ela terminar na frente, a cópia não sai.")}</p>` : ""}
    ${a.hasReserve && !a.isSeller ? `<p class="hint">🔒 Reserva secreta ${tip("O dono definiu um preço mínimo escondido: abaixo dele, a cópia não é vendida e os lances voltam.")}</p>` : ""}
    ${a.extended ? `<p class="hint num">Prorrogada ${a.extended}× por lances no fim.</p>` : ""}
    ${me.admin ? `<div class="adm-row"><span class="hint">Admin:</span><button class="btn quiet" data-adm-close="${esc(a.id)}">Encerrar agora</button><button class="btn quiet" data-adm-cancel="${esc(a.id)}">Cancelar</button></div>` : ""}
  </article>`;
}
// resultado de um leilão encerrado, com os lances secretos revelados
function resultText(a) {
  const r = a.result || {};
  const who = r.winner ? `${esc(r.winnerName)} levou por <b class="num">${mny(r.price)}</b>` : a.status === "canceled" ? "cancelado" : r.house ? "a Casa ficou na frente" : r.reserveMissed ? "não atingiu a reserva" : "sem lances";
  const rev = r.reveal && r.reveal.length ? `<br><small>lances: ${r.reveal.map((b) => `${esc(b.name)} ${mny(b.v)}`).join(", ")}</small>` : "";
  return `<span class="hint">${a.kind === "user" ? `${FMT_ICO[a.format]} de ${esc(a.sellerName)} · ` : ""}${who}${rev}</span>`;
}
/* ---------- leilões dos jogadores: vitrine e lista ---------- */
function userAuctionsPanel(me) {
  const A = S.auctions;
  if (!A) return "";
  const P = A.players || [], feat = P.filter((a) => a.featured), rest = P.filter((a) => !a.featured);
  const body = `${feat.length ? `<span class="label">⭐ Vitrine</span><div class="auctions">${feat.map((a) => auctionCard(a, me)).join("")}</div>` : ""}
    ${rest.length ? `<span class="label">Anunciados</span><div class="auctions">${rest.map((a) => auctionCard(a, me)).join("")}</div>` : ""}
    ${P.length ? "" : `<div class="curtain"><div><b>Nenhum leilão de jogador agora</b><p>Anuncie uma cópia da sua coleção para os outros darem lance.</p></div></div>`}`;
  return mpanel("players", `Leilões dos jogadores ${tip(`Qualquer um anuncia uma cópia da coleção pelo botão <b>Anunciar</b>. Anunciar custa ${mny(MC.listingFee)}; a vitrine (com aviso para todos) custa mais ${mny(MC.featureFee)}, e é de graça para ${esc(rarName(MC.featureFreeFrom))} ou mais raro. Quem vende paga ${Math.round(MC.saleFeePct * 100)}% do preço.`)}`, body, P.length ? `<span class="pill in">${P.length} ${P.length === 1 ? "anúncio" : "anúncios"}</span>` : "");
}
/* ---------- anunciar uma cópia: formulário num modal que sobrevive aos re-renders ---------- */
let listDraft = null;
const toLocalInput = (t) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16); };
function durName(m) { return m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : `${m / 1440} ${m === 1440 ? "dia" : "dias"}`; }
function listFormHtml() {
  const d = listDraft, c = ((S.market || {}).collection || []).find((x) => x.id === d.copy);
  if (!c) return `<p class="hint">Essa cópia não está mais na sua coleção.</p>`;
  const r = MC.rarities.find((x) => x.key === c.film.rarity), freeFeat = MK.rarityIndex(c.film.rarity) >= MK.rarityIndex(MC.featureFreeFrom);
  const cost = MC.listingFee + (d.featured && !freeFeat ? MC.featureFee : 0), dutch = d.format === "dutch";
  return `${filmRow(c.film, `<span class="serial num">${esc(c.label)}</span>`)}
    <div class="field"><span class="label">Formato</span><div class="seg" role="group">${MC.userFormats.map((k) => `<button type="button" data-lf-format="${k}" aria-pressed="${d.format === k}">${FMT_ICO[k]} ${esc(MK.FORMATS[k].name)}</button>`).join("")}</div>
      <p class="hint">${esc(MK.FORMATS[d.format].desc)}</p></div>
    <div class="grid-3">
      <div class="field"><label for="lf-minutes">Duração</label><select class="input" id="lf-minutes">${MC.userDurations.map((m) => `<option value="${m}" ${+d.minutes === m ? "selected" : ""}>${durName(m)}</option>`).join("")}</select></div>
      <div class="field"><span class="label">Início</span><div class="seg" role="group"><button type="button" data-lf-when="now" aria-pressed="${!d.schedule}">Agora</button><button type="button" data-lf-when="later" aria-pressed="${!!d.schedule}">Agendar</button></div></div>
      ${d.schedule ? `<div class="field"><label for="lf-start">Começa em</label><input class="input" id="lf-start" type="datetime-local" value="${esc(d.start)}"></div>` : ""}
    </div>
    <div class="grid-3">
      ${dutch ? `<div class="field"><label for="lf-startPrice">Preço inicial</label><input class="input num" id="lf-startPrice" type="number" min="${r.minBid + 1}" value="${esc(d.startPrice)}"></div>` : ""}
      <div class="field"><label for="lf-reserve">${dutch ? "Preço mínimo (o relógio para aqui)" : "Reserva secreta (opcional)"}</label><input class="input num" id="lf-reserve" type="number" min="0" placeholder="${dutch ? r.minBid : "sem reserva"}" value="${esc(d.reserve)}"></div>
    </div>
    <p class="hint">Lance mínimo da raridade ${esc(r.name)}: ${mny(r.minBid)}. ${dutch ? "Todos veem o preço caindo até o mínimo." : "A reserva fica escondida: abaixo dela, a cópia continua sua e os lances voltam."}</p>
    <label class="check"><input type="checkbox" id="lf-featured" ${d.featured || freeFeat ? "checked" : ""} ${freeFeat ? "disabled" : ""}> Pôr na vitrine e avisar todo mundo ${freeFeat ? "(de graça para esta raridade)" : `(+${mny(MC.featureFee)})`}</label>
    <p class="cost num">Custa ${mny(cost)} para anunciar (não volta). Se vender, você recebe o preço menos ${Math.round(MC.saleFeePct * 100)}%.</p>
    ${d.err ? `<p class="err">${esc(d.err)}</p>` : ""}`;
}
function openListForm(copyId) {
  listDraft = { copy: copyId, format: "open", minutes: 60, schedule: false, start: toLocalInput(Date.now() + 3600e3), reserve: "", startPrice: "", featured: false, err: "" };
  showListModal();
}
function showListModal() {
  S.ui.modal = { title: "Anunciar cópia", body: listFormHtml, cls: "wide", actions: [{ label: "Cancelar", run: () => { listDraft = null; } }, { label: "Anunciar", cls: "go", run: submitListing }] };
  render();
}
async function submitListing() {
  const d = listDraft; if (!d) return;
  const r = await N.call("market:list", { copy: d.copy, format: d.format, minutes: +d.minutes, startsAt: d.schedule ? new Date(d.start).getTime() : null,
    reserve: d.reserve === "" ? 0 : +d.reserve, startPrice: +d.startPrice, featured: d.featured });
  if (r.error) { d.err = r.error; return showListModal(); }   // reabre com o erro, sem perder o que foi preenchido
  listDraft = null; toast(d.schedule ? "Leilão agendado." : "Leilão aberto!");
}
// ferramentas de teste: abrir estreias, dar M$ e conferir carteiras e coleções de todas as contas
function adminPanel(me) {
  if (!me.admin) return "";
  const accs = S.adminAccounts || [];
  const rows = accs.map((u) => `<div class="acc-row"><b>${esc(u.name)}${u.admin ? ` <span class="pill top">admin</span>` : ""}</b>
    <span class="num">${mny(u.wallet.free)} livres${u.wallet.reserved ? ` · ${mny(u.wallet.reserved)} reservados` : ""}</span>
    <span class="copies">${u.copies.length ? u.copies.map((c) => `${rarBadge(c.rarity)} ${esc(c.title)} <small class="num">${esc(c.label)}</small>`).join("<br>") : `<span class="hint">sem cópias</span>`}</span></div>`).join("");
  return mpanel("admin", `Ferramentas do admin ${tip("Para testar: abra estreias fora da agenda, encerre antes do tempo (o vencedor recebe a cópia na hora) e confira abaixo a carteira e a coleção de cada conta.")}`, `    <div class="toolbar"><span class="label">Abrir estreia agora:</span>${MC.estreias.map((ev) => `<button class="btn" data-adm-open="${esc(ev.key)}">${EVENT_ICON[ev.key] || ""} ${esc(ev.name)}</button>`).join("")}</div>
    <form class="acct-form" id="admGrant" autocomplete="off"><input class="input" id="adm-name" maxlength="18" placeholder="Nome da conta"><input class="input num" id="adm-amount" type="number" min="1" max="10000" placeholder="M$"><button class="btn" type="submit">Dar M$</button></form>
    <div class="panel-head"><span class="label">Contas (${accs.length})</span><button class="btn quiet" data-act="adm-refresh">Atualizar</button></div>
    <div class="accs">${rows || `<p class="hint">Carregando…</p>`}</div>
    <div class="toolbar"><span class="label">Temporada deste mês:</span><select class="input" id="adm-season" style="width:auto"><option value="">Sorteio do mês</option>${MC.seasonGenres.map((g) => `<option ${S.ranking && S.ranking.season && S.ranking.season.override && S.ranking.season.genre === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select><button class="btn" data-act="adm-season">Trocar</button></div>`, "", "admin-panel");
}
async function loadAccounts() {
  if (!S.me || !S.me.admin) return;
  const r = await N.call("admin:accounts");
  if (!r.error) { S.adminAccounts = r.accounts; render(); }
}
async function adminCall(t, d, okMsg) {
  const r = await N.call(t, d);
  if (r.error) return toast(r.error, true);
  toast(typeof okMsg === "function" ? okMsg(r) : okMsg);
  loadAccounts();
}
function auctionsPanel(me) {
  const A = S.auctions;
  if (!A) return mpanel("auctions", "Estreias da Casa", `<p class="hint">Carregando as estreias…</p>`);
  const next = MC.estreias.filter((ev) => A.next[ev.key]).map((ev) => `${EVENT_ICON[ev.key] || ""} ${esc(ev.name)}: ${esc(fmtWhen(A.next[ev.key]))}`);
  const recentGrid = S.views.recent === "grid";
  const recent = A.recent.slice(0, recentGrid ? 7 : 4).map((a) => recentGrid
    ? posterCard(a.film, { label: "leilão encerrado", foot: `<span class="meta res">${resultShort(a)}</span>`, detail: `<span class="hint">${a.kind === "user" ? `${FMT_ICO[a.format]} ${esc(a.formatName)}` : `${EVENT_ICON[a.event] || "🎬"} ${esc(a.eventName || "")}`}${a.lot ? ` · ${esc(a.lot)}` : ""}</span>${resultText(a)}` })
    : filmRow(a.film, resultText(a)));
  const body = `${A.open.length ? `<div class="auctions">${A.open.map((a) => auctionCard(a, me)).join("")}</div>` : `<div class="curtain"><div><b>Nenhuma estreia aberta agora</b><p>A Casa abre uma por dia, uma por semana e uma por mês.</p></div></div>`}
    ${next.length ? `<p class="hint">Próximas: ${next.join(" · ")}</p>` : ""}
    ${recent.length ? `<div class="cat-tools"><span class="label">Últimos leilões encerrados</span>${viewToggle("recent")}</div><div class="${recentGrid ? "pgrid" : "mlist"}">${recent.join("")}</div>` : ""}`;
  return mpanel("auctions", `Estreias da Casa ${tip(`Cada estreia leiloa uma cópia. Lance nos últimos ${MC.extendWindowSec} s soma mais ${MC.extendBySec} s ao relógio. O lance fica reservado na sua carteira; se alguém passar, ele volta na hora. Quem vence paga e recebe a cópia. Nas faixas de Raro para cima, a Casa também disputa: ela pode cobrir cada lance, com chance maior nas faixas raras, que cai a cada cobertura.`)}`, body, A.open.length ? `<span class="pill in">${A.open.length} ${A.open.length === 1 ? "aberta" : "abertas"}</span>` : "");
}
async function loadAuctions() {
  const r = await N.call("market:auctions");
  if (!r.error) { S.auctions = r; render(); }
}
async function loadCatalog() {
  const r = await N.call("market:catalog");
  if (r.error) return;
  S.catalog = r; render();
  if (r.refilling && S.mode === "market") setTimeout(loadCatalog, 4000);
}
async function openMarket() {
  S.mode = "market"; S.ui.err = ""; render();
  N.connect(); await waitOpen();
  if (S.auth && !S.me) await resumeAuth();
  if (S.me) refreshMarket(); else loadShowcase();   // sem conta: a vitrine ao lado do formulário
}
async function resumeAuth() {
  const r = await N.call("auth:resume", { session: S.auth });
  if (r.error) { if (r.expired) signedOut(); }   // sem conexão: mantém o token e tenta na próxima
  else S.me = r.me;
  render();
}
async function refreshMarket() {
  const r = await N.call("market:me");
  if (!r.error) { S.market = r; S.me = r.me; render(); loadCatalog(); loadAuctions(); loadAccounts(); loadRanking(); }
}
function signedOut() { S.auth = null; S.me = null; S.market = null; S.catalog = null; S.auctions = null; S.adminAccounts = null; S.ranking = null; store.del("ml-auth"); }

/* ============================================================
   RENDER
   ============================================================ */
function screen() {
  if (!S.mode) return "home";
  if (S.mode === "market") return "market";
  const st = cur();
  if (S.mode === "online" && !st) return "connecting";
  if (S.mode === "local" && !st) return "room";
  return st.phase === "lobby" ? "room" : st.phase === "playing" ? "live" : "final";
}
function render() {
  const act = document.activeElement, fid = act && act.id, sel = act && act.selectionStart;
  const feed = document.getElementById("feed");
  const feedAtBottom = !feed || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
  const chatDraft = (document.getElementById("chatText") || {}).value || "";
  S.zoom = {};
  if (tipFor) hideTip();   // o elemento do balão vai ser trocado
  const sc = screen();
  let body;
  if (sc === "home") body = renderHome();
  else if (sc === "connecting") body = `<main class="wrap home"><section class="panel"><h2>Conectando à sala ${esc(S.code || S.joinCode)}…</h2><p class="hint">Se demorar, confira sua internet.</p><button class="btn" data-act="leave">Voltar</button></section></main>`;
  else if (sc === "market") body = renderMarket();
  else if (sc === "room") body = renderRoom();
  else if (sc === "live") body = renderLive();
  else body = renderFinal();
  $app.innerHTML = topbar() + body + modalHtml();
  document.body.dataset.screen = sc;
  if (S.lastScreen !== sc) { S.lastScreen = sc; window.scrollTo(0, 0); }
  const ct = document.getElementById("chatText"); if (ct) ct.value = chatDraft;
  const fd = document.getElementById("feed"); if (fd && feedAtBottom) fd.scrollTop = fd.scrollHeight;
  if (fid) { const el = document.getElementById(fid); if (el && el.tagName === "INPUT") { el.focus(); try { if (sel != null && el.type === "text") el.setSelectionRange(sel, sel); } catch (e) {} } }
  renderToast(); tickClocks();
}
function renderToast() {
  let t = document.getElementById("toast");
  if (!S.ui.toast) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.className = "toast" + (S.ui.toast.bad ? " bad" : ""); t.textContent = S.ui.toast.text;
}
function modalHtml() {
  const m = S.ui.modal; if (!m) return "";
  // body pode ser uma função: o conteúdo é montado de novo a cada render, a partir do estado (formulários)
  return `<div class="modal-bg"><div class="modal ${m.cls || ""}" role="dialog" aria-modal="true"><h3>${esc(m.title)}</h3>${typeof m.body === "function" ? m.body() : m.body}<div class="toolbar" style="justify-content:flex-end">${m.actions.map((a, i) => `<button class="btn ${a.cls || ""}" data-modal="${i}">${esc(a.label)}</button>`).join("")}</div></div></div>`;
}
function modal(title, body, actions) { S.ui.modal = { title, body, actions }; render(); }

/* ---------- relógios na tela (barra e segundos) ---------- */
function tickClocks() {
  const t = now();
  document.querySelectorAll(".fill[data-until]").forEach((el) => {
    const from = +el.dataset.from, until = +el.dataset.until;
    const total = Math.max(1, until - from);
    el.style.width = Math.max(0, Math.min(100, ((until - t) / total) * 100)) + "%";
  });
  document.querySelectorAll("span[data-until]").forEach((el) => { el.textContent = Math.max(0, Math.ceil((+el.dataset.until - t) / 1000)) + " s"; });
  // relógios longos (estreias do Mercado): h:mm:ss ou m:ss; nos últimos 30 s ficam vermelhos
  document.querySelectorAll("[data-clock]").forEach((el) => {
    const s = Math.max(0, Math.ceil((+el.dataset.clock - t) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), p = (n) => String(n).padStart(2, "0");
    el.textContent = s ? (h >= 48 ? `${Math.floor(h / 24)} dias` : h ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`) : "agora…";
    el.classList.toggle("hot", s <= MC.extendWindowSec);
  });
  // relógio holandês: o preço cai na tela com a mesma conta do servidor
  document.querySelectorAll("[data-dutch]").forEach((el) => {
    const [start, floor, from, until] = el.dataset.dutch.split("|").map(Number);
    el.textContent = mny(MK.dutchPrice({ startPrice: start, minBid: floor, reserve: 0, startsAt: from, endsAt: until }, t));
  });
}
function loop() { tickClocks(); placeFx(); requestAnimationFrame(loop); }

/* ---------- efeitos ao vivo: alertas, carimbo de vendido, reações ---------- */
const fx = document.createElement("div"); fx.id = "fx"; fx.setAttribute("aria-hidden", "true"); document.body.appendChild(fx);
function placeFx() {
  const stage = document.querySelector(".stage");
  if (!stage) { fx.style.display = "none"; return; }
  const r = stage.getBoundingClientRect();
  fx.style.display = "block";
  fx.style.left = r.left + "px"; fx.style.top = r.top + "px"; fx.style.width = r.width + "px"; fx.style.height = r.height + "px";
}
function fxAlert(pid, big, small, name, color) {
  fx.querySelectorAll(".fx-alert").forEach((x) => x.remove());
  const d = document.createElement("div"); d.className = "fx-alert";
  d.innerHTML = `<span class="avatar" style="background:${color || colorOf(pid)}">${initial(name || nameOf(pid))}</span><div><b>${esc(big)}</b><span>${esc(small)}</span></div>`;
  fx.appendChild(d); setTimeout(() => d.remove(), 3300);
}
function fxStamp(big, small, flat) {
  fx.querySelectorAll(".fx-stamp").forEach((x) => x.remove());
  const d = document.createElement("div"); d.className = "fx-stamp" + (flat ? " flat" : "");
  d.innerHTML = `<b>${esc(big)}</b><span>${esc(small)}</span>`;
  fx.appendChild(d); setTimeout(() => d.remove(), 2700);
}
function fxReact(e) {
  const d = document.createElement("div"); d.className = "fx-react"; d.textContent = e;
  d.style.right = 16 + Math.random() * 90 + "px"; d.style.setProperty("--dx", (Math.random() * 60 - 30).toFixed(0) + "px");
  fx.appendChild(d); setTimeout(() => d.remove(), 2500);
}
function processFx() {
  const st = cur(); if (!st || !st.log) return;
  const top = st.log[0] ? JSON.stringify(st.log[0]) : null;
  if (S.lastTop === null || screen() !== "live") { S.lastTop = top; return; }
  const fresh = [];
  for (const e of st.log) { const k = JSON.stringify(e); if (k === S.lastTop || fresh.length > 6) break; fresh.push(e); }
  S.lastTop = top;
  fresh.reverse().forEach((e) => {
    if (e.k === "bid") fxAlert(e.p, brl(e.v), `${nameOf(e.p)} deu um lance`);
    else if (e.k === "sealed") fxAlert(e.p, "Lance secreto", `${nameOf(e.p)} enviou o dele`);
    else if (e.k === "sold") fxStamp("Vendido!", `${e.title} para ${nameOf(e.p)} por ${brl(e.v)}`);
    else if (e.k === "unsold") fxStamp("Sem lances", e.title, true);
    else if (e.k === "lot") { S.ui.synOpen = false; S.ui.sealedOpen = null; S.ui.bidDraft = null; fx.querySelectorAll(".fx-stamp, .fx-alert").forEach((x) => x.remove()); }
  });
}

/* ---------- donate: cada real a mais muda o alerta; as faixas trocam o visual ---------- */
const DON_TIERS = [
  [1, "🪙", "Doação"], [2, "💵", "Doação em dobro"], [3, "💸", "Chuva de dinheiro"], [5, "🔥", "Doação pegando fogo"],
  [8, "🚀", "Doação foguete"], [10, "💎", "Doação diamante"], [15, "👑", "Doação da realeza"], [20, "🌋", "Erupção de dinheiro"],
  [30, "🤯", "Mega doação"], [50, "☄️", "Doação lendária"], [100, "🏦", "O magnata chegou"]
];
const donTier = (v) => DON_TIERS.reduce((k, t, i) => (v >= t[0] ? i : k), 0);
const donParams = (v) => ({ k: donTier(v), dur: Math.min(4200 + v * 260, 15000), rain: Math.min(4 + (v - 1) * 4, 200), scale: 1 + Math.min(v, 60) * 0.012, shake: v >= 5 ? Math.min(2 + v / 3, 16) : 0 });
const EMOJIS = ["😀", "😂", "🤣", "😍", "🥰", "😎", "🤩", "🥳", "😭", "😱", "😡", "🤯", "🤔", "🙄", "😴", "🤡", "💀", "👻", "🤖", "👍", "👎", "👏", "🙌", "🙏", "💪", "👀", "🔥", "💸", "💰", "💎", "🎬", "🍿", "🎥", "⭐", "🏆", "👑", "❤️", "💔", "🎉", "🚀"];
const onlyEmoji = (t) => /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f\s]+$/u.test(t || "") && Array.from(t.replace(/\s/g, "")).length <= 10;

// sons feitos na hora com Web Audio (sem arquivos); o navegador só libera depois do primeiro toque
const Sound = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, out = null, noiseBuf = null;
  function unlock() {
    if (!AC) return;
    try {
      if (!ctx) { ctx = new AC(); out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination); }
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) {}
  }
  function tone(f, t, len, type, vol, f2) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out); o.start(t); o.stop(t + len + 0.05);
  }
  function noise(t, len, vol, hp) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = "highpass"; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + len + 0.05);
  }
  function donation(v) {
    if (!S.sound || !ctx || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.03, n = Math.min(v, 15), P = [0, 2, 4, 7, 9];
    tone(988, t, 0.1, "square", 0.1); tone(1319, t + 0.08, 0.4, "square", 0.1);                   // moeda
    for (let i = 0; i < n; i++) tone(392 * 2 ** ((P[i % 5] + 12 * Math.floor(i / 5)) / 12), t + 0.3 + i * 0.06, 0.18, "triangle", 0.1); // uma nota por real
    let e = t + 0.3 + n * 0.06;
    if (v >= 5) tone(180, t, 0.6, "sine", 0.5, 40);                                                  // grave
    if (v >= 10) for (let k = 0; k < 3; k++) [349, 440, 523].forEach((f) => tone(f, e + k * 0.26, k === 2 ? 0.7 : 0.2, "sawtooth", 0.05)); // buzina
    if (v >= 20) { e += 1; tone(600, e, 0.7, "sawtooth", 0.04, 1300); tone(1300, e + 0.7, 0.7, "sawtooth", 0.04, 600); } // sirene
    if (v >= 30) { for (let k = 0; k < 20; k++) noise(t + 0.2 + k * 0.05, 0.05, 0.05 + k * 0.01, 800); noise(t + 1.25, 1.4, 0.35, 3000); } // rufar e prato
    if (v >= 50) [523, 659, 784, 1047].forEach((f, i) => tone(f, e + 1.6 + i * 0.12, 0.9 - i * 0.1, "square", 0.06)); // fanfarra
    if (v >= 100) [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, e + 2.3 + i * 0.1, 0.8, "square", 0.05));
  }
  return { unlock, donation };
})();
addEventListener("pointerdown", Sound.unlock, { passive: true });
addEventListener("keydown", Sound.unlock);

function speak(m) {
  if (!S.sound || m.donate < 5 || !window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance(`${m.name} doou ${m.donate} ${m.donate === 1 ? "real" : "reais"}${m.text ? ". " + m.text : ""}`);
    u.lang = "pt-BR"; u.rate = Math.min(1.6, 1 + m.donate / 100); u.pitch = Math.min(2, 1 + m.donate / 60);
    speechSynthesis.cancel(); setTimeout(() => speechSynthesis.speak(u), 900);
  } catch (e) {}
}
function playDonation(m, hurry) {
  const v = m.donate, P = donParams(v), [, emo, title] = DON_TIERS[P.k], color = m.color || colorOf(m.from);
  if (hurry) P.dur = Math.min(P.dur, 3500);
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pool = DON_TIERS.slice(0, P.k + 1).map((t) => t[1]);
  let rain = "";
  if (!calm) for (let i = 0; i < P.rain; i++) rain += `<i style="left:${(Math.random() * 100).toFixed(1)}%;animation-delay:${Math.round(Math.random() * Math.max(400, P.dur - 2400))}ms;animation-duration:${Math.round(1600 + Math.random() * 1800)}ms;font-size:${Math.round(16 + Math.random() * Math.min(10 + v, 40))}px">${pool[Math.floor(Math.random() * pool.length)]}</i>`;
  const d = document.createElement("div");
  d.className = `don-layer k${P.k}`; d.setAttribute("aria-hidden", "true");
  d.style.cssText = `--dur:${P.dur}ms;--scale:${P.scale.toFixed(3)};--lvl:${Math.min(v, 60)};--pc:${color}`;
  d.innerHTML = `${P.k >= 8 ? `<div class="don-dim"></div>` : ""}${P.k >= 9 ? `<div class="don-rays"></div>` : ""}${P.k >= 6 ? `<div class="don-flash"></div>` : ""}<div class="don-rain">${rain}</div>
    <div class="don-card"><div class="don-emo">${emo}</div><div class="don-title">${esc(title)}</div><div class="don-amount num">${brl(v)}</div>
      <div class="don-who"><span class="avatar sm" style="background:${color}">${initial(m.name)}</span><span><b>${esc(m.name)}</b> doou</span></div>
      ${m.text ? `<p class="don-msg">${esc(m.text)}</p>` : ""}</div>`;
  document.body.appendChild(d); setTimeout(() => d.remove(), P.dur);
  if (P.shake && !calm) {
    $app.style.setProperty("--shake", P.shake + "px");
    $app.classList.remove("shaking"); void $app.offsetWidth; $app.classList.add("shaking");
    setTimeout(() => $app.classList.remove("shaking"), Math.min(500 + v * 60, 3000));
  }
  Sound.donation(v); speak(m);
  return P.dur;
}
// um alerta por vez; com fila grande, cada um fica menos tempo na tela
const donQueue = []; let donBusy = false;
function queueDonation(m) { if (donQueue.length < 12) donQueue.push(m); if (!donBusy) nextDonation(); }
function nextDonation() {
  const m = donQueue.shift(); if (!m) { donBusy = false; return; }
  donBusy = true;
  setTimeout(nextDonation, playDonation(m, donQueue.length >= 2) + 250);
}

/* ---------- pôster ampliado ---------- */
const zoomPop = document.createElement("div"); zoomPop.id = "zoomPop"; zoomPop.hidden = true; zoomPop.setAttribute("aria-hidden", "true"); document.body.appendChild(zoomPop);
let zoomKey = null;
function showZoom(key, x, y) {
  const f = S.zoom[key]; if (!f) return hideZoom();
  if (zoomKey !== key) {
    const ri = f.r != null ? { v: f.r, src: f.rsrc || "IMDb" } : C.ratingInfo(f);
    const rate = screen() === "live" ? "Nota revelada no fim" : ri ? `★ ${pts(ri.v)} ${esc(ri.src)}` : "Sem nota"; // na live a nota fica escondida
    zoomPop.innerHTML = `${poster(f)}<span class="t">${esc(f.title)}</span><div class="sub"><span>${esc(f.year || "")}${f.dir ? " · " + esc(f.dir) : ""}</span></div>
      <div class="sub"><span class="rate">${rate}</span>${f.paid ? `<span>Pago ${brl(f.paid)}</span>` : ""}</div>`;
    zoomKey = key;
  }
  zoomPop.hidden = false; zoomPop.style.display = "flex";
  const w = zoomPop.offsetWidth, h = zoomPop.offsetHeight, pad = 12;
  let left = x + 18, top = y - h / 2;
  if (left + w > innerWidth - pad) left = x - w - 18;
  zoomPop.style.left = Math.max(pad, Math.min(left, innerWidth - w - pad)) + "px";
  zoomPop.style.top = Math.max(pad, Math.min(top, innerHeight - h - pad)) + "px";
}
function hideZoom() { zoomPop.hidden = true; zoomPop.style.display = "none"; zoomKey = null; }
document.addEventListener("mousemove", (e) => { const z = e.target.closest && e.target.closest("[data-zoom]"); if (z) showZoom(z.dataset.zoom, e.clientX, e.clientY); else if (zoomKey) hideZoom(); });
document.addEventListener("focusin", (e) => { const z = e.target.closest && e.target.closest("[data-zoom]"); if (z) { const r = z.getBoundingClientRect(); showZoom(z.dataset.zoom, r.right, r.top + r.height / 2); } });
document.addEventListener("focusout", (e) => { if (e.target.closest && e.target.closest("[data-zoom]")) hideZoom(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideZoom(); if (S.ui.modal) { S.ui.modal = null; render(); } } });
addEventListener("scroll", hideZoom, { passive: true });

/* ---------- balões de explicação ([data-tip]) ---------- */
const tipPop = document.createElement("div"); tipPop.id = "tipPop"; tipPop.setAttribute("role", "tooltip"); tipPop.hidden = true; document.body.appendChild(tipPop);
const HOVER = matchMedia("(hover: hover)");
let tipFor = null;
function showTip(el) {
  tipFor = el; tipPop.innerHTML = el.dataset.tip; tipPop.hidden = false;
  tipPop.classList.toggle("wide", "tipWide" in el.dataset);   // balão largo (legenda), que rola no celular
  const r = el.getBoundingClientRect(), w = tipPop.offsetWidth, h = tipPop.offsetHeight, pad = 10;
  let top = r.bottom + 8;
  if (top + h > innerHeight - pad) top = r.top - h - 8;
  tipPop.style.left = Math.max(pad, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - pad)) + "px";
  tipPop.style.top = Math.max(pad, top) + "px";
}
function hideTip() { tipPop.hidden = true; tipFor = null; }
// com mouse: abre em cima e fecha ao sair; no toque: abre e fecha tocando (ou tocando fora)
document.addEventListener("mousemove", (e) => {
  if (!HOVER.matches) return;
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (t) { if (t !== tipFor) showTip(t); } else if (tipFor && !tipPop.contains(e.target)) hideTip();
});
document.addEventListener("focusin", (e) => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t && t.matches(":focus-visible")) showTip(t); });
document.addEventListener("focusout", (e) => { if (e.target.closest && e.target.closest("[data-tip]")) hideTip(); });
document.addEventListener("click", (e) => { if (tipFor && !tipPop.contains(e.target) && !(e.target.closest && e.target.closest("[data-tip]"))) hideTip(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && tipFor) hideTip(); });
addEventListener("scroll", () => { if (tipFor) hideTip(); }, { passive: true });

/* ============================================================
   AÇÕES
   ============================================================ */
let drawTimer = null, drawSeq = 0;
const scheduleDraw = () => { clearTimeout(drawTimer); drawTimer = setTimeout(drawLots, 350); };
async function drawLots() {
  const s = S.setup; if (s.lotMode === "pick") return;
  if (s.lotMode === "genre" && !s.genres.length) { s.draw = []; saveSetup(); return render(); }
  const seq = ++drawSeq;
  S.ui.drawing = true; S.ui.drawMsg = ""; S.ui.showDraw = false; render();
  const res = await C.draw({ mode: s.lotMode, genres: s.genres, tier: s.tier, n: s.lots });
  if (seq !== drawSeq) return;
  s.draw = res.films; saveSetup();
  S.ui.drawing = false;
  S.ui.drawMsg = res.fellBack ? `Sem conexão com o Wikidata. Sorteei do catálogo embutido (${C.BASE.length} filmes).` : res.short ? `Só existem ${res.films.length} filmes com esse filtro e essa popularidade.` : "";
  render();
}
function pushLocalHistory() { S.history.push(JSON.stringify(S.local)); if (S.history.length > 80) S.history.shift(); }
async function doAct(type, amount, pid) {
  if (S.mode === "online") {
    const r = await N.call("game:act", { type, amount });
    if (r && r.error) toast(r.error, true);
    return;
  }
  const before = JSON.stringify(S.local);
  const err = E.act(S.local, pid, { type, amount }, Date.now());
  if (err) return toast(err, true);
  S.history.push(before); if (S.history.length > 80) S.history.shift();
  afterLocal();
}
function afterLocal() { processFx(); saveLocal(); render(); ensureSynopsis(); }
async function setRule(patch) {
  if (!isHost()) return;
  if (S.mode === "online") {
    S.st.settings = E.cleanSettings(patch, S.st.settings); render();
    const r = await N.call("room:settings", patch);
    if (r && r.error) toast(r.error, true);
  } else {
    S.rulesLocal = E.cleanSettings(patch, S.rulesLocal); store.set("ml-rules-local", S.rulesLocal); render();
  }
}
async function startGame() {
  S.ui.err = "";
  const src = lotsForStart();
  if (!src.length) { S.ui.err = S.setup.lotMode === "pick" ? "Escolha pelo menos um filme." : "Sorteie os filmes primeiro."; return render(); }
  if (S.mode === "local") {
    const names = S.setup.localPlayers.map((n) => n.trim()).filter(Boolean);
    const st = E.create(S.rulesLocal);
    for (let i = 0; i < names.length; i++) { const e = E.addPlayer(st, "L" + i, names[i]); if (e) { S.ui.err = e; return render(); } }
    S.ui.preparing = true; render();
    const lots = await C.finalize(src);
    S.ui.preparing = false;
    const e = E.start(st, lots, Date.now());
    if (e) { S.ui.err = e; return render(); }
    S.local = st; S.history = []; S.lastTop = st.log[0] ? JSON.stringify(st.log[0]) : null;
    saveLocal(); render(); ensureSynopsis();
    return;
  }
  S.ui.preparing = true; render();
  const lots = await C.finalize(src);
  const r = await N.call("game:start", { lots });
  S.ui.preparing = false;
  if (r && r.error) { S.ui.err = r.error; toast(r.error, true); }
  render();
}
function ensureSynopsis() {
  const st = cur();
  if (!st || st.phase !== "playing") return;
  const f = st.lots[st.idx]; C.fetchSynopsis(f);
  const nx = st.lots[st.idx + 1]; if (nx) setTimeout(() => C.fetchSynopsis(nx), 1500);
  C.wantPosters(st.lots.slice(st.idx, st.idx + 3));
}
function validName() {
  const el = document.getElementById("nm");
  const nm = (el ? el.value : S.name).trim();
  if (!nm) { S.ui.err = "Digite seu nome primeiro."; render(); document.getElementById("nm")?.focus(); return null; }
  S.name = nm; store.set("ml-name", nm); return nm;
}
async function createRoom() {
  const name = validName(); if (!name) return;
  S.ui.err = ""; S.mode = "online"; S.st = null; S.chat = [];
  N.connect(); render();
  await waitOpen();
  const r = await N.call("room:create", { name, token });
  if (r.error) { S.mode = null; S.ui.err = r.error; return render(); }
  enterRoom(r.code);
  if (!S.setup.draw.length && S.setup.lotMode !== "pick") drawLots();
}
async function joinRoom(watch) {
  const codeEl = document.getElementById("code");
  const code = (codeEl ? codeEl.value : S.joinCode).trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) { S.ui.err = "O código da sala tem 4 letras ou números."; return render(); }
  const name = watch ? (S.name || "Espectador") : validName(); if (!name) return;
  S.ui.err = ""; S.mode = "online"; S.code = code; S.st = null; S.chat = [];
  N.connect(); render();
  await waitOpen();
  const r = await N.call("room:join", { code, name, token, watch: !!watch });
  if (r.error) { S.mode = null; S.code = null; S.ui.err = r.error; return render(); }
  enterRoom(code);
  if (r.watching && !watch) toast("O leilão já começou. Você entrou como espectador.");
}
function waitOpen() {
  return new Promise((res) => {
    if (N.status === "on") return res();
    const t0 = Date.now();
    const iv = setInterval(() => { if (N.status === "on" || Date.now() - t0 > 8000) { clearInterval(iv); res(); } }, 100);
  });
}
function enterRoom(code) {
  S.code = code; store.set("ml-session", { code });
  try { history.replaceState(null, "", "/sala/" + code); } catch (e) {}
  render();
}
async function leave() {
  if (S.mode === "online") { await N.call("room:leave"); store.del("ml-session"); try { history.replaceState(null, "", "/"); } catch (e) {} }
  if (S.mode === "local" && S.local) { S.local = null; store.del("ml-local"); }
  S.mode = null; S.st = null; S.code = null; S.you = null; S.chat = []; S.ui.err = ""; S.joinCode = "";
  render();
}
function copyText(text, msg) {
  const done = () => toast(msg);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast("Não deu para copiar. Selecione e copie: " + text));
  else toast(text);
}

/* ---------- eventos ---------- */
$app.addEventListener("click", async (e) => {
  const b = e.target.closest("button, [data-zoom], [data-tip], [data-rank]"); if (!b) return;
  const d = b.dataset;
  if (d.zoom) { const r = b.getBoundingClientRect(); if (zoomKey === d.zoom) hideZoom(); else showZoom(d.zoom, r.right, r.top + r.height / 2); return; }
  if (d.rank) return openCollection(d.rank);
  if (d.tip != null) { if (tipFor === b && !HOVER.matches) hideTip(); else showTip(b); return; }
  if (d.fold) { S.fold[d.fold] = !S.fold[d.fold]; store.set("ml-fold", S.fold); return render(); }
  if (d.modal != null) { const a = S.ui.modal.actions[+d.modal]; S.ui.modal = null; render(); if (a.run) a.run(); return; }
  if (d.rule) return setRule({ [d.rule]: +d.val });
  if (d.fmt) { const f = rules().formats; const nf = f.includes(d.fmt) ? f.filter((x) => x !== d.fmt) : [...f, d.fmt]; if (!nf.length) return toast("Deixe pelo menos um formato marcado."); return setRule({ formats: nf }); }
  if (d.flag) return setRule({ [d.flag]: !rules()[d.flag] });
  if (d.kick) { const r = await N.call("room:kick", { seat: d.kick }); if (r.error) toast(r.error, true); return; }
  if (d.lotmode) { const ch = S.setup.lotMode !== d.lotmode; S.setup.lotMode = d.lotmode; S.ui.drawMsg = ""; saveSetup(); render(); if (ch && d.lotmode !== "pick") scheduleDraw(); return; }
  if (d.tier) { S.setup.tier = d.tier; saveSetup(); render(); return scheduleDraw(); }
  if (d.genre) { const g = d.genre, s = S.setup; s.genres = s.genres.includes(g) ? s.genres.filter((x) => x !== g) : [...s.genres, g]; saveSetup(); render(); return scheduleDraw(); }
  if (d.pick) { const s = S.setup; s.picked = s.picked.includes(d.pick) ? s.picked.filter((x) => x !== d.pick) : [...s.picked, d.pick]; saveSetup(); return render(); }
  if (d.add != null) { const f = S.ui.search[+d.add]; if (f && !S.setup.custom.some((x) => x.id === f.id)) { S.setup.custom.push(f); S.setup.picked.push(f.id); saveSetup(); C.wantPosters([f]); } return render(); }
  if (d.rmlp != null) { S.setup.localPlayers.splice(+d.rmlp, 1); saveSetup(); return render(); }
  if (d.react) { if (S.mode === "online") N.send("react", { e: d.react }); else fxReact(d.react); return; }
  if (d.quick) { const i = document.getElementById("bidv"); if (i) { i.value = d.quick; S.ui.bidDraft = { lot: cur().idx, v: +d.quick }; i.focus(); } return; }
  if (d.step) { const i = document.getElementById("bidv"); if (!i) return; i.value = Math.min(+i.max, Math.max(+i.min, (+i.value || 0) + +d.step)); S.ui.bidDraft = { lot: cur().idx, v: +i.value }; return; }
  if (d.dstep || d.dquick) {
    S.ui.donate.v = d.dquick ? +d.dquick : donValue() + +d.dstep;
    const i = document.getElementById("donv"); if (i) i.value = donValue();
    return syncDonate();
  }
  if (d.mtab) { S.mtab = d.mtab; store.set("ml-mtab", d.mtab); S.mode = "market"; render(); window.scrollTo(0, 0); return; }
  if (d.acctTab) { S.acct.tab = d.acctTab; S.ui.err = ""; render(); document.getElementById("au-name")?.focus(); return; }
  if (d.catf) { S.ui.catFilter = d.catf; return render(); }
  if (d.view) { const [k, mode] = d.view.split(":"); S.views[k] = mode; store.set("ml-views", S.views); return render(); }
  if (d.list) return openListForm(d.list);
  if (d.lfFormat && listDraft) { listDraft.format = d.lfFormat; listDraft.err = ""; return render(); }
  if (d.lfWhen && listDraft) { listDraft.schedule = d.lfWhen === "later"; return render(); }
  if (d.unlist) {
    const r = await N.call("market:unlist", { id: d.unlist });
    return r.error ? toast(r.error, true) : toast("Anúncio retirado. A cópia continua na sua coleção.");
  }
  if (d.dutchBuy) {
    const r = await N.call("market:bid", { id: d.dutchBuy });
    return r.error ? toast(r.error, true) : toast(`Comprado por ${mny(r.price)}!`);
  }
  if (d.admOpen) return adminCall("admin:openEstreia", { event: d.admOpen }, "Estreia aberta.");
  if (d.admCancel) return adminCall("admin:cancelAuction", { id: d.admCancel }, "Leilão cancelado; os lances voltaram para as carteiras.");
  if (d.admClose) return adminCall("admin:closeAuction", { id: d.admClose }, (r) => (r.result && r.result.winner ? `Encerrada: ${r.result.winnerName} levou por ${mny(r.result.price)}.` : "Encerrada sem lances."));
  if (d.mstep) {
    const i = document.getElementById("mbid-" + d.aid); if (!i) return;
    i.value = Math.max(+i.min, (Math.floor(+i.value) || 0) + +d.mstep); bidDrafts[d.aid] = i.value; return;
  }
  if (d.sell) {
    const c = ((S.market || {}).collection || []).find((x) => x.id === d.sell); if (!c) return;
    return modal(`Vender ${c.film.title} para a Casa?`, `<p class="hint">A Casa paga ${mny(c.buyback)} pela ${esc(c.label)} (${Math.round(MC.buybackPct * 100)}% do valor de referência, ${mny(c.value)}). A cópia volta para o estoque da Casa e pode sair numa próxima estreia.</p>`,
      [{ label: "Ficar com ela" }, { label: `Vender por ${mny(c.buyback)}`, cls: "go", run: async () => {
        const r = await N.call("market:sell", { copy: c.id });
        if (r.error) toast(r.error, true); else toast(`Vendida para a Casa por ${mny(r.price)}.`);
      } }]);
  }
  if (d.emoji) {
    const el = document.getElementById("chatText"); if (!el) return;
    const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? a;
    const val = el.value.slice(0, a) + d.emoji + el.value.slice(z);
    if (val.length > 140) return toast("A mensagem chegou no limite de 140 caracteres.", true);
    el.value = val; el.focus(); el.setSelectionRange(a + d.emoji.length, a + d.emoji.length);
    return;
  }
  if (d.openSealed) { S.ui.sealedOpen = d.openSealed; render(); document.getElementById("bidv")?.focus(); return; }
  if (d.sealed || d.sealed0) { const pid = d.sealed || d.sealed0; const v = d.sealed0 ? 0 : +(document.getElementById("bidv") || {}).value || 0; S.ui.sealedOpen = null; return doAct("sealed", v, pid); }
  if (d.buy) return doAct("buy", 0, d.buy);
  if (d.vote) {
    if (S.mode === "online") { const r = await N.call("game:vote", { target: d.vote }); if (r.error) toast(r.error, true); return; }
    const err = E.vote(S.local, d.voter, d.vote);
    if (err) return toast(err, true);
    saveLocal(); return render();
  }
  if (d.peekMission) {
    const p = pl(d.peekMission);
    return modal(`Missão de ${p.name}`, `<p class="hint">Só ${esc(p.name)} deve olhar.</p>${p.missions.map((m) => `<div class="mission"><span class="seal">🕵️</span><div><p>${esc(m.text)}</p><span class="pts">+${m.pts} pontos se cumprir</span></div></div>`).join("")}`, [{ label: "Esconder", cls: "go" }]);
  }
  switch (d.act) {
    case "home":
      if (screen() === "live") return modal("Sair da transmissão?", `<p class="hint">${S.mode === "online" ? "Você pode voltar depois com o mesmo código, no mesmo lugar." : "O leilão local fica salvo neste aparelho."}</p>`, [{ label: "Continuar aqui" }, { label: "Sair", cls: "go", run: () => { if (S.mode === "local") { S.mode = null; render(); } else leave(); } }]);
      if (S.mode === "local" && !S.local) { S.mode = null; return render(); }
      if (S.mode === "market") { S.mode = null; S.ui.err = ""; render(); return loadShowcase(); }
      return;
    case "create": return createRoom();
    case "market": return openMarket();
    case "market-join": if (!S.me) S.acct.tab = "register"; if (d.after) { S.mtab = d.after; store.set("ml-mtab", d.after); } return openMarket();
    case "market-login": S.acct.tab = "login"; return openMarket();
    case "adm-refresh": return loadAccounts();
    case "adm-season": { const g = document.getElementById("adm-season").value; return adminCall("admin:season", { genre: g }, (r) => `Temporada: ${r.season.genre}.`); }
    case "refill": {
      if (S.catalog) { S.catalog.refilling = true; render(); }
      const r = await N.call("admin:refillCatalog");
      if (r.error) toast(r.error, true); else toast(r.added ? `A Casa cadastrou ${r.added} ${r.added === 1 ? "filme" : "filmes"}.` : "Nenhum filme novo desta vez.");
      return loadCatalog();
    }
    case "logout":
      await N.call("auth:logout");
      signedOut(); return render();
    case "watch": return joinRoom(true);
    case "local":
      S.ui.err = "";
      if (S.local && S.local.phase !== "lobby") return modal("Tem um leilão salvo neste aparelho", `<p class="hint">Lote ${S.local.idx + 1} de ${S.local.lots.length}, com ${S.local.players.map((p) => esc(p.name)).join(", ")}.</p>`,
        [{ label: "Começar outro", run: () => { S.local = null; store.del("ml-local"); S.mode = "local"; render(); drawLots(); } }, { label: "Continuar", cls: "go", run: () => { S.mode = "local"; S.history = []; S.lastTop = null; render(); ensureSynopsis(); } }]);
      S.mode = "local"; S.local = null; render(); if (!S.setup.draw.length && S.setup.lotMode !== "pick") drawLots(); return;
    case "leave": return leave();
    case "copy-link": return copyText(location.origin + "/sala/" + S.code, "Link de convite copiado.");
    case "copy-code": return copyText(S.code, "Código copiado.");
    case "addlp": S.setup.localPlayers.push(""); saveSetup(); render(); document.getElementById("lp-" + (S.setup.localPlayers.length - 1))?.focus(); return;
    case "redraw": return drawLots();
    case "peek": S.ui.showDraw = !S.ui.showDraw; if (S.ui.showDraw) C.wantPosters(S.setup.draw); return render();
    case "pickclear": S.setup.picked = []; saveSetup(); return render();
    case "start": return startGame();
    case "bid": { const st = cur(); const v = +(document.getElementById("bidv") || {}).value; return doAct("bid", v, st.lot.turn); }
    case "pass": return doAct("pass", 0, cur().lot.turn);
    case "next":
      if (S.mode === "online") { const r = await N.call("game:next"); if (r.error) toast(r.error, true); }
      else { const before = JSON.stringify(S.local); if (!E.next(S.local, Date.now())) { S.history.push(before); afterLocal(); } }
      return;
    case "undo": if (S.history.length) { S.local = JSON.parse(S.history.pop()); S.lastTop = null; saveLocal(); render(); } return;
    case "syn": S.ui.synOpen = !S.ui.synOpen; return render();
    case "emoji": S.ui.emojiOpen = !S.ui.emojiOpen; return render();
    case "sound":
      S.sound = !S.sound; store.set("ml-sound", S.sound);
      if (!S.sound && window.speechSynthesis) speechSynthesis.cancel();
      return render();
    case "donate-test": return queueDonation({ donate: donValue(), name: nameOf(S.you), from: S.you, text: S.ui.donate.text.trim() });
    case "donate": {
      if (donateMax() < 1) return toast("Você precisa guardar pelo menos R$ 1 para o leilão.", true);
      const r = await N.call("room:donate", { amount: donValue(), text: S.ui.donate.text });
      if (r.error) return toast(r.error, true);
      S.ui.donate.text = ""; S.ui.donate.v = 1; return render();
    }
    case "close-vote":
      if (S.mode === "online") { const r = await N.call("game:closeVote"); if (r.error) toast(r.error, true); }
      else { const err = E.closeVote(S.local); if (err) toast(err, true); else { saveLocal(); render(); } }
      return;
    case "again":
      if (S.mode === "online") { const r = await N.call("game:lobby"); if (r.error) toast(r.error, true); else drawLots(); }
      else { S.local = null; store.del("ml-local"); render(); drawLots(); }
      return;
  }
});
$app.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = e.target.id;
  if (id === "entryForm") return joinRoom(false);
  if (id === "searchForm") {
    const q = document.getElementById("q").value.trim(); if (!q) return;
    S.ui.searchMsg = "Buscando…"; S.ui.search = []; render();
    try { S.ui.search = await C.searchImdb(q); S.ui.searchMsg = S.ui.search.length ? "" : "Nenhum filme encontrado."; C.wantPosters(S.ui.search); }
    catch (err) { S.ui.searchMsg = "A busca do IMDb não respondeu. Tente de novo ou escolha do catálogo."; }
    return render();
  }
  if (id === "authForm") {
    const a = S.acct, reg = a.tab === "register";
    a.busy = true; S.ui.err = ""; render();
    const r = await N.call(reg ? "auth:register" : "auth:login", { name: a.name, password: a.pass });
    a.busy = false;
    if (r.error) { S.ui.err = r.error; return render(); }
    a.pass = ""; S.auth = r.session; store.set("ml-auth", r.session); S.me = r.me;
    if (!S.name) { S.name = r.me.name; store.set("ml-name", S.name); }
    render(); return refreshMarket();
  }
  if (id === "admGrant") {
    const name = document.getElementById("adm-name").value.trim(), amount = Math.floor(+document.getElementById("adm-amount").value);
    return adminCall("admin:grant", { name, amount }, (r) => `${mny(amount)} para ${r.name}.`);
  }
  if (id && id.startsWith("bidForm-")) {
    const aid = id.slice(8), el = document.getElementById("mbid-" + aid);
    const r = await N.call("market:bid", { id: aid, amount: Math.floor(+(el && el.value)) });
    if (r.error) return toast(r.error, true);
    delete bidDrafts[aid];
    if (r.house) return toast(`A Casa cobriu com ${mny(r.high)}. Dê outro lance: a chance de ela cobrir de novo é menor.`, true);
    const secret = ((S.auctions && S.auctions.players) || []).some((a) => a.id === aid && (a.format === "sealed" || a.format === "vickrey"));
    return toast(secret ? "Lance secreto enviado! Ninguém vê o valor até o fim; ele fica reservado na sua carteira." : "Lance dado! O valor fica reservado até o fim do leilão.");
  }
  if (id === "pwForm") {
    const a = S.acct;
    const r = await N.call("auth:password", { old: a.pwOld, new: a.pwNew });
    if (r.error) return toast(r.error, true);
    a.pwOld = a.pwNew = ""; render(); return toast("Senha trocada. Os outros aparelhos saíram da conta.");
  }
  if (id === "resetForm") {
    const nm = document.getElementById("rs-name").value.trim(); if (!nm) return;
    const r = await N.call("admin:reset", { name: nm });
    if (r.error) return toast(r.error, true);
    return modal(`Senha temporária de ${r.name}`, `<p class="temp-pass num">${esc(r.temp)}</p><p class="hint">Mande para ${esc(r.name)}. Depois de entrar, dá para trocar em "Conta".</p>`,
      [{ label: "Copiar", run: () => copyText(r.temp, "Senha copiada.") }, { label: "Fechar", cls: "go" }]);
  }
  if (id === "chatForm") {
    const el = document.getElementById("chatText"); const text = el.value.trim(); if (!text) return;
    el.value = "";
    const r = await N.call("chat:send", { text, name: S.name });
    if (r.error) { toast(r.error, true); el.value = text; }
  }
});
$app.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.lp != null) { S.setup.localPlayers[+t.dataset.lp] = t.value; saveSetup(); return; }
  if (t.id === "nm") { S.name = t.value; return; }
  const acctField = { "au-name": "name", "au-pass": "pass", "pw-old": "pwOld", "pw-new": "pwNew" }[t.id];
  if (acctField) { S.acct[acctField] = t.value; return; }
  if (t.id === "code") { t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); S.joinCode = t.value; return; }
  if (t.id === "bidv") { const st = cur(); if (st) S.ui.bidDraft = { lot: st.idx, v: +t.value }; }
  if (t.id === "donv") { S.ui.donate.v = +t.value; return syncDonate(); }
  if (t.id && t.id.startsWith("mbid-")) { bidDrafts[t.id.slice(5)] = t.value; return; }
  if (t.id && t.id.startsWith("lf-") && listDraft) {
    const k = t.id.slice(3);
    listDraft[k] = t.type === "checkbox" ? t.checked : t.value;
    if (k === "featured") render();   // o custo muda na hora
  }
  if (t.id === "donText") { S.ui.donate.text = t.value; return; }
});
$app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "cat-genre") { S.ui.catGenre = t.value; return render(); }
  if (t.id === "r-money") return setRule({ money: +t.value });
  if (t.id === "r-max") return setRule({ maxFilms: +t.value });
  if (t.id === "lots-n") { S.setup.lots = Math.max(1, Math.min(200, Math.floor(+t.value) || 1)); saveSetup(); render(); return scheduleDraw(); }
});
$app.addEventListener("keydown", (e) => {
  // item do top do ranking (li com role="button"): Enter ou espaço abre a coleção
  if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.rank && e.target.tagName === "LI") { e.preventDefault(); return openCollection(e.target.dataset.rank); }
  if (e.target.id === "bidv" && e.key === "Enter") {
    e.preventDefault();
    const st = cur(), lot = st && st.lot; if (!lot) return;
    if (lot.format === "classic") doAct("bid", +e.target.value, lot.turn);
    else if (lot.format === "sealed") { const pid = S.mode === "local" ? S.ui.sealedOpen : S.you; S.ui.sealedOpen = null; doAct("sealed", +e.target.value, pid); }
  }
});

/* ---------- rede ---------- */
N.on("state", (d) => {
  const wasPhase = S.st && S.st.phase;
  S.st = d.st; S.you = d.you; S.host = d.host; S.code = d.code; S.viewers = d.viewers;
  if (wasPhase !== "playing" && d.st.phase === "playing") S.lastTop = null;
  processFx(); render(); ensureSynopsis();
});
N.on("chat:history", (list) => { S.chat = list || []; render(); });
N.on("chat", (m) => { S.chat.push(m); if (S.chat.length > 120) S.chat.shift(); render(); if (m.donate) queueDonation(m); });
N.on("react", (r) => fxReact(r.e));
N.on("kicked", () => { store.del("ml-session"); S.mode = null; S.st = null; S.code = null; render(); toast("Você foi removido da sala.", true); });
N.on("market:me", (d) => { S.market = d; S.me = d.me; render(); });
N.on("market:auctions", (d) => { S.auctions = d; if (S.mode === "market") { render(); loadAccounts(); loadRanking(); } });
N.on("market:notice", (d) => toast(d.text));
N.on("auth:out", () => { signedOut(); render(); toast("Sua conta saiu deste aparelho. Entre de novo.", true); });
N.on("status", () => { if (S.mode === "online" || S.mode === "market") { const el = document.querySelector(".topbar .conn"); if (el) el.className = "conn " + N.status; } if (!S.mode) render(); });
N.on("open", async () => { if (!S.mode || (S.mode === "market" && !S.auth)) loadShowcase();
  if (S.auth) { await resumeAuth(); if (S.mode === "market" && S.me) refreshMarket(); }
  if (S.mode === "online" && S.code && S.st) {
    const r = await N.call("room:join", { code: S.code, name: S.name || "Espectador", token });
    if (r.error) { store.del("ml-session"); S.mode = null; S.st = null; render(); toast("A sala não existe mais.", true); }
  }
});
N.on("lost", () => { if (S.mode === "online") toast("Conexão perdida. Reconectando…", true); });

setInterval(() => { if (N.status === "on" && !document.hidden && (screen() === "home" || (S.mode === "market" && !S.me))) loadShowcase(); }, 20000);

/* ---------- loop local (relógios dos lotes no modo mesmo aparelho) ---------- */
setInterval(() => {
  if (S.mode === "local" && S.local && S.local.phase === "playing") {
    if (E.tick(S.local, Date.now())) afterLocal();
  }
}, 200);

/* ---------- prévia animada da tela inicial ---------- */
const DEMO = [["Cibele", 3], ["André", 5], ["Kirito", 6], ["Pinho", 9], ["Kirito", 11]];
let demoI = 0;
setInterval(() => {
  if (screen() !== "home" || document.hidden) return;
  const fill = document.querySelector(".demo-fill");
  if (demoI < DEMO.length) {
    const [n, v] = DEMO[demoI];
    fxAlert(null, brl(v), `${n} deu um lance`, n, E.COLORS[["Cibele", "André", "Kirito", "Pinho"].indexOf(n)]);
    if (fill) { fill.style.transition = "none"; fill.style.width = "100%"; requestAnimationFrame(() => { fill.style.transition = "width 2.2s linear"; fill.style.width = "0%"; }); }
  } else if (demoI === DEMO.length) fxStamp("Vendido!", `${DEMO_FILM.title} para Kirito por ${brl(11)}`);
  demoI = (demoI + 1) % (DEMO.length + 2);
}, 2400);

/* ---------- início ---------- */
C.onUpdate(() => { if (!S.ui.modal) render(); });
C.checkImdb();
C.wantPosters([DEMO_FILM]);
const session = store.get("ml-session");
if (N.available) {
  N.connect();
  if (session && session.code && (!urlCode || urlCode === session.code)) {
    S.mode = "online"; S.code = session.code;
    waitOpen().then(async () => {
      const r = await N.call("room:join", { code: session.code, name: S.name || "Espectador", token });
      if (r.error) { store.del("ml-session"); S.mode = null; S.code = null; try { history.replaceState(null, "", "/"); } catch (e) {} render(); }
      else enterRoom(session.code);
    });
  }
}
if (S.mode === "local" && S.local) ensureSynopsis();
render();
loop();
})();
