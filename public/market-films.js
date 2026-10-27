/* ============================================================
   Martelo Live — filmes do Mercado que ficam no projeto
   - examples: filmes de exemplo, salvos aqui com notas e pôster. Ficam sempre no catálogo
     (funcionam até sem internet) e cobrem todas as raridades.
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
      { id: "tt0816692", title: "Interestelar", orig: "Interstellar", year: 2014, dir: "Christopher Nolan", g: ["Ficção científica", "Drama", "Aventura"], links: 98, scores: { imdb: 8.7, metacritic: 7.4, rt: 7.3 }, img: P + "3/3a/Interstellar_Filme.png", wiki: "Interstellar" },
      { id: "tt0441773", title: "Kung Fu Panda", year: 2008, dir: "John Stevenson", g: ["Animação", "Ação", "Comédia"], links: 87, scores: { metacritic: 7.4, rt: 8.7 }, img: P + "7/76/Kungfupanda.jpg", wiki: "Kung Fu Panda" },
      { id: "tt1375666", title: "A Origem", orig: "Inception", year: 2010, dir: "Christopher Nolan", g: ["Ficção científica", "Ação", "Mistério"], links: 97, scores: { imdb: 8.8, metacritic: 7.4, rt: 8.7 }, img: P + "8/84/AOrigemPoster.jpg", wiki: "A Origem" },
      { id: "tt0468569", title: "Batman: O Cavaleiro das Trevas", series: "Batman", orig: "The Dark Knight", year: 2008, dir: "Christopher Nolan", g: ["Ação", "Crimes", "Drama"], links: 107, scores: { imdb: 9.1, metacritic: 8.5, rt: 9.4 }, img: P + "d/d1/The_Dark_Knight.jpg", wiki: "The Dark Knight" },
      { id: "tt0111161", title: "Um Sonho de Liberdade", orig: "The Shawshank Redemption", year: 1994, dir: "Frank Darabont", g: ["Drama", "Crimes"], links: 107, scores: { imdb: 9.3, metacritic: 8.2, rt: 8.9 }, img: P + "d/d2/The_Shawshank_Redemption_p%C3%B4ster.png", wiki: "The Shawshank Redemption" },
      { id: "tt0068646", title: "O Poderoso Chefão", series: "O Padrinho", orig: "The Godfather", year: 1972, dir: "Francis Ford Coppola", g: ["Drama", "Crimes"], links: 133, scores: { imdb: 9.2, metacritic: 10, rt: 9.7 }, img: P + "d/de/Godfather_1972.jpg", wiki: "The Godfather" }
    ],
    fix: {
      // "tt0050083": { scores: { metacritic: 9.7 }, film: { title: "12 Homens e uma Sentença" }, include: true }
    }
  };
});
