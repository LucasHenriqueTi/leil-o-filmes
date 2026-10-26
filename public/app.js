/* ============================================================
   Martelo Live — interface
   Telas: início → sala (regras, jogadores, lotes) → ao vivo → fim da transmissão
   Modos: online (servidor é a autoridade) e local (mesmo aparelho, motor no navegador)
   ============================================================ */
(function () {
"use strict";
const E = window.Engine, C = window.Catalog, N = window.Net;
const $app = document.getElementById("app");
const store = C.store;
const GROUP_TAG = E.GROUP_TAG;

/* ---------- utilidades ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR");
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
  ui: { err: "", showDraw: false, drawing: false, drawMsg: "", search: [], searchMsg: "", preparing: false, sealedOpen: null, synOpen: false, modal: null, toast: null, joining: false },
  lastTop: null, zoom: {}
};
const saveSetup = () => store.set("ml-setup", S.setup);
const saveLocal = () => store.set("ml-local", S.local);
if (S.local && S.local.phase === "lobby") S.local = null;
if (S.local) S.mode = "local";

const cur = () => (S.mode === "online" ? S.st : S.local);
const isHost = () => S.mode === "local" || (!!S.you && S.you === S.host);
const now = () => (S.mode === "online" ? N.now() : Date.now());
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
const scoreChip = (f) => { const r = C.ratingInfo(f); return r ? `<span class="chip score">★ ${pts(r.v)} ${esc(r.src)}</span>` : ""; };

/* ---------- ícones ---------- */
const eye = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const FMT_ICON = { classic: "🔨", sealed: "✉️", dutch: "⏱️" };

/* ============================================================
   TOPO
   ============================================================ */
function topbar() {
  const st = cur();
  const live = st && st.phase === "playing";
  const online = S.mode === "online";
  return `<header class="topbar"><div class="wrap">
    <button class="brand" data-act="home" aria-label="Martelo Live, voltar ao início"><span class="word">martelo</span><span class="onair ${live ? "" : "idle"}">${live ? "AO VIVO" : "live"}</span></button>
    <span class="spacer"></span>
    ${online && S.code ? `<span class="chip-code">Sala <b>${esc(S.code)}</b><button data-act="copy-link">Copiar convite</button></span>
      <span class="viewers num" title="Pessoas conectadas na sala">${eye}${S.viewers}</span>` : ""}
    ${S.mode === "local" ? `<span class="hint">Mesmo aparelho</span>` : ""}
    ${online ? `<span class="conn ${N.status}" title="${{ on: "Conectado", connecting: "Reconectando…", unavailable: "Servidor indisponível", off: "Desconectado" }[N.status]}"></span>` : ""}
  </div></header>`;
}

/* ============================================================
   INÍCIO
   ============================================================ */
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
        </form>
      </div>
      <div class="stage demo" aria-label="Prévia de um lote ao vivo">
        <div class="backdrop">${C.posterOf(DEMO_FILM) ? `<img src="${esc(C.posterOf(DEMO_FILM))}" alt="" referrerpolicy="no-referrer">` : ""}</div>
        <div class="hud top"><span class="onair">AO VIVO</span><span class="tag">Lote 3 de 10</span><span class="tag fmt-tag">🔨 Aberto</span></div>
        <div class="content">${poster(DEMO_FILM)}
          <div class="info"><h2 class="title">${esc(DEMO_FILM.title)}</h2><div class="orig">${esc(DEMO_FILM.orig)} (${DEMO_FILM.year})</div>
            <div class="chips">${scoreChip(DEMO_FILM)}<span class="chip">${esc(DEMO_FILM.dir)}</span><span class="chip">Ficção científica</span></div>
            <p class="synopsis">Um ladrão que invade sonhos recebe a missão inversa: plantar uma ideia na mente de alguém. Quanto mais fundo a equipe desce, mais difícil fica saber o que é real.</p></div></div>
        <div class="scrub"><div class="track"><div class="fill demo-fill"></div></div></div>
      </div>
    </section>
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
        <div class="fmt extra"><span class="ico">⭐</span><b>Pontuação</b><p>Cada filme vale a nota dele no IMDb (ou Metacritic e Rotten Tomatoes). Empate vai para quem guardou mais dinheiro.</p></div>
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
  return `<section class="panel">
    <div class="panel-head"><h2>Regras</h2>${ro ? `<span class="hint">Definidas por ${esc(nameOf(S.host))}</span>` : ""}</div>
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
    <div class="field"><span class="label">Próximo lote</span>${seg("autoNextSeconds", [[0, "Quando o host mandar"], [5, "Sozinho em 5 s"], [8, "Em 8 s"], [15, "Em 15 s"]], r.autoNextSeconds, ro)}</div>
  </section>`;
}
function playersPanel() {
  if (S.mode === "local") {
    const list = S.setup.localPlayers.map((n, i) => `<div class="prow"><span class="avatar sm" style="background:${E.COLORS[i % E.COLORS.length]}">${initial(n)}</span>
      <input class="input" id="lp-${i}" data-lp="${i}" value="${esc(n)}" maxlength="18" placeholder="Jogador ${i + 1}">
      <button class="x" data-rmlp="${i}" aria-label="Remover jogador" ${S.setup.localPlayers.length <= 2 ? "disabled" : ""}>×</button></div>`).join("");
    return `<section class="panel"><div class="panel-head"><h2>Jogadores</h2><span class="hint num">${S.setup.localPlayers.length} de ${E.MAX_PLAYERS}</span></div>
      <div class="plist">${list}</div>
      <button class="btn ghost" data-act="addlp" ${S.setup.localPlayers.length >= E.MAX_PLAYERS ? "disabled" : ""}>Adicionar jogador</button>
      <p class="hint">Todos jogam neste aparelho, passando a vez. No Lance secreto, cada um digita escondido.</p></section>`;
  }
  const st = S.st, link = location.origin + "/sala/" + S.code;
  const rows = st.players.map((p) => `<div class="prow"><span class="avatar sm" style="background:${p.color}">${initial(p.name)}</span>
    <span class="nm">${esc(p.name)}${p.id === S.you ? " (você)" : ""}</span>
    ${p.id === S.host ? `<span class="crown" title="Comanda a sala">♛</span>` : ""}
    <span class="conn ${p.connected ? "on" : ""}" title="${p.connected ? "Conectado" : "Desconectado"}"></span>
    ${isHost() && p.id !== S.you ? `<button class="x" data-kick="${p.id}" aria-label="Remover ${esc(p.name)}">×</button>` : ""}</div>`).join("");
  return `<section class="panel">
    <div class="invite"><span class="hint">Código da sala</span><span class="code">${esc(S.code)}</span>
      <span class="link">${esc(link)}</span>
      <div class="toolbar"><button class="btn" data-act="copy-link">Copiar link de convite</button><button class="btn ghost" data-act="copy-code">Copiar código</button></div></div>
    <div class="panel-head"><h2>Na sala</h2><span class="hint num">${st.players.length} de ${E.MAX_PLAYERS}</span></div>
    <div class="plist">${rows}</div>
    ${S.you ? "" : `<p class="hint">Você está assistindo. Lances ficam com quem entrou como jogador.</p>`}
  </section>`;
}
function lotsPanel() {
  const s = S.setup, u = S.ui;
  if (S.mode === "online" && !isHost()) {
    return `<section class="panel"><h2>Lotes</h2><div class="curtain"><div><b>Filmes escondidos</b><p>${esc(nameOf(S.host))} está montando os lotes. Cada filme só aparece quando o lote dele entrar no ar.</p></div></div></section>`;
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
  return `<section class="panel"><h2>Lotes</h2>
    <div class="modes">${modeBtn("random", "Aleatório", "Sorteia de milhares")}${modeBtn("genre", "Por categoria", "Sorteia dos gêneros escolhidos")}${modeBtn("pick", "Escolher", "Você marca cada filme")}</div>
    ${body}</section>`;
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
    <div class="col">${playersPanel()}</div>
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
        <div class="chips">${scoreChip(f)}${f.year ? `<span class="chip">${esc(f.year)}</span>` : ""}${f.dir ? `<span class="chip">${esc(f.dir)}</span>` : ""}${genres.map((g) => `<span class="chip">${esc(g)}</span>`).join("")}${f.by ? `<span class="chip">Indicado por ${esc(f.by)}</span>` : ""}</div>
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
    market = `<section class="panel"><div class="panel-head"><h2>Bolsa de gêneros</h2><span class="hint">Top 3 vale +3, +2 e +1 por filme</span></div>
      ${rows.length ? `<div class="ticker">${rows.map((m, i) => `<div class="tick ${m.bonus ? "hot" : ""}"><b>${esc(m.genre)}</b><span class="num">${m.count} ${m.count === 1 ? "filme" : "filmes"}</span>${m.bonus ? `<em>+${m.bonus} por filme</em>` : ""}</div>`).join("")}</div>` : `<p class="hint">Nenhum filme vendido ainda. O gênero principal de cada compra entra na bolsa.</p>`}</section>`;
  }
  if (r.missions) {
    const me = S.you && pl(S.you);
    if (S.mode === "online" && me) {
      mission = `<section class="panel"><h2>Sua missão secreta</h2>${me.missions.map((m) => `<div class="mission"><span class="seal">🕵️</span><div><p>${esc(m.text)}</p><span class="pts">+${m.pts} pontos se cumprir</span></div></div>`).join("")}</section>`;
    } else if (S.mode === "local") {
      mission = `<section class="panel"><h2>Missões secretas</h2><p class="hint">Cada jogador tem uma. Use "Ver missão secreta" no seu cartão, com os outros sem olhar.</p></section>`;
    } else mission = `<section class="panel"><h2>Missões secretas</h2><p class="hint">Reveladas no fim da transmissão.</p></section>`;
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
  if (S.mode === "online") S.chat.forEach((m) => items.push({ at: m.at, html: m.from === null && !m.watcher ? `<div class="sys"><span>${esc(m.text)}</span></div>` : `<div class="msg ${m.watcher ? "watcher" : ""}"><span class="n" style="color:${m.from ? colorOf(m.from) : "var(--mute)"}">${esc(m.name)}</span>${esc(m.text)}</div>` }));
  items.sort((a, b) => a.at - b.at);
  const reacts = ["🔥", "😱", "😂", "💸", "🍿", "👏", "🤡", "💀"].map((e) => `<button type="button" data-react="${e}" aria-label="Reagir com ${e}">${e}</button>`).join("");
  return `<aside class="side" aria-label="Chat ao vivo">
    <div class="head"><b>Chat ao vivo</b>${S.mode === "online" ? `<span class="viewers num">${eye}${S.viewers}</span>` : ""}</div>
    <div class="feed" id="feed">${items.map((i) => i.html).join("") || `<p class="hint">${S.mode === "online" ? "Mande um oi para a galera." : "Os lances aparecem aqui."}</p>`}</div>
    <div class="reacts">${reacts}</div>
    ${S.mode === "online" ? `<form class="compose" id="chatForm" autocomplete="off"><input class="input" id="chatText" maxlength="140" placeholder="Escreva no chat"><button class="btn" type="submit">Enviar</button></form>` : `<div style="height:12px"></div>`}
  </aside>`;
}
function renderLive() {
  const st = cur();
  return `<main class="wrap live"><div class="main">${stagePanel(st)}${deckPanel(st)}${extrasPanel(st)}${crewPanel(st)}</div>${sidePanel()}</main>`;
}

/* ============================================================
   FIM DA TRANSMISSÃO
   ============================================================ */
function renderFinal() {
  const st = cur(), sc = E.scores(st), r = st.settings;
  const top = sc[0], winner = pl(top.id);
  const mk = r.market ? E.market(st) : [];
  const cards = sc.map((row, i) => {
    const p = pl(row.id);
    const cols = [["Notas", pts(row.ratings)]];
    if (r.market) cols.push(["Mercado", "+" + row.market]);
    if (r.missions) cols.push(["Missões", "+" + row.missionPts]);
    cols.push(["Total", pts(row.total)]);
    return `<article class="stand" style="--pc:${p.color}">
      <div class="head"><span class="rank num">${i + 1}º</span><span class="avatar" style="background:${p.color}">${initial(p.name)}</span><h3>${esc(p.name)}</h3><span class="hint num">sobrou ${brl(p.money)}</span></div>
      <div class="breakdown" style="grid-template-columns:repeat(${cols.length},minmax(0,1fr))">${cols.map(([l, v], k) => `<div class="${k === cols.length - 1 ? "total" : ""}"><span>${l}</span><b class="num">${v}</b></div>`).join("")}</div>
      ${p.films.length ? `<div class="coll">${p.films.map((f) => { const ri = f.r != null ? { v: f.r, src: f.rsrc || "IMDb" } : null; return `<div class="item"><div style="width:40px">${zoomable(f)}</div><div class="t">${esc(f.title)}<small>${ri ? `★ ${pts(ri.v)} ${esc(ri.src)}` : "sem nota"}${f.year ? ` · ${esc(f.year)}` : ""}</small></div><span class="paid num">${brl(f.paid)}</span></div>`; }).join("")}</div>` : `<p class="empty">Não arrematou nenhum filme.</p>`}
      ${r.missions ? `<div class="mis-list">${row.missions.map((m) => `<div><span class="${m.ok ? "ok" : "no"}">${m.ok ? "✓" : "✗"}</span><span>${esc(m.text)} ${m.ok ? `(+${m.pts})` : ""}</span></div>`).join("")}</div>` : ""}
    </article>`;
  }).join("");
  const unsold = st.results.filter((x) => !x.by);
  const actions = isHost()
    ? `<button class="btn go big" data-act="again">Nova rodada com a mesma galera</button><button class="btn quiet" data-act="leave">Sair</button>`
    : `<p class="hint">Aguardando ${esc(nameOf(S.host))} abrir outra rodada.</p><button class="btn quiet" data-act="leave">Sair</button>`;
  const main = `<div class="main final">
    <section class="champion"><span class="avatar" style="background:${winner.color}">${initial(winner.name)}</span>
      <div><h1>${esc(winner.name)} venceu o leilão</h1><p class="num">${pts(top.total)} pontos com ${winner.films.length} ${winner.films.length === 1 ? "filme" : "filmes"}. Empate vai para quem guardou mais dinheiro.</p></div></section>
    <div class="standings">${cards}</div>
    ${r.market && mk.length ? `<section class="panel"><h2>Bolsa de gêneros no fechamento</h2><div class="ticker">${mk.map((m) => `<div class="tick ${m.bonus ? "hot" : ""}"><b>${esc(m.genre)}</b><span class="num">${m.count} ${m.count === 1 ? "filme" : "filmes"}</span>${m.bonus ? `<em>+${m.bonus} por filme</em>` : ""}</div>`).join("")}</div></section>` : ""}
    ${unsold.length ? `<section class="panel"><h2>Ficaram sem dono</h2><div class="chips" style="display:flex;flex-wrap:wrap;gap:6px">${unsold.map((x) => `<span class="chip">${esc(x.title)}</span>`).join("")}</div></section>` : ""}
    <div class="toolbar">${actions}</div>
  </div>`;
  return `<main class="wrap live">${main}${sidePanel()}</main>`;
}

/* ============================================================
   RENDER
   ============================================================ */
function screen() {
  if (!S.mode) return "home";
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
  const sc = screen();
  let body;
  if (sc === "home") body = renderHome();
  else if (sc === "connecting") body = `<main class="wrap home"><section class="panel"><h2>Conectando à sala ${esc(S.code || S.joinCode)}…</h2><p class="hint">Se demorar, confira sua internet.</p><button class="btn" data-act="leave">Voltar</button></section></main>`;
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
  return `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true"><h3>${esc(m.title)}</h3>${m.body}<div class="toolbar" style="justify-content:flex-end">${m.actions.map((a, i) => `<button class="btn ${a.cls || ""}" data-modal="${i}">${esc(a.label)}</button>`).join("")}</div></div></div>`;
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

/* ---------- pôster ampliado ---------- */
const zoomPop = document.createElement("div"); zoomPop.id = "zoomPop"; zoomPop.hidden = true; zoomPop.setAttribute("aria-hidden", "true"); document.body.appendChild(zoomPop);
let zoomKey = null;
function showZoom(key, x, y) {
  const f = S.zoom[key]; if (!f) return hideZoom();
  if (zoomKey !== key) {
    const ri = f.r != null ? { v: f.r, src: f.rsrc || "IMDb" } : C.ratingInfo(f);
    zoomPop.innerHTML = `${poster(f)}<span class="t">${esc(f.title)}</span><div class="sub"><span>${esc(f.year || "")}${f.dir ? " · " + esc(f.dir) : ""}</span></div>
      <div class="sub"><span class="rate">${ri ? `★ ${pts(ri.v)} ${esc(ri.src)}` : "Sem nota"}</span>${f.paid ? `<span>Pago ${brl(f.paid)}</span>` : ""}</div>`;
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
  const b = e.target.closest("button, [data-zoom]"); if (!b) return;
  const d = b.dataset;
  if (d.zoom) { const r = b.getBoundingClientRect(); if (zoomKey === d.zoom) hideZoom(); else showZoom(d.zoom, r.right, r.top + r.height / 2); return; }
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
  if (d.openSealed) { S.ui.sealedOpen = d.openSealed; render(); document.getElementById("bidv")?.focus(); return; }
  if (d.sealed || d.sealed0) { const pid = d.sealed || d.sealed0; const v = d.sealed0 ? 0 : +(document.getElementById("bidv") || {}).value || 0; S.ui.sealedOpen = null; return doAct("sealed", v, pid); }
  if (d.buy) return doAct("buy", 0, d.buy);
  if (d.peekMission) {
    const p = pl(d.peekMission);
    return modal(`Missão de ${p.name}`, `<p class="hint">Só ${esc(p.name)} deve olhar.</p>${p.missions.map((m) => `<div class="mission"><span class="seal">🕵️</span><div><p>${esc(m.text)}</p><span class="pts">+${m.pts} pontos se cumprir</span></div></div>`).join("")}`, [{ label: "Esconder", cls: "go" }]);
  }
  switch (d.act) {
    case "home":
      if (screen() === "live") return modal("Sair da transmissão?", `<p class="hint">${S.mode === "online" ? "Você pode voltar depois com o mesmo código, no mesmo lugar." : "O leilão local fica salvo neste aparelho."}</p>`, [{ label: "Continuar aqui" }, { label: "Sair", cls: "go", run: () => { if (S.mode === "local") { S.mode = null; render(); } else leave(); } }]);
      if (S.mode === "local" && !S.local) { S.mode = null; return render(); }
      return;
    case "create": return createRoom();
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
  if (t.id === "code") { t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); S.joinCode = t.value; return; }
  if (t.id === "bidv") { const st = cur(); if (st) S.ui.bidDraft = { lot: st.idx, v: +t.value }; }
});
$app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "r-money") return setRule({ money: +t.value });
  if (t.id === "r-max") return setRule({ maxFilms: +t.value });
  if (t.id === "lots-n") { S.setup.lots = Math.max(1, Math.min(200, Math.floor(+t.value) || 1)); saveSetup(); render(); return scheduleDraw(); }
});
$app.addEventListener("keydown", (e) => {
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
N.on("chat", (m) => { S.chat.push(m); if (S.chat.length > 120) S.chat.shift(); render(); });
N.on("react", (r) => fxReact(r.e));
N.on("kicked", () => { store.del("ml-session"); S.mode = null; S.st = null; S.code = null; render(); toast("Você foi removido da sala.", true); });
N.on("status", () => { if (S.mode === "online") { const el = document.querySelector(".topbar .conn"); if (el) el.className = "conn " + N.status; } if (!S.mode) render(); });
N.on("open", async () => {
  if (S.mode === "online" && S.code && S.st) {
    const r = await N.call("room:join", { code: S.code, name: S.name || "Espectador", token });
    if (r.error) { store.del("ml-session"); S.mode = null; S.st = null; render(); toast("A sala não existe mais.", true); }
  }
});
N.on("lost", () => { if (S.mode === "online") toast("Conexão perdida. Reconectando…", true); });

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
