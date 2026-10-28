// Teste da busca de filmes do Mercado: monta os filmes a partir de respostas do Wikidata salvas aqui (sem rede).
const assert = require("assert");
const zlib = require("zlib");
const F = require("../lib/films.js");

const lit = (value) => ({ type: "literal", value });
const uri = (value) => ({ type: "uri", value });
const W = "http://www.wikidata.org/entity/";

const info = [
  { imdb: lit("tt0068646"), links: lit("133"), tpt: lit("The Godfather"), ten: lit("The Godfather"), d: lit("1972-03-15T00:00:00Z"), dir: lit("Francis Ford Coppola"),
    genres: lit("filme de drama|filme sobre crimes|filme de drama"), enArt: uri("https://en.wikipedia.org/wiki/The_Godfather"), seriesPt: lit("O Padrinho"), seriesEn: lit("The Godfather trilogy"), awards: lit(W + "Q102427|" + W + "Q103916|" + W + "Q999"), nac: lit("0") },
  { imdb: lit("tt1375666"), links: lit("97"), tptbr: lit("A Origem"), tpt: lit("Inception"), ten: lit("Inception"), d: lit("2010-07-08T00:00:00Z"),
    genres: lit("filme de ficção científica"), ptArt: uri("https://pt.wikipedia.org/wiki/Inception_(filme)") },
  { imdb: lit("tt0050083"), links: lit("30"), tpt: lit("12 Angry Men"), ten: lit("12 Angry Men"), d: lit("1957-04-10T00:00:00Z"),
    ptArt: uri("https://pt.wikipedia.org/wiki/Doze_Homens_e_uma_Senten%C3%A7a_(filme_de_1957)") },
  { imdb: lit("nada"), links: lit("1") }
];
const score = (imdb, by, s, when) => Object.assign({ imdb: lit(imdb), by: uri(W + by), score: lit(s) }, when ? { when: lit(when) } : {});
const scores = [
  score("tt0068646", "Q37312", "9.2/10", "2024-01-01T00:00:00Z"),
  score("tt0068646", "Q37312", "9.3/10", "2019-01-01T00:00:00Z"),   // mais antiga: perde mesmo sendo maior
  score("tt0068646", "Q150248", "100/100"),
  score("tt0068646", "Q105584", "9.1/10", "2025-01-01T00:00:00Z"),  // média x/10 do RT
  score("tt0068646", "Q105584", "97%", "2020-01-01T00:00:00Z"),     // Tomatometer tem preferência
  score("tt1375666", "Q150248", "74/100"),
  score("tt1375666", "Q150248", "70/100"),                          // sem data: vale a maior
  score("tt1375666", "Q99999", "5/10"),                             // fonte desconhecida
  score("tt0050083", "Q37312", "9.0/10")
];

const films = F.fromSparql(info, scores);
const byId = Object.fromEntries(films.map((f) => [f.id, f]));
assert.deepStrictEqual(Object.keys(byId).sort(), ["tt0050083", "tt0068646", "tt1375666"], "IMDb inválido fica de fora");

const gf = byId.tt0068646;
assert.deepStrictEqual(gf.scores, { imdb: 9.2, metacritic: 10, rt: 9.7 }, "uma nota por fonte");
assert.strictEqual(gf.title, "The Godfather");
assert.strictEqual(gf.orig, "", "sem título original repetido");
assert.strictEqual(gf.year, "1972");
assert.deepStrictEqual(gf.g, ["Drama", "Crimes"], "gêneros limpos e sem repetição");
assert.strictEqual(gf.links, 133);
assert.deepStrictEqual(gf.articles, { pt: "", en: "The Godfather" });
assert.strictEqual(gf.series, "O Padrinho", "série em português primeiro");
assert.strictEqual(byId.tt1375666.series, "", "sem série");
assert.deepStrictEqual([gf.oscars, gf.nacional, byId.tt1375666.oscars], [["filme", "atuacao"], false, []], "Oscars por família (prêmio desconhecido fica de fora) e cinema nacional");
assert.deepStrictEqual(F.oscarFamilies(W + "Q22752811|" + W + "Q41417"), ["roteiro", "musica"], "versões antigas entram na família, na ordem das famílias");

const inc = byId.tt1375666;
assert.strictEqual(inc.title, "A Origem", "rótulo pt-BR primeiro");
assert.strictEqual(inc.orig, "Inception");
assert.deepStrictEqual(inc.scores, { metacritic: 7.4 }, "sem data vale a maior; fonte desconhecida ignorada");

const ang = byId.tt0050083;
assert.strictEqual(ang.title, "Doze Homens e uma Sentença", "sem pt-BR, vale o artigo em português sem o parêntese");
assert.strictEqual(ang.orig, "12 Angry Men");
assert.deepStrictEqual(ang.g, []);
console.log("ok montagem dos filmes do Wikidata");

assert.strictEqual(F.genreName("filme de terror"), "Terror");
assert.strictEqual(F.genreName("filmes de ação"), "Ação");
assert.strictEqual(F.genreName("comédia"), "Comédia");
console.log("ok nomes de gênero");

// arquivo de notas do IMDb: só os filmes pedidos, com votos suficientes (a última linha vem sem quebra)
const gz = zlib.gzipSync("tconst\taverageRating\tnumVotes\ntt0075148\t8.1\t700000\ntt0000001\t5.7\t200\ntt0000002\t\\N\t5000\ntt0068646\t9.2\t2100000");
F.scanRatings(gz, ["tt0075148", "tt0000001", "tt0000002", "tt0068646", "tt0000009"], 1000).then((r) => {
  assert.deepStrictEqual(r, { tt0075148: 8.1, tt0068646: 9.2 }, "poucos votos, nota vazia e filme fora do arquivo ficam de fora");
  console.log("ok notas do IMDb");
  console.log("Todos os testes de filmes passaram.");
}).catch((e) => { console.error(e); process.exit(1); });
