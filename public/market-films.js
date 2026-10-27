/* ============================================================
   Martelo Live — filmes do Mercado que ficam no projeto
   - examples: filmes de exemplo, salvos aqui com notas e pôster. Ficam sempre no catálogo
     (funcionam até sem internet) e cobrem todas as raridades.
   - cult: códigos do IMDb dos filmes com a tag Cult.
   - fix: correções por código do IMDb para os filmes que a Casa sorteia no Wikidata.
     scores: notas de 0 a 10 que substituem ou completam as do Wikidata
     (imdb, metacritic, rt; Metacritic 74/100 = 7.4; Rotten Tomatoes 87% = 8.7).
     film: {title, year, dir, g} corrige outros campos.
     include: true faz a Casa cadastrar o filme na próxima rodada, mesmo sem ele ser sorteado.
   Nota e raridade congelam na primeira cópia emitida.
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MarketFilms = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const P = "https://upload.wikimedia.org/wikipedia/pt/";
  return {
    examples: [
      // com o RT valendo metade, uma raridade por faixa (notas e séries do Wikidata em out/2026;
      // a série usa o mesmo rótulo do Wikidata para casar com os filmes que a Casa busca)
      { id: "tt0418279", title: "Transformers", series: "Transformers", year: 2007, dir: "Michael Bay", g: ["Ação", "Ficção científica"], links: 68, scores: { metacritic: 6.1, rt: 5.7 }, img: P + "e/ee/Transformers-poster.jpg", wiki: "Transformers (filme)" },
      { id: "tt1099212", title: "Crepúsculo", orig: "Twilight", series: "The Twilight Saga", year: 2008, dir: "Catherine Hardwicke", g: ["Drama", "Fantasia", "Romance"], links: 74, scores: { metacritic: 5.6, rt: 4.9 }, img: P + "c/c1/Twilight_Poster.jpg", wiki: "Crepúsculo (filme)" },
      { id: "tt0325980", title: "Piratas do Caribe: A Maldição do Pérola Negra", series: "Pirates of the Caribbean", orig: "Pirates of the Caribbean: The Curse of the Black Pearl", year: 2003, dir: "Gore Verbinski", g: ["Aventura", "Fantasia", "Ação"], links: 90, scores: { metacritic: 6.3, rt: 7.9 }, img: P + "e/e6/Pirates_of_the_Caribbean_-_The_Curse_of_the_Black_Pearl.jpg", wiki: "Pirates of the Caribbean: The Curse of the Black Pearl" },
      { id: "tt0816692", title: "Interestelar", oscars: ["visual"], orig: "Interstellar", year: 2014, dir: "Christopher Nolan", g: ["Ficção científica", "Drama", "Aventura"], links: 98, scores: { imdb: 8.7, metacritic: 7.4, rt: 7.3 }, img: P + "3/3a/Interstellar_Filme.png", wiki: "Interstellar" },
      { id: "tt0441773", title: "Kung Fu Panda", year: 2008, dir: "John Stevenson", g: ["Animação", "Ação", "Comédia"], links: 87, scores: { metacritic: 7.4, rt: 8.7 }, img: P + "7/76/Kungfupanda.jpg", wiki: "Kung Fu Panda" },
      { id: "tt1375666", title: "A Origem", oscars: ["visual", "tecnica"], orig: "Inception", year: 2010, dir: "Christopher Nolan", g: ["Ficção científica", "Ação", "Mistério"], links: 97, scores: { imdb: 8.8, metacritic: 7.4, rt: 8.7 }, img: P + "8/84/AOrigemPoster.jpg", wiki: "A Origem" },
      { id: "tt0088247", title: "O Exterminador do Futuro", orig: "The Terminator", series: "Terminator", year: 1984, dir: "James Cameron", g: ["Ação", "Ficção científica"], links: 100, scores: { metacritic: 8.4, rt: 9 }, img: P + "5/5a/Terminator1984.jpg", wiki: "The Terminator" },
      { id: "tt0468569", title: "Batman: O Cavaleiro das Trevas", oscars: ["atuacao"], series: "Batman", orig: "The Dark Knight", year: 2008, dir: "Christopher Nolan", g: ["Ação", "Crimes", "Drama"], links: 107, scores: { imdb: 9.1, metacritic: 8.5, rt: 9.4 }, img: P + "d/d1/The_Dark_Knight.jpg", wiki: "The Dark Knight" },
      { id: "tt0111161", title: "Um Sonho de Liberdade", orig: "The Shawshank Redemption", year: 1994, dir: "Frank Darabont", g: ["Drama", "Crimes"], links: 107, scores: { imdb: 9.3, metacritic: 8.2, rt: 8.9 }, img: P + "d/d2/The_Shawshank_Redemption_p%C3%B4ster.png", wiki: "The Shawshank Redemption" },
      { id: "tt0795461", title: "Todo Mundo em Pânico 5", orig: "Scary Movie 5", series: "Scary Movie", year: 2013, dir: "Malcolm D. Lee", g: ["Comédia", "Terror"], links: 33, scores: { metacritic: 1.1, rt: 0.4 }, img: P + "e/e6/Scary_Movie_5.jpg", wiki: "Scary Movie 5" },
      { id: "tt0068646", title: "O Poderoso Chefão", oscars: ["filme", "atuacao", "roteiro"], series: "O Padrinho", orig: "The Godfather", year: 1972, dir: "Francis Ford Coppola", g: ["Drama", "Crimes"], links: 133, scores: { imdb: 9.2, metacritic: 10, rt: 9.7 }, img: P + "d/de/Godfather_1972.jpg", wiki: "The Godfather" }
    ],
    fix: {
      // "tt0050083": { scores: { metacritic: 9.7 }, film: { title: "12 Homens e uma Sentença" }, include: true }
      "tt0071562": { film: { title: "O Poderoso Chefão: Parte II" } },
      "tt0099674": { film: { title: "O Poderoso Chefão: Parte III" } },
      "tt0120737": { film: { title: "O Senhor dos Anéis: A Sociedade do Anel" } },
      // títulos no Brasil dos cults abaixo
      "tt0137523": { film: { title: "Clube da Luta" } },
      "tt0081505": { film: { title: "O Iluminado" } },
      "tt0088846": { film: { title: "Brazil: O Filme" } },
      "tt0071853": { film: { title: "Monty Python em Busca do Cálice Sagrado" } },
      "tt0120669": { film: { title: "Medo e Delírio" } },
      "tt0075314": { film: { title: "Taxi Driver: Motorista de Táxi" } },
      "tt0062622": { film: { title: "2001: Uma Odisseia no Espaço" } },
      "tt0110912": { film: { title: "Pulp Fiction: Tempo de Violência" } },
      "tt0084787": { film: { title: "O Enigma de Outro Mundo" } },
      "tt0093779": { film: { title: "A Princesa Prometida" } },
      "tt0086541": { film: { title: "Videodrome: A Síndrome do Vídeo" } },
      "tt0109445": { film: { title: "O Balconista" } },
      "tt0091369": { film: { title: "Labirinto: A Magia do Tempo" } },
      "tt0083907": { film: { title: "A Morte do Demônio" } },
      "tt0089218": { film: { title: "Os Goonies" } },
      "tt0090728": { film: { title: "Os Aventureiros do Bairro Proibido" } },
      "tt1131734": { film: { title: "Garota Infernal" } },
      "tt0151804": { film: { title: "Como Enlouquecer Seu Chefe" } },
      "tt0082694": { film: { title: "Mad Max 2: A Caçada Continua" } },
      "tt0087995": { film: { title: "Repo Man: A Onda Punk" } },
      "tt0097493": { film: { title: "Atração Mortal" } },
      "tt0088258": { film: { title: "Isto é Spinal Tap" } },
    },
    // filmes cult (tag Cult): a Casa traz alguns por rodada (tagDraws.cult) e a tag vale para os que já estão no catálogo.
    // Todos com pelo menos 2 notas no Wikidata (conferido em out/2026)
    cult: [
      "tt0137523", "tt0246578", "tt0118715", "tt0083658", "tt0073629", "tt0110912", "tt0066921", "tt0081505", "tt0075314", "tt0105236",
      "tt0094625", "tt0088846", "tt0074486", "tt0368226", "tt0117951", "tt0446029", "tt0063350", "tt0083907", "tt0084787", "tt0120669",
      "tt0151804", "tt0374900", "tt0097493", "tt0087995", "tt0079501", "tt0096256", "tt0089218", "tt0091369", "tt0093779", "tt0071853",
      "tt0109445", "tt0109707", "tt0114436", "tt1131734", "tt0090728", "tt0086541", "tt0082694", "tt0088258", "tt0062622"
    ]
  };
});
