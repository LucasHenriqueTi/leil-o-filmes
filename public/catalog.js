/* ============================================================
   Martelo Live — catálogo de filmes
   Fontes gratuitas e sem chave:
   - Wikidata (sorteio de milhares de filmes, gêneros, notas Metacritic/RT/IMDb)
   - Wikipédia (pôsteres e sinopses)
   - api.imdbapi.dev (nota IMDb ao vivo, quando responde)
   Sem internet, usa os filmes embutidos abaixo.
   ============================================================ */
(function () {
"use strict";
const GROUP_TAG = "Indicados pelo grupo";
// [imdb, título, original, ano, direção, gêneros, nota IMDb aprox., artigo na Wikipedia (en), indicado por]
const RAW = [
 ["tt0756683","O Homem da Terra","The Man from Earth",2007,"Richard Schenkman","Ficção científica|Drama",7.8,"The Man from Earth","Cibele"],
 ["tt2543164","A Chegada","Arrival",2016,"Denis Villeneuve","Ficção científica|Drama|Mistério",7.9,"Arrival (film)","Cibele"],
 ["tt1663662","Círculo de Fogo","Pacific Rim",2013,"Guillermo del Toro","Ficção científica|Ação|Aventura",6.9,"Pacific Rim (film)","Cibele"],
 ["tt0399201","A Ilha","The Island",2005,"Michael Bay","Ficção científica|Ação",6.8,"The Island (2005 film)","Cibele"],
 ["tt2194499","Questão de Tempo","About Time",2013,"Richard Curtis","Romance|Comédia|Drama|Fantasia",7.8,"About Time (2013 film)","André"],
 ["tt1343727","Dredd","Dredd",2012,"Pete Travis","Ação|Ficção científica|Crime",7.1,"Dredd","André"],
 ["tt0093773","O Predador","Predator",1987,"John McTiernan","Ação|Ficção científica|Terror",7.8,"Predator (film)","André"],
 ["tt1637688","O Preço do Amanhã","In Time",2011,"Andrew Niccol","Ficção científica|Ação|Suspense",6.7,"In Time","André"],
 ["tt0399295","O Senhor das Armas","Lord of War",2005,"Andrew Niccol","Crime|Drama",7.6,"Lord of War","Kirito"],
 ["tt0246578","Donnie Darko","Donnie Darko",2001,"Richard Kelly","Ficção científica|Drama|Mistério",8.0,"Donnie Darko","Kirito"],
 ["tt1375666","A Origem","Inception",2010,"Christopher Nolan","Ficção científica|Ação|Suspense",8.8,"Inception","Kirito"],
 ["tt1136608","Distrito 9","District 9",2009,"Neill Blomkamp","Ficção científica|Ação",7.9,"District 9","Kirito"],
 ["tt0884328","O Nevoeiro","The Mist",2007,"Frank Darabont","Terror|Ficção científica",7.1,"The Mist (film)","Pinho"],
 ["tt0325710","O Último Samurai","The Last Samurai",2003,"Edward Zwick","Ação|Drama|Aventura",7.8,"The Last Samurai","Pinho"],
 ["tt0120382","O Show de Truman","The Truman Show",1998,"Peter Weir","Comédia|Drama|Ficção científica",8.2,"The Truman Show","Pinho"],
 ["tt0102926","O Silêncio dos Inocentes","The Silence of the Lambs",1991,"Jonathan Demme","Suspense|Crime|Terror",8.6,"The Silence of the Lambs (film)","Pinho"],

 ["tt0133093","Matrix","The Matrix",1999,"Lana e Lilly Wachowski","Ficção científica|Ação",8.7,"The Matrix"],
 ["tt0816692","Interestelar","Interstellar",2014,"Christopher Nolan","Ficção científica|Drama|Aventura",8.7,"Interstellar (film)"],
 ["tt1856101","Blade Runner 2049","Blade Runner 2049",2017,"Denis Villeneuve","Ficção científica|Drama|Mistério",8.0,"Blade Runner 2049"],
 ["tt0119177","Gattaca","Gattaca",1997,"Andrew Niccol","Ficção científica|Drama",7.8,"Gattaca"],
 ["tt0470752","Ex Machina","Ex Machina",2014,"Alex Garland","Ficção científica|Suspense",7.7,"Ex Machina (film)"],
 ["tt1631867","No Limite do Amanhã","Edge of Tomorrow",2014,"Doug Liman","Ficção científica|Ação",7.9,"Edge of Tomorrow"],
 ["tt0206634","Filhos da Esperança","Children of Men",2006,"Alfonso Cuarón","Ficção científica|Drama|Suspense",7.9,"Children of Men"],
 ["tt1182345","Lunar","Moon",2009,"Duncan Jones","Ficção científica|Drama",7.8,"Moon (2009 film)"],
 ["tt1276104","Looper","Looper",2012,"Rian Johnson","Ficção científica|Ação",7.4,"Looper (film)"],
 ["tt0088763","De Volta para o Futuro","Back to the Future",1985,"Robert Zemeckis","Ficção científica|Aventura|Comédia",8.5,"Back to the Future"],
 ["tt0107290","Jurassic Park","Jurassic Park",1993,"Steven Spielberg","Aventura|Ficção científica",8.2,"Jurassic Park (film)"],
 ["tt0078748","Alien, o 8º Passageiro","Alien",1979,"Ridley Scott","Terror|Ficção científica",8.5,"Alien (film)"],

 ["tt1392190","Mad Max: Estrada da Fúria","Mad Max: Fury Road",2015,"George Miller","Ação|Aventura|Ficção científica",8.1,"Mad Max: Fury Road"],
 ["tt0172495","Gladiador","Gladiator",2000,"Ridley Scott","Ação|Drama|Aventura",8.5,"Gladiator (2000 film)"],
 ["tt0095016","Duro de Matar","Die Hard",1988,"John McTiernan","Ação|Suspense",8.2,"Die Hard"],
 ["tt0468569","Batman: O Cavaleiro das Trevas","The Dark Knight",2008,"Christopher Nolan","Ação|Crime|Drama",9.0,"The Dark Knight"],
 ["tt2911666","John Wick","John Wick",2014,"Chad Stahelski","Ação|Suspense",7.4,"John Wick (film)"],
 ["tt0082971","Os Caçadores da Arca Perdida","Raiders of the Lost Ark",1981,"Steven Spielberg","Aventura|Ação",8.4,"Raiders of the Lost Ark"],
 ["tt0120737","O Senhor dos Anéis: A Sociedade do Anel","The Lord of the Rings: The Fellowship of the Ring",2001,"Peter Jackson","Fantasia|Aventura",8.9,"The Lord of the Rings: The Fellowship of the Ring"],
 ["tt0457430","O Labirinto do Fauno","Pan's Labyrinth",2006,"Guillermo del Toro","Fantasia|Drama",8.2,"Pan's Labyrinth"],

 ["tt0081505","O Iluminado","The Shining",1980,"Stanley Kubrick","Terror|Suspense",8.4,"The Shining (film)"],
 ["tt0070047","O Exorcista","The Exorcist",1973,"William Friedkin","Terror",8.1,"The Exorcist"],
 ["tt5052448","Corra!","Get Out",2017,"Jordan Peele","Terror|Suspense|Mistério",7.8,"Get Out"],
 ["tt7784604","Hereditário","Hereditary",2018,"Ari Aster","Terror|Drama|Mistério",7.3,"Hereditary (film)"],
 ["tt1457767","Invocação do Mal","The Conjuring",2013,"James Wan","Terror|Mistério",7.5,"The Conjuring"],
 ["tt0073195","Tubarão","Jaws",1975,"Steven Spielberg","Aventura|Suspense",8.1,"Jaws (film)"],

 ["tt0114369","Seven: Os Sete Crimes Capitais","Se7en",1995,"David Fincher","Crime|Suspense|Mistério",8.6,"Seven (1995 film)"],
 ["tt0110912","Pulp Fiction","Pulp Fiction",1994,"Quentin Tarantino","Crime|Drama",8.9,"Pulp Fiction"],
 ["tt0068646","O Poderoso Chefão","The Godfather",1972,"Francis Ford Coppola","Crime|Drama",9.2,"The Godfather"],
 ["tt0407887","Os Infiltrados","The Departed",2006,"Martin Scorsese","Crime|Suspense|Drama",8.5,"The Departed"],
 ["tt0477348","Onde os Fracos Não Têm Vez","No Country for Old Men",2007,"Joel e Ethan Coen","Crime|Suspense",8.2,"No Country for Old Men (film)"],
 ["tt0443706","Zodíaco","Zodiac",2007,"David Fincher","Crime|Mistério|Suspense",7.7,"Zodiac (film)"],
 ["tt0137523","Clube da Luta","Fight Club",1999,"David Fincher","Drama|Suspense",8.8,"Fight Club"],
 ["tt6751668","Parasita","Parasite",2019,"Bong Joon-ho","Suspense|Drama|Comédia",8.5,"Parasite (2019 film)"],
 ["tt0209144","Amnésia","Memento",2000,"Christopher Nolan","Suspense|Mistério",8.4,"Memento (film)"],
 ["tt2267998","Garota Exemplar","Gone Girl",2014,"David Fincher","Suspense|Mistério|Drama",8.1,"Gone Girl (film)"],
 ["tt0482571","O Grande Truque","The Prestige",2006,"Christopher Nolan","Suspense|Mistério|Drama",8.5,"The Prestige (film)"],
 ["tt1130884","Ilha do Medo","Shutter Island",2010,"Martin Scorsese","Suspense|Mistério",8.2,"Shutter Island (film)"],
 ["tt0167404","O Sexto Sentido","The Sixth Sense",1999,"M. Night Shyamalan","Suspense|Mistério|Drama",8.2,"The Sixth Sense"],

 ["tt0111161","Um Sonho de Liberdade","The Shawshank Redemption",1994,"Frank Darabont","Drama",9.3,"The Shawshank Redemption"],
 ["tt2582802","Whiplash","Whiplash",2014,"Damien Chazelle","Drama",8.5,"Whiplash (2014 film)"],

 ["tt0338013","Brilho Eterno de uma Mente sem Lembranças","Eternal Sunshine of the Spotless Mind",2004,"Michel Gondry","Romance|Drama|Ficção científica",8.3,"Eternal Sunshine of the Spotless Mind"],
 ["tt3783958","La La Land: Cantando Estações","La La Land",2016,"Damien Chazelle","Romance|Drama|Comédia",8.0,"La La Land"],
 ["tt0112471","Antes do Amanhecer","Before Sunrise",1995,"Richard Linklater","Romance|Drama",8.1,"Before Sunrise"],
 ["tt1798709","Ela","Her",2013,"Spike Jonze","Romance|Drama|Ficção científica",8.0,"Her (2013 film)"],

 ["tt0118715","O Grande Lebowski","The Big Lebowski",1998,"Joel e Ethan Coen","Comédia|Crime",8.1,"The Big Lebowski"],
 ["tt2278388","O Grande Hotel Budapeste","The Grand Budapest Hotel",2014,"Wes Anderson","Comédia|Aventura|Crime",8.1,"The Grand Budapest Hotel"],
 ["tt1119646","Se Beber, Não Case!","The Hangover",2009,"Todd Phillips","Comédia",7.7,"The Hangover"],
 ["tt0829482","Superbad: É Hoje","Superbad",2007,"Greg Mottola","Comédia",7.6,"Superbad"],

 ["tt0245429","A Viagem de Chihiro","Spirited Away",2001,"Hayao Miyazaki","Animação|Fantasia|Aventura",8.6,"Spirited Away"],
 ["tt0114709","Toy Story","Toy Story",1995,"John Lasseter","Animação|Comédia|Aventura",8.3,"Toy Story"],
 ["tt0382932","Ratatouille","Ratatouille",2007,"Brad Bird","Animação|Comédia",8.1,"Ratatouille (film)"],
 ["tt0910970","WALL·E","WALL-E",2008,"Andrew Stanton","Animação|Ficção científica|Aventura",8.4,"WALL-E"],
 ["tt2096673","Divertida Mente","Inside Out",2015,"Pete Docter","Animação|Comédia|Drama",8.1,"Inside Out (2015 film)"],
 ["tt4633694","Homem-Aranha no Aranhaverso","Spider-Man: Into the Spider-Verse",2018,"Persichetti, Ramsey e Rothman","Animação|Ação|Aventura",8.4,"Spider-Man: Into the Spider-Verse"],

 ["tt0317248","Cidade de Deus","Cidade de Deus",2002,"Fernando Meirelles","Nacional|Crime|Drama",8.6,"City of God (2002 film)"],
 ["tt0861739","Tropa de Elite","Tropa de Elite",2007,"José Padilha","Nacional|Ação|Crime",8.0,"Elite Squad"],
 ["tt0271383","O Auto da Compadecida","O Auto da Compadecida",2000,"Guel Arraes","Nacional|Comédia|Fantasia",8.5,"A Dog's Will"],
 ["tt0140888","Central do Brasil","Central do Brasil",1998,"Walter Salles","Nacional|Drama",8.0,"Central Station (film)"],
 ["tt2762506","Bacurau","Bacurau",2019,"Kleber Mendonça Filho e Juliano Dornelles","Nacional|Suspense|Ação",7.3,"Bacurau"],
 ["tt3742378","Que Horas Ela Volta?","Que Horas Ela Volta?",2015,"Anna Muylaert","Nacional|Drama|Comédia",7.7,"The Second Mother (2015 film)"]
];
const BASE = RAW.map(([id, title, orig, year, dir, g, r, wiki, by]) => ({ id, title, orig, year, dir, g: g.split("|").concat(by ? [GROUP_TAG] : []), r, rsrc: "IMDb", wiki, by }));

const WD = "https://query.wikidata.org/sparql";
const IMDB = "https://api.imdbapi.dev";
const TIERS = {
  alta: { label: "Famosos", desc: "Blockbusters e clássicos", min: 70 },
  media: { label: "Conhecidos", desc: "Equilíbrio entre fama e surpresa", min: 40 },
  ampla: { label: "Garimpo", desc: "Inclui filmes menos lembrados", min: 20 }
};
const CATS = [
  { name: "Ficção científica", q: "Q471839" }, { name: "Terror", q: "Q200092" }, { name: "Suspense", q: "Q2484376" },
  { name: "Ação", q: "Q188473" }, { name: "Comédia", q: "Q157443" }, { name: "Drama", q: "Q130232" },
  { name: "Romance", q: "Q1054574" }, { name: "Crime", q: "Q959790" }, { name: "Fantasia", q: "Q157394" },
  { name: "Aventura", q: "Q319221" }, { name: "Mistério", q: "Q1200678" }, { name: "Guerra", q: "Q369747" },
  { name: "Faroeste", q: "Q172980" }, { name: "Musical", q: "Q842256" }, { name: "Super-herói", q: "Q1535153" },
  { name: "Animação", anim: true }, { name: "Nacional", country: "Q155" }
];
const QGENRE = { Q471839: ["Ficção científica"], Q200092: ["Terror"], Q2484376: ["Suspense"], Q188473: ["Ação"], Q157443: ["Comédia"], Q130232: ["Drama"],
  Q1054574: ["Romance"], Q959790: ["Crime"], Q157394: ["Fantasia"], Q319221: ["Aventura"], Q1200678: ["Mistério"], Q369747: ["Guerra"], Q172980: ["Faroeste"],
  Q842256: ["Musical"], Q1535153: ["Super-herói", "Ação"], Q202866: ["Animação"], Q29168811: ["Animação"], Q859369: ["Comédia", "Drama"],
  Q860626: ["Romance", "Comédia"], Q2973181: ["Ação", "Suspense"], Q853630: ["Suspense"], Q2421031: ["Crime", "Suspense"], Q20656232: ["Ficção científica", "Ação"], Q24925: ["Ficção científica"] };
const EN_PT = { "Sci-Fi": "Ficção científica", "Science Fiction": "Ficção científica", Action: "Ação", Horror: "Terror", Thriller: "Suspense", Drama: "Drama", Comedy: "Comédia",
  Romance: "Romance", Animation: "Animação", Crime: "Crime", Fantasy: "Fantasia", Adventure: "Aventura", Mystery: "Mistério", War: "Guerra", Western: "Faroeste", Musical: "Musical" };

/* ---------- cache local ---------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const meta = store.get("ml-meta") || {};   // por IMDb id: {img, rating, plot, wdScore, syn, ...}
let saveTimer = null;
const saveMeta = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.set("ml-meta", meta), 300); };
const listeners = new Set();
let notifyTimer = null;
const notify = () => { clearTimeout(notifyTimer); notifyTimer = setTimeout(() => listeners.forEach((fn) => fn()), 50); };
const status = { wikidata: "idle", posters: "idle", imdb: "idle" };

/* ---------- rede ---------- */
async function getJSON(url, ms = 10000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const sparql = (q, ms = 60000) => getJSON(WD + "?format=json&query=" + encodeURIComponent(q), ms);
const qidOf = (uri) => uri.split("/").pop();
const wikiTitle = (url) => decodeURIComponent(url.split("/wiki/")[1] || "").replace(/_/g, " ");
const ptGenre = (g) => EN_PT[g] || g;

/* ---------- notas ---------- */
function ratingInfo(f) {
  const m = meta[f.id] || {};
  if (m.rating != null) return { v: +m.rating, src: "IMDb" };
  if (f.r != null && f.r !== "") return { v: +f.r, src: f.rsrc || "IMDb" };
  if (m.wdScore) return m.wdScore;
  return null;
}
const ratingOf = (f) => { const r = ratingInfo(f); return r ? Math.round(r.v * 10) / 10 : null; };
const SCORE_SRC = { Q37312: "IMDb", Q150248: "Metacritic", Q105584: "Rotten Tomatoes" };
const SCORE_PRI = ["IMDb", "Metacritic", "Rotten Tomatoes"];
function parseScore(txt) {
  const a = String(txt).match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+)/);
  if (a) return parseFloat(a[1].replace(",", ".")) / parseFloat(a[2]) * 10;
  const p = String(txt).match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (p) return parseFloat(p[1].replace(",", ".")) / 10;
  return null;
}
async function fetchScores(films) {
  const ids = [...new Set(films.filter((f) => !ratingInfo(f) && !(meta[f.id] && meta[f.id].wdTried)).map((f) => f.id))].filter((id) => /^tt\d+$/.test(id));
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    const q = `SELECT ?imdb ?by ?score WHERE {
      VALUES ?imdb { ${part.map((x) => '"' + x + '"').join(" ")} }
      VALUES ?by { wd:Q37312 wd:Q150248 wd:Q105584 }
      ?item wdt:P345 ?imdb . ?item p:P444 ?st . ?st ps:P444 ?score ; pq:P447 ?by . }`;
    try {
      const d = await sparql(q, 30000), best = {};
      d.results.bindings.forEach((b) => {
        const src = SCORE_SRC[qidOf(b.by.value)], v = parseScore(b.score.value), id = b.imdb.value;
        if (v == null || !src) return;
        const cur = best[id];
        if (!cur || SCORE_PRI.indexOf(src) < SCORE_PRI.indexOf(cur.src) || (src === cur.src && v > cur.v)) best[id] = { v, src };
      });
      part.forEach((id) => { meta[id] = Object.assign({}, meta[id], { wdTried: true }); if (best[id]) meta[id].wdScore = best[id]; });
      status.wikidata = "on";
    } catch (e) {}
  }
  saveMeta(); notify();
}
async function checkImdb() {
  status.imdb = "checking";
  try { absorbImdb(await getJSON(IMDB + "/titles/tt0102926", 7000)); status.imdb = "on"; }
  catch (e) { status.imdb = "off"; }
  notify();
}
function absorbImdb(t) {
  if (!t || !t.id) return;
  const m = meta[t.id] || {};
  meta[t.id] = Object.assign(m, { rating: t.rating?.aggregateRating ?? m.rating ?? null, plot: t.plot || m.plot || null, imdbImg: t.primaryImage?.url || m.imdbImg || null });
  if (!meta[t.id].img && meta[t.id].imdbImg) meta[t.id].img = meta[t.id].imdbImg;
}
async function enrichImdb(films) {
  if (status.imdb !== "on") return;
  const todo = films.filter((f) => !(meta[f.id] && meta[f.id].imdbDone));
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(todo.slice(i, i + 5).map(async (f) => {
      try { absorbImdb(await getJSON(IMDB + "/titles/" + f.id, 7000)); meta[f.id].imdbDone = true; } catch (e) {}
    }));
    saveMeta(); notify();
  }
}
async function searchImdb(q) {
  const d = await getJSON(IMDB + "/search/titles?query=" + encodeURIComponent(q) + "&limit=10");
  return (d.titles || []).filter((t) => !t.type || /movie/i.test(t.type)).map((t) => {
    absorbImdb(t);
    return { id: t.id, title: t.primaryTitle, orig: t.originalTitle || t.primaryTitle, year: t.startYear || "", dir: "", g: (t.genres || []).map(ptGenre), r: t.rating?.aggregateRating ?? null, rsrc: "IMDb", wiki: null };
  });
}

/* ---------- pôsteres (Wikipédia) ---------- */
const posterQueue = new Map();
let posterTimer = null;
function wantPosters(films) {
  films.forEach((f) => { if (f.img && !(meta[f.id] && meta[f.id].img)) { meta[f.id] = Object.assign({}, meta[f.id], { img: f.img }); } if (f.wiki && !(meta[f.id] && (meta[f.id].wikiTried || meta[f.id].img))) posterQueue.set(f.id, f.wiki); });
  clearTimeout(posterTimer); posterTimer = setTimeout(flushPosters, 60);
}
async function flushPosters() {
  const items = [...posterQueue.entries()]; posterQueue.clear();
  for (let i = 0; i < items.length; i += 40) {
    const chunk = items.slice(i, i + 40);
    const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=500&pilicense=any&titles=" + encodeURIComponent(chunk.map((c) => c[1]).join("|"));
    try {
      const d = await getJSON(url), q = d.query || {}, map = {};
      (q.normalized || []).forEach((n) => (map[n.from] = n.to));
      (q.redirects || []).forEach((n) => (map[n.from] = n.to));
      const pages = Object.values(q.pages || {});
      chunk.forEach(([id, title]) => {
        let t = title, k = 0; while (map[t] && k++ < 3) t = map[t];
        const p = pages.find((x) => x.title === t);
        meta[id] = Object.assign({}, meta[id], { wikiTried: true });
        if (p && p.thumbnail && p.thumbnail.source && !meta[id].img) meta[id].img = p.thumbnail.source;
      });
      status.posters = "on";
    } catch (e) { if (status.posters !== "on") status.posters = "off"; break; }
    saveMeta(); notify();
  }
}
const posterOf = (f) => (meta[f.id] && meta[f.id].img) || f.img || null;

/* ---------- sorteio (Wikidata) ---------- */
const poolCache = {};
async function loadPool(cat, tierKey) {
  const tier = TIERS[tierKey] || TIERS.media;
  const min = !cat ? tier.min : cat.country ? Math.max(5, Math.round(tier.min * 0.25)) : Math.round(tier.min * 0.6);
  const key = "ml-pool-" + (cat ? cat.name : "all") + "-" + min;
  if (poolCache[key]) return poolCache[key];
  const cached = store.get(key);
  if (cached && Date.now() - cached.t < 7 * 864e5 && cached.rows.length) return (poolCache[key] = cached.rows);
  let link;
  if (!cat) link = "?item wdt:P31 wd:Q11424 .";
  else if (cat.country) link = `?item wdt:P495 wd:${cat.country} . ?item wdt:P31 wd:Q11424 .`;
  else if (cat.anim) link = "VALUES ?g { wd:Q202866 wd:Q29168811 } { ?item wdt:P136 ?g } UNION { ?item wdt:P31 ?g }";
  else link = `?item wdt:P136 wd:${cat.q} . ?item wdt:P31 wd:Q11424 .`;
  const d = await sparql(`SELECT ?item ?imdb ?article ?links WHERE {
    ${link}
    ?item wikibase:sitelinks ?links . FILTER(?links >= ${min})
    ?item wdt:P345 ?imdb .
    ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }`);
  const seen = new Set(), rows = [];
  for (const b of d.results.bindings) {
    const qid = qidOf(b.item.value);
    if (seen.has(qid) || !/^tt\d+$/.test(b.imdb.value)) continue;
    seen.add(qid); rows.push([qid, b.imdb.value, wikiTitle(b.article.value), +b.links.value]);
  }
  poolCache[key] = rows; store.set(key, { t: Date.now(), rows });
  return rows;
}
async function hydrate(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 60) {
    const part = rows.slice(i, i + 60);
    const d = await sparql(`SELECT ?item (SAMPLE(?pb) AS ?ptbr) (SAMPLE(?p) AS ?pt) (SAMPLE(?e) AS ?en) (SAMPLE(?dl) AS ?dir) (MIN(?y) AS ?year)
      (GROUP_CONCAT(DISTINCT STRAFTER(STR(?g),"entity/");separator="|") AS ?genres)
      (GROUP_CONCAT(DISTINCT STRAFTER(STR(?c),"entity/");separator="|") AS ?countries) WHERE {
      VALUES ?item { ${part.map((r) => "wd:" + r[0]).join(" ")} }
      OPTIONAL { ?item rdfs:label ?pb FILTER(LANG(?pb)="pt-br") }
      OPTIONAL { ?item rdfs:label ?p FILTER(LANG(?p)="pt") }
      OPTIONAL { ?item rdfs:label ?e FILTER(LANG(?e)="en") }
      OPTIONAL { ?item wdt:P57 ?d . ?d rdfs:label ?dl FILTER(LANG(?dl)="en") }
      OPTIONAL { ?item wdt:P577 ?date BIND(YEAR(?date) AS ?y) }
      OPTIONAL { ?item wdt:P136 ?g }
      OPTIONAL { ?item wdt:P495 ?c }
    } GROUP BY ?item`, 30000);
    const info = {}; d.results.bindings.forEach((b) => (info[qidOf(b.item.value)] = b));
    part.forEach(([qid, imdb, wiki, links]) => {
      const b = info[qid] || {}, v = (k) => b[k] && b[k].value;
      const en = v("en") || wiki, title = v("ptbr") || v("pt") || en;
      const g = [...new Set((v("genres") || "").split("|").flatMap((x) => QGENRE[x] || []))];
      if ((v("countries") || "").split("|").includes("Q155")) g.unshift("Nacional");
      out.push({ id: imdb, qid, title, orig: en, year: v("year") || "", dir: v("dir") || "", g, r: null, wiki, links });
    });
  }
  return out;
}
function sample(arr, n) {
  const a = arr.slice(), k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) { const j = i + Math.floor(Math.random() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}
// opts: {mode:"random"|"genre", genres:[], tier, n}
async function draw(opts) {
  const n = Math.max(1, Math.min(200, opts.n | 0));
  let films = [], fellBack = false;
  try {
    if (opts.mode === "random") films = await hydrate(sample(await loadPool(null, opts.tier), n));
    else {
      const local = opts.genres.includes(GROUP_TAG) ? BASE.filter((f) => f.g.includes(GROUP_TAG)) : [];
      const online = CATS.filter((c) => opts.genres.includes(c.name));
      const pools = await Promise.all(online.map((c) => loadPool(c, opts.tier)));
      const merged = new Map(); pools.flat().forEach((r) => merged.set(r[0], r));
      const all = [...local.map((f) => ({ local: f })), ...[...merged.values()].map((r) => ({ row: r }))];
      const picked = sample(all, n);
      const hyd = await hydrate(picked.filter((x) => x.row).map((x) => x.row));
      films = sample([...picked.filter((x) => x.local).map((x) => ({ ...x.local })), ...hyd], picked.length);
    }
    status.wikidata = "on";
  } catch (e) {
    status.wikidata = "off"; fellBack = true;
    const base = opts.mode === "genre" ? BASE.filter((f) => f.g.some((g) => opts.genres.includes(g))) : BASE;
    films = sample(base, n).map((f) => ({ ...f }));
  }
  notify();
  wantPosters(films);
  fetchScores(films);
  enrichImdb(films);
  return { films, fellBack, short: films.length < n };
}
// Antes de começar: espera (até um limite) pôsteres e notas, e congela os dados de cada lote
async function finalize(films, maxWait = 9000) {
  wantPosters(films);
  await Promise.race([Promise.all([fetchScores(films), new Promise((r) => setTimeout(r, 1500))]), new Promise((r) => setTimeout(r, maxWait))]);
  return films.map((f) => {
    const ri = ratingInfo(f);
    return { id: f.id, title: f.title, orig: f.orig, year: f.year, dir: f.dir, g: f.g, r: ri ? Math.round(ri.v * 10) / 10 : null, rsrc: ri ? ri.src : "", img: posterOf(f), wiki: f.wiki, by: f.by || "" };
  });
}

/* ---------- sinopse (Wikipédia pt → en → IMDb) ---------- */
const PLOT_HEADS = /^(sinopse|enredo|trama|resumo|argumento|história|plot|synopsis|premise|plot summary)$/i;
const synBusy = new Set();
function cutText(t, max = 650) {
  t = t.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 200 ? cut.slice(0, end + 1) : cut.replace(/\s\S*$/, "") + "…";
}
function splitPlot(txt) {
  const parts = txt.split(/\n(={2,})\s*(.+?)\s*\1\n/);
  const intro = (parts[0] || "").trim();
  let plot = null;
  for (let i = 1; i < parts.length; i += 3) if (PLOT_HEADS.test(parts[i + 1] || "") && (parts[i + 2] || "").trim()) { plot = parts[i + 2].trim(); break; }
  return { plot, intro };
}
async function wikiText(lang, title) {
  const d = await getJSON(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=extracts&explaintext=1&exsectionformat=wiki&titles=${encodeURIComponent(title)}`, 12000);
  const p = Object.values(d.query?.pages || {})[0];
  return p && p.extract ? splitPlot(p.extract) : null;
}
async function fetchSynopsis(f) {
  if (!f || synBusy.has(f.id) || (meta[f.id] && meta[f.id].syn)) return;
  synBusy.add(f.id); notify();
  let syn = null;
  try {
    let pt = null, en = f.wiki || null;
    try {
      const d = await sparql(`SELECT ?pt ?en WHERE { VALUES ?imdb {"${String(f.id).replace(/[^a-z0-9]/gi, "")}"} ?item wdt:P345 ?imdb .
        OPTIONAL { ?pt schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> . }
        OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . } } LIMIT 1`, 15000);
      const b = d.results.bindings[0] || {};
      if (b.pt) pt = wikiTitle(b.pt.value);
      if (b.en && !en) en = wikiTitle(b.en.value);
    } catch (e) {}
    const [ptT, enT] = await Promise.all([pt ? wikiText("pt", pt).catch(() => null) : null, en ? wikiText("en", en).catch(() => null) : null]);
    if (ptT && ptT.plot) syn = { text: cutText(ptT.plot), src: "Wikipédia" };
    else if (enT && enT.plot) syn = { text: cutText(enT.plot), src: "Wikipedia em inglês" };
    else if (ptT && ptT.intro) syn = { text: cutText(ptT.intro), src: "Wikipédia" };
    else if (meta[f.id] && meta[f.id].plot) syn = { text: cutText(meta[f.id].plot), src: "IMDb em inglês" };
    else if (enT && enT.intro) syn = { text: cutText(enT.intro), src: "Wikipedia em inglês" };
  } catch (e) {}
  meta[f.id] = Object.assign({}, meta[f.id], { syn: syn || { text: "", src: "" } });
  synBusy.delete(f.id); saveMeta(); notify();
}
const synopsisOf = (f) => (meta[f.id] && meta[f.id].syn) || (synBusy.has(f.id) ? { loading: true } : null);

window.Catalog = { BASE, CATS, TIERS, GROUP_TAG, status, meta, store, onUpdate: (fn) => listeners.add(fn),
  draw, finalize, wantPosters, posterOf, ratingInfo, ratingOf, fetchScores, checkImdb, enrichImdb, searchImdb, fetchSynopsis, synopsisOf, sample };
})();
