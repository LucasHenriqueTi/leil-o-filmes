/* ============================================================
   Martelo Live — busca de filmes para o Mercado (só no servidor)
   O servidor busca e congela as notas: ninguém consegue forjar a raridade pelo navegador.
   - Wikidata (SPARQL): sorteio, título, ano, diretor, gêneros e notas P444
     (IMDb Q37312, Metacritic Q150248, Rotten Tomatoes Q105584).
   - Wikipédia (pageimages): pôster, primeiro em português, depois em inglês.
   - IMDb (datasets.imdbws.com, arquivo oficial de notas): a nota do IMDb, que quase sumiu do Wikidata.
   Usa o fetch do Node, sem dependências.
   ============================================================ */
const zlib = require("zlib");
const Market = require("../public/market.js");

const UA = "MarteloLive/1.0 (leilao de filmes entre amigos; https://github.com/LucasHenriqueTi/leil-o-filmes)";
const SPARQL = "https://query.wikidata.org/sparql";
const BY = { Q37312: "imdb", Q150248: "metacritic", Q105584: "rt" };
const qidOf = (uri) => String(uri).split("/").pop();
const wikiTitle = (url) => decodeURIComponent(String(url).split("/wiki/")[1] || "").replace(/_/g, " ");
const val = (b, k) => (b[k] ? b[k].value : "");

// o Wikidata às vezes devolve 502/503/429 por alguns segundos: tenta de novo antes de desistir
async function getJSON(url, ms, tries = 3) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(ms || 30000) });
    if (r.ok) return r.json();
    if (i >= tries || !(r.status === 429 || r.status >= 500)) throw new Error(`HTTP ${r.status} em ${new URL(url).host}`);
    await new Promise((res) => setTimeout(res, 1500 * i));
  }
}
const sparql = (q, ms) => getJSON(SPARQL + "?format=json&query=" + encodeURIComponent(q), ms).then((d) => d.results.bindings);

/* ---------- sorteio: filmes com fama mínima e que já têm notas suficientes ---------- */
// O filtro de notas vai na própria consulta: só volta quem pode entrar no Mercado
// (cerca de 6 mil filmes, em uns 10 s). Quem tem 1 nota só entra pelo `include` das correções.
let pool = null;
async function loadPool(minLinks, minScores) {
  if (pool && pool.min === minLinks && pool.scores === minScores) return pool.rows;
  const rows = await sparql(`SELECT ?imdb ?links WHERE {
    ?item wdt:P31 wd:Q11424 ; wikibase:sitelinks ?links . FILTER(?links >= ${Math.floor(minLinks)})
    ?item wdt:P345 ?imdb . ?item p:P444 ?st . ?st pq:P447 ?by .
    VALUES ?by { wd:Q37312 wd:Q150248 wd:Q105584 }
  } GROUP BY ?imdb ?links HAVING(COUNT(DISTINCT ?by) >= ${Math.floor(minScores)})`, 90000);
  const seen = new Set();
  pool = { min: minLinks, scores: minScores, rows: rows.map((b) => ({ imdb: val(b, "imdb"), links: +val(b, "links") })).filter((r) => /^tt\d+$/.test(r.imdb) && !seen.has(r.imdb) && seen.add(r.imdb)) };
  return pool.rows;
}

/* ---------- tags que vêm do Wikidata ---------- */
// Oscars por família (prêmio P166 no filme). Direção fica de fora: o Wikidata registra esse prêmio no diretor;
// Animação também, porque quase nenhum filme tem. As versões antigas (em cores, preto e branco…) entram na família.
const OSCAR_FAMILIES = {
  filme: ["Q102427"],
  atuacao: ["Q103916", "Q103618", "Q106291", "Q106301"],
  roteiro: ["Q41417", "Q107258", "Q22117120"],
  musica: ["Q488651", "Q112243", "Q4671338", "Q22752868", "Q22752811", "Q22344608", "Q22235329", "Q22235305", "Q22752734"],
  visual: ["Q131520", "Q21995136", "Q21995139", "Q277751", "Q22253133", "Q22253131", "Q277536", "Q22120095", "Q22120066", "Q487136", "Q393686", "Q22917729", "Q3886463"],
  tecnica: ["Q281939", "Q830079"],
  internacional: ["Q105304"]
};
const AWARD_FAMILY = Object.fromEntries(Object.entries(OSCAR_FAMILIES).flatMap(([fam, qs]) => qs.map((q) => [q, fam])));
const awardValues = (qs) => qs.map((q) => "wd:" + q).join(" ");
// "…/Q103916|…/Q41417" -> ["atuacao", "roteiro"] (na ordem de OSCAR_FAMILIES)
function oscarFamilies(list) {
  const got = new Set(String(list || "").split("|").map((u) => AWARD_FAMILY[qidOf(u)]).filter(Boolean));
  return Object.keys(OSCAR_FAMILIES).filter((k) => got.has(k));
}
// cinema nacional: país de origem (P495) Brasil (Q155)
const NACIONAL = "?item wdt:P495 wd:Q155 .";
const FACTS = `OPTIONAL { ?item wdt:P166 ?aw . VALUES ?aw { ${awardValues(Object.keys(AWARD_FAMILY))} } } BIND(IF(EXISTS { ${NACIONAL} }, 1, 0) AS ?br)`;
const FACTS_SELECT = `(GROUP_CONCAT(DISTINCT ?aw; separator="|") AS ?awards) (MAX(?br) AS ?nac)`;
// tipos de sorteio: "nacional" e "oscar:<família>"
function tagWhere(kind) {
  if (kind === "nacional") return NACIONAL;
  const fam = kind.startsWith("oscar:") && OSCAR_FAMILIES[kind.slice(6)];
  return fam ? `?item wdt:P166 ?aw . VALUES ?aw { ${awardValues(fam)} }` : "";
}
// filmes com a tag que já têm notas suficientes: a Casa sorteia alguns a cada rodada
const tagPools = {};
async function loadTagPool(kind, minScores) {
  const where = tagWhere(kind);
  if (!where) return [];
  if (tagPools[kind]) return tagPools[kind];
  const rows = await sparql(`SELECT ?imdb WHERE {
    ?item wdt:P31 wd:Q11424 ; wdt:P345 ?imdb . ${where}
    ?item p:P444 ?st . ?st pq:P447 ?by . VALUES ?by { wd:Q37312 wd:Q150248 wd:Q105584 }
  } GROUP BY ?imdb HAVING(COUNT(DISTINCT ?by) >= ${Math.floor(minScores)})`, 60000);
  return (tagPools[kind] = [...new Set(rows.map((b) => val(b, "imdb")).filter((x) => /^tt\d+$/.test(x)))]);
}
// só as tags (para completar filmes cadastrados antes de elas existirem)
async function fetchFacts(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await sparql(`SELECT ?imdb ${FACTS_SELECT} WHERE { VALUES ?imdb { ${imdbValues(ids.slice(i, i + 100))} } ?item wdt:P345 ?imdb . ${FACTS} } GROUP BY ?imdb`);
    rows.forEach((b) => (out[val(b, "imdb")] = { oscars: oscarFamilies(val(b, "awards")), nacional: val(b, "nac") === "1" }));
  }
  return out;
}

/* ---------- detalhes: duas consultas por lote (dados do filme e notas) ---------- */
const imdbValues = (ids) => ids.filter((x) => /^tt\d+$/.test(x)).map((x) => `"${x}"`).join(" ");
const infoQuery = (ids) => `SELECT ?imdb (MAX(?l) AS ?links) (SAMPLE(?ptbr) AS ?tptbr) (SAMPLE(?pt) AS ?tpt) (SAMPLE(?en) AS ?ten)
  (MIN(?date) AS ?d) (SAMPLE(?dirName) AS ?dir) (GROUP_CONCAT(DISTINCT ?gName; separator="|") AS ?genres)
  (SAMPLE(?ptA) AS ?ptArt) (SAMPLE(?enA) AS ?enArt) (SAMPLE(?serPt) AS ?seriesPt) (SAMPLE(?serEn) AS ?seriesEn) ${FACTS_SELECT} WHERE {
  VALUES ?imdb { ${imdbValues(ids)} }
  ?item wdt:P345 ?imdb ; wikibase:sitelinks ?l .
  ${FACTS}
  OPTIONAL { ?item rdfs:label ?ptbr FILTER(LANG(?ptbr) = "pt-br") }
  OPTIONAL { ?item rdfs:label ?pt FILTER(LANG(?pt) = "pt") }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item wdt:P577 ?date }
  OPTIONAL { ?item wdt:P57 ?dirI . ?dirI rdfs:label ?dirName FILTER(LANG(?dirName) = "en") }
  OPTIONAL { ?item wdt:P136 ?gI . ?gI rdfs:label ?gName FILTER(LANG(?gName) = "pt") }
  OPTIONAL { ?item wdt:P179 ?ser . ?ser wdt:P31/wdt:P279* wd:Q24856 . OPTIONAL { ?ser rdfs:label ?serPt FILTER(LANG(?serPt) = "pt") } OPTIONAL { ?ser rdfs:label ?serEn FILTER(LANG(?serEn) = "en") } }
  OPTIONAL { ?ptA schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> }
  OPTIONAL { ?enA schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
} GROUP BY ?imdb`;
const scoreQuery = (ids) => `SELECT ?imdb ?by ?score ?when WHERE {
  VALUES ?imdb { ${imdbValues(ids)} }
  VALUES ?by { wd:Q37312 wd:Q150248 wd:Q105584 }
  ?item wdt:P345 ?imdb . ?item p:P444 ?st . ?st ps:P444 ?score ; pq:P447 ?by .
  OPTIONAL { ?st pq:P585 ?when } }`;

// "filme de terror" -> "Terror"; "filme sobre crimes" -> "Crimes"
const genreName = (g) => { const s = g.replace(/^filmes? (de |do |da |sobre |)/i, "").replace(/^sobre /i, "").trim(); return s ? s[0].toUpperCase() + s.slice(1) : ""; };
// Uma nota por fonte: a de data mais recente; sem data, a maior.
// No Rotten Tomatoes, o Tomatometer (%) tem preferência sobre a média x/10.
function pickScores(rows) {
  const best = {};
  for (const r of rows) {
    const src = BY[qidOf(r.by)], v = Market.parseScore(r.score);
    if (!src || v == null) continue;
    const c = { v, when: r.when || "", pct: /%/.test(r.score) };
    const cur = best[src];
    const better = !cur || (src === "rt" && c.pct !== cur.pct ? c.pct : c.when !== cur.when ? c.when > cur.when : c.v > cur.v);
    if (better) best[src] = c;
  }
  const out = {};
  Object.entries(best).forEach(([k, c]) => (out[k] = c.v));
  return out;
}
// Monta os filmes a partir das respostas do SPARQL (pura, testada sem rede)
function fromSparql(info, scores) {
  const byImdb = {};
  scores.forEach((b) => (byImdb[val(b, "imdb")] = byImdb[val(b, "imdb")] || []).push({ by: val(b, "by"), score: val(b, "score"), when: val(b, "when") }));
  return info.map((b) => {
    const id = val(b, "imdb"), en = val(b, "ten");
    const ptArt = val(b, "ptArt"), enArt = val(b, "enArt");
    // título no Brasil: rótulo pt-BR; senão o artigo da Wikipédia em português (sem "(filme)"),
    // que costuma ter o nome brasileiro mesmo quando o rótulo "pt" ficou em inglês
    const ptWiki = ptArt ? wikiTitle(ptArt).replace(/\s*\([^)]*\)\s*$/, "") : "";
    const title = val(b, "tptbr") || ptWiki || val(b, "tpt") || en || id;
    return {
      id, title, orig: en && en !== title ? en : "", year: (val(b, "d").match(/^-?(\d{4})/) || [])[1] || "",
      dir: val(b, "dir"), g: [...new Set(val(b, "genres").split("|").map(genreName).filter(Boolean))].slice(0, 6),
      links: +val(b, "links") || 0, scores: pickScores(byImdb[id] || []),
      series: val(b, "seriesPt") || val(b, "seriesEn"),   // série (P179): para o bônus de trilogia
      oscars: oscarFamilies(val(b, "awards")), nacional: val(b, "nac") === "1",
      wiki: ptArt ? wikiTitle(ptArt) : enArt ? wikiTitle(enArt) : "",
      articles: { pt: ptArt ? wikiTitle(ptArt) : "", en: enArt ? wikiTitle(enArt) : "" }
    };
  }).filter((f) => /^tt\d+$/.test(f.id));
}

/* ---------- pôsteres (Wikipédia, pageimages) ---------- */
const POSTER_OK = /^https:\/\/upload\.wikimedia\.org\//;
async function pageImages(lang, titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const d = await getJSON(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=500&pilicense=any&titles=` + encodeURIComponent(chunk.join("|")));
    const q = d.query || {}, map = {};
    (q.normalized || []).forEach((n) => (map[n.from] = n.to));
    (q.redirects || []).forEach((n) => (map[n.from] = n.to));
    const pages = Object.values(q.pages || {});
    chunk.forEach((title) => {
      let t = title, k = 0; while (map[t] && k++ < 3) t = map[t];
      const p = pages.find((x) => x.title === t), src = p && p.thumbnail && p.thumbnail.source;
      if (src && POSTER_OK.test(src)) out[title] = src;
    });
  }
  return out;
}
async function addPosters(films) {
  for (const lang of ["pt", "en"]) {
    const need = films.filter((f) => !f.img && f.articles[lang]);
    if (!need.length) continue;
    try { const imgs = await pageImages(lang, need.map((f) => f.articles[lang])); need.forEach((f) => { if (imgs[f.articles[lang]]) f.img = imgs[f.articles[lang]]; }); }
    catch (e) { console.warn(`Mercado: pôsteres da Wikipédia (${lang}) não responderam:`, e.message); }
  }
  return films;
}

/* ---------- nota do IMDb (arquivo oficial de notas, uso pessoal e não comercial) ---------- */
// O Wikidata quase não tem mais a nota do IMDb. O próprio IMDb publica todo dia um arquivo com a nota
// de todos os títulos (~9 MB, "tconst  averageRating  numVotes"): baixa no máximo a cada 12 h
// e lê em fluxo, guardando só os filmes pedidos.
const IMDB_RATINGS = "https://datasets.imdbws.com/title.ratings.tsv.gz";
let ratingsGz = null;   // {at, buf}
async function ratingsFile() {
  if (ratingsGz && Date.now() - ratingsGz.at < 12 * 3600e3) return ratingsGz.buf;
  const r = await fetch(IMDB_RATINGS, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${new URL(IMDB_RATINGS).host}`);
  ratingsGz = { at: Date.now(), buf: Buffer.from(await r.arrayBuffer()) };
  return ratingsGz.buf;
}
// lê o arquivo compactado e devolve {tt…: nota} dos filmes pedidos com votos suficientes (pura, testada sem rede)
function scanRatings(gz, ids, minVotes) {
  const want = new Set(ids), out = {};
  return new Promise((resolve, reject) => {
    let rest = "";
    const line = (l) => {
      const t = l.indexOf("\t"); if (t < 0 || !want.has(l.slice(0, t))) return;
      const [id, avg, votes] = l.split("\t"), v = parseFloat(avg);
      if (v >= 0 && v <= 10 && +votes >= (minVotes || 0)) out[id] = v;
    };
    zlib.createGunzip().on("data", (chunk) => {
      const lines = (rest + chunk.toString("utf8")).split("\n");
      rest = lines.pop();
      lines.forEach(line);
    }).on("end", () => { if (rest) line(rest); resolve(out); }).on("error", reject).end(gz);
  });
}
async function imdbRatings(ids) {
  return ids.length ? scanRatings(await ratingsFile(), ids, Market.CONFIG.imdbMinVotes) : {};
}
// a nota do arquivo do IMDb vale mais que a do Wikidata (é a de hoje); se o arquivo não responder, fica a do Wikidata
async function addImdb(films) {
  try {
    const r = await imdbRatings(films.map((f) => f.id));
    films.forEach((f) => { if (r[f.id] != null) f.scores.imdb = r[f.id]; });
  } catch (e) { console.warn("Mercado: as notas do IMDb não responderam:", e.message); }
  return films;
}

// Busca tudo de uma lista de IMDb, em lotes de até 80
async function fetchFilms(ids) {
  const films = [];
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    const [info, scores] = await Promise.all([sparql(infoQuery(part)), sparql(scoreQuery(part))]);
    films.push(...fromSparql(info, scores));
  }
  return addPosters(await addImdb(films));
}

module.exports = { loadPool, loadTagPool, fetchFilms, fetchFacts, imdbRatings, scanRatings, fromSparql, pickScores, genreName, oscarFamilies, OSCAR_FAMILIES };
