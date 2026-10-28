/* ============================================================
   Martelo Live — filmes do Mercado que ficam no projeto
   - examples: filmes de exemplo, salvos aqui com notas e pôster. Ficam sempre no catálogo
     (funcionam até sem internet) e cobrem todas as raridades.
   - cult, marvel, dc: códigos do IMDb dos filmes com as tags Cult, Marvel e DC (listas feitas à mão).
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
      // títulos no Brasil dos filmes da Marvel e da DC (o Wikidata deixa muitos com o nome original)
      "tt0091225": { film: { title: "Howard, o Super-Herói" } },
      "tt0120611": { film: { title: "Blade: O Caçador de Vampiros" } },
      "tt0187738": { film: { title: "Blade II: O Caçador de Vampiros" } },
      "tt0120903": { film: { title: "X-Men: O Filme" } },
      "tt0290334": { film: { title: "X-Men 2" } },
      "tt0330793": { film: { title: "O Justiceiro" } },
      "tt0259324": { film: { title: "Motoqueiro Fantasma" } },
      "tt0450314": { film: { title: "O Justiceiro: Em Zona de Guerra" } },
      "tt1270798": { film: { title: "X-Men: Primeira Classe" } },
      "tt1071875": { film: { title: "Motoqueiro Fantasma: Espírito de Vingança" } },
      "tt0848228": { film: { title: "Os Vingadores" } },
      "tt0948470": { film: { title: "O Espetacular Homem-Aranha" } },
      "tt1430132": { film: { title: "Wolverine: Imortal" } },
      "tt1981115": { film: { title: "Thor: O Mundo Sombrio" } },
      "tt1843866": { film: { title: "Capitão América 2: O Soldado Invernal" } },
      "tt1872181": { film: { title: "O Espetacular Homem-Aranha 2: A Ameaça de Electro" } },
      "tt2395427": { film: { title: "Vingadores: Era de Ultron" } },
      "tt2250912": { film: { title: "Homem-Aranha: De Volta ao Lar" } },
      "tt1825683": { film: { title: "Pantera Negra" } },
      "tt4633694": { film: { title: "Homem-Aranha no Aranhaverso" } },
      "tt4154664": { film: { title: "Capitã Marvel" } },
      "tt6565702": { film: { title: "X-Men: Fênix Negra" } },
      "tt9032400": { film: { title: "Eternos" } },
      "tt10872600": { film: { title: "Homem-Aranha: Sem Volta para Casa" } },
      "tt7097896": { film: { title: "Venom: Tempo de Carnificina" } },
      "tt9114286": { film: { title: "Pantera Negra: Wakanda para Sempre" } },
      "tt10676048": { film: { title: "As Marvels" } },
      "tt16366836": { film: { title: "Venom: A Última Rodada" } },
      "tt0060153": { film: { title: "Batman: O Homem-Morcego" } },
      "tt0078346": { film: { title: "Superman: O Filme" } },
      "tt0081573": { film: { title: "Superman II: A Aventura Continua" } },
      "tt0084745": { film: { title: "O Monstro do Pântano" } },
      "tt0094074": { film: { title: "Superman IV: Em Busca da Paz" } },
      "tt0103776": { film: { title: "Batman: O Retorno" } },
      "tt0112462": { film: { title: "Batman Eternamente" } },
      "tt0327554": { film: { title: "Mulher-Gato" } },
      "tt0348150": { film: { title: "Superman: O Retorno" } },
      "tt0409459": { film: { title: "Watchmen: O Filme" } },
      "tt1133985": { film: { title: "Lanterna Verde" } },
      "tt1345836": { film: { title: "Batman: O Cavaleiro das Trevas Ressurge" } },
      "tt0770828": { film: { title: "O Homem de Aço" } },
      "tt2975590": { film: { title: "Batman vs Superman: A Origem da Justiça" } },
      "tt4116284": { film: { title: "LEGO Batman: O Filme" } },
      "tt7424200": { film: { title: "Os Jovens Titãs em Ação! Nos Cinemas" } },
      "tt7713068": { film: { title: "Aves de Rapina: Arlequina e Sua Emancipação Fantabulosa" } },
      "tt12361974": { film: { title: "Liga da Justiça de Zack Snyder" } },
      "tt6334354": { film: { title: "O Esquadrão Suicida" } },
      "tt6443346": { film: { title: "Adão Negro" } },
      "tt9362930": { film: { title: "Besouro Azul" } },
      "tt9663764": { film: { title: "Aquaman 2: O Reino Perdido" } },
      "tt11315808": { film: { title: "Coringa: Delírio a Dois" } },
    },
    // filmes cult (tag Cult): a Casa traz alguns por rodada (tagDraws.cult) e a tag vale para os que já estão no catálogo.
    // Todos com pelo menos 2 notas no Wikidata (conferido em out/2026)
    cult: [
      "tt0137523", "tt0246578", "tt0118715", "tt0083658", "tt0073629", "tt0110912", "tt0066921", "tt0081505", "tt0075314", "tt0105236",
      "tt0094625", "tt0088846", "tt0074486", "tt0368226", "tt0117951", "tt0446029", "tt0063350", "tt0083907", "tt0084787", "tt0120669",
      "tt0151804", "tt0374900", "tt0097493", "tt0087995", "tt0079501", "tt0096256", "tt0089218", "tt0091369", "tt0093779", "tt0071853",
      "tt0109445", "tt0109707", "tt0114436", "tt1131734", "tt0090728", "tt0086541", "tt0082694", "tt0088258", "tt0062622"
    ],
    // filmes com personagens dos quadrinhos da Marvel e da DC (de qualquer estúdio), como os cults: a Casa traz alguns
    // por rodada (tagDraws) e a tag vale para os que já estão no catálogo. Ficam de fora os quadrinhos dessas editoras
    // que ninguém vê como "filme da DC" (V de Vingança, RED, The Losers). Todos com pelo menos 2 notas (out/2026)
    marvel: [
      "tt0091225", "tt0120611", "tt0120903", "tt0187738", "tt0145487", "tt0286716", "tt0287978", "tt0290334", "tt0316654", "tt0359013",
      "tt0330793", "tt0120667", "tt0357277", "tt0376994", "tt0259324", "tt0413300", "tt0486576", "tt0371746", "tt0450314", "tt0800080",
      "tt0458525", "tt1228705", "tt1270798", "tt0800369", "tt0458339", "tt1071875", "tt0848228", "tt0948470", "tt1430132", "tt1300854",
      "tt1981115", "tt1843866", "tt2015381", "tt1872181", "tt1877832", "tt0478970", "tt2395427", "tt1502712", "tt3385516", "tt1211837",
      "tt1431045", "tt3498820", "tt3896198", "tt3501632", "tt2250912", "tt3315342", "tt5095030", "tt1270797", "tt4154756", "tt1825683",
      "tt5463162", "tt4633694", "tt6320628", "tt4154664", "tt4154796", "tt6565702", "tt4682266", "tt9032400", "tt3480822", "tt9376612",
      "tt10872600", "tt7097896", "tt9419884", "tt10648342", "tt9114286", "tt5108870", "tt6791350", "tt9362722", "tt10676048", "tt10954600",
      "tt6263850", "tt16366836", "tt8790086", "tt11057302", "tt10676052", "tt14513804", "tt20969586"
    ],
    dc: [
      "tt0060153", "tt0078346", "tt0081573", "tt0084745", "tt0086393", "tt0088206", "tt0094074", "tt0096895", "tt0103776", "tt0106364",
      "tt0112462", "tt0120207", "tt0118688", "tt0327554", "tt0372784", "tt0360486", "tt0348150", "tt0468569", "tt0409459", "tt1075747",
      "tt1133985", "tt1345836", "tt0770828", "tt2975590", "tt1386697", "tt4116284", "tt0974015", "tt0451279", "tt1477834", "tt7424200",
      "tt0448115", "tt7286456", "tt7126948", "tt7713068", "tt12361974", "tt6334354", "tt8912936", "tt1877830", "tt6443346", "tt0439572",
      "tt9362930", "tt10151854", "tt9663764", "tt11315808", "tt5950044"
    ]
  };
});
