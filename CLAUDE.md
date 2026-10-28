# Martelo Live: contexto do projeto

Leilão de filmes ao vivo para um grupo de amigos (Cibele, André, Kirito e Pinho). Começou como um MVP de um único HTML e virou um app Node com salas online. Toda a interface e todos os textos são em **português do Brasil**.

## Como rodar
- `npm start` sobe em http://localhost:3000. Não há dependências: é Node puro, sem `npm install`.
- `npm test` roda os testes do motor, do Mercado, do armazenamento e uma partida online completa com contas e reinício do servidor (o teste online precisa do Node 22 ou mais novo).
- Variáveis de ambiente: `PORT`; `ML_DATA` (arquivo do Mercado, padrão `data/market.json`, fora do git; `:memory:` não salva nada); `ML_ADMINS` (nomes separados por vírgula que viram admin ao criar a conta; a primeira conta criada sempre vira admin); `ML_FILMS=off` (desliga as buscas de filmes no Wikidata, usado nos testes).
- `npm run sim -- [semanas] [jogadores] [semente]` roda a simulação da economia (`scripts/simulate-economy.js`) com as regras de verdade, em memória, e imprime dinheiro em circulação, entradas e saídas, preços e cópias por raridade e o resultado por perfil (gastador, colecionador, especulador). `test/sim.test.js` roda 10 semanas e confere as contas.
- `npm run reset` apaga todos os dados do Mercado (o arquivo de `ML_DATA` e seu `.bak`). Recusa rodar com o servidor ligado, porque ele gravaria a memória de volta.
- `node scripts/build-preview.js` gera `dist/martelo-live-offline.html`, um arquivo único que roda só no modo mesmo aparelho.
- Deploy: Render, via `render.yaml`. Os passos estão no README.

## Arquitetura
- `public/engine.js`: regras puras do jogo, compartilhadas entre servidor e navegador (formato UMD). O estado é JSON simples. O tempo entra sempre como parâmetro `now` e nunca é lido de dentro do motor. `view(st, viewerId)` esconde os lances secretos, as missões dos outros jogadores, as notas dos filmes durante a live e os votos da melhor coleção (cada um vê o seu; depois de fechar, só a contagem, sem nomes).
- `server.js`: serve a pasta `public/` e a rota `/sala/:code`. As salas ficam em memória e o servidor é a autoridade: valida as ações e roda `Engine.tick` a cada 200 ms.
- `lib/websocket.js`: WebSocket próprio (RFC 6455), feito à mão porque o npm não estava disponível no ambiente original. Pode trocar por `ws` ou Socket.IO se quiser.
- Protocolo: o cliente envia `{t, id, d}` e o servidor responde com `{t:"ack", id, d}`. Mensagens empurradas pelo servidor: `state`, `chat`, `chat:history`, `react`, `kicked`.
- Ações aceitas: `room:create`, `room:join` (com token para reconexão e `watch` para espectador), `room:leave`, `room:settings`, `room:kick`, `game:start`, `game:act` (`bid`, `pass`, `sealed` ou `buy`), `game:next`, `game:lobby`, `game:vote` (`target`, jogadores e espectadores), `game:closeVote` (host), `room:donate` (`amount`, `text`), `chat:send`, `react` e `time`. A doação chega aos clientes como uma mensagem `chat` com o campo `donate` (o valor), e cada cliente toca o alerta.
- Ações do Mercado:

  | Ação | Envia | Responde |
  |---|---|---|
  | `auth:register` | `{name, password}` | `{session, me}`. A primeira conta e as de `ML_ADMINS` viram admin. |
  | `auth:login` | `{name, password}` | `{session, me}`. Erro genérico "Nome ou senha incorretos.". Bloqueia por nome e por conexão depois de `loginTries` erros. |
  | `auth:resume` | `{session}` | `{me}`, ou `{error, expired: true}` (aí o cliente apaga `ml-auth`). |
  | `auth:logout` | — | Revoga a sessão. |
  | `auth:password` | `{old, new}` | Troca a senha e revoga as outras sessões. |
  | `admin:reset` | `{name}` | `{name, temp}`. Só admin. Gera uma senha temporária e revoga as sessões da conta. |
  | `market:me` | — | `{me, ledger, collection}`; `collection` traz as cópias da conta com os dados do filme. |
  | `market:catalog` | — | `{films, refilledAt, refilling}`; do mais raro para o mais comum. |
  | `admin:refillCatalog` | — | `{added}`. Só admin. Busca `bootBatch` filmes novos. |
  | `market:auctions` | — | `{open, recent, next}`: estreias abertas, as últimas encerradas e a agenda. |
  | `market:bid` | `{id, amount}` | `{ok}`. Avisa quem foi superado. |
  | `market:sell` | `{copy}` | `{price}`. Vende a cópia para a Casa. |
  | `market:list` | `{copy, format, minutes, startsAt?, reserve?, startPrice?, startBid?, featured?}` | `{id}`. Anuncia uma cópia da coleção (leilão de jogador). |
  | `market:unlist` | `{id}` | Desiste do anúncio. Só o dono, só antes de ter lance; a taxa não volta. |

  O `market:bid` serve para todos os formatos: no Aberto é lance à vista; no Lance secreto e no Secreto de 2º preço, é lance escondido (dá para trocar); no Relógio holandês, compra na hora pelo preço atual (`amount` é ignorado) e responde `{closed: true, price}`. Nas estreias, se a Casa (comprador fantasma) cobriu o lance, responde `{house: true, high}`.
  | `admin:accounts` | — | `{accounts}`: carteira e coleção de todas as contas. Só admin. |
  | `admin:closeAuction` | `{id}` | `{result}`. Encerra agora: o vencedor paga e recebe a cópia, como no fim normal. Só admin. |
  | `admin:cancelAuction` | `{id}` | Cancela e devolve o lance. Só admin. |
  | `admin:openEstreia` | `{event}` (`day`, `week`, `month`) | `{id}`. Abre agora, sem mexer na agenda. Só admin. |
  | `admin:customEstreia` | `{film?, bands?, genres?, count?, format, minutes, minBid?, startPrice?, ghost?, name?}` | `{id, ids, titles}`. Estreias personalizadas (`openCustomEstreia`), abertas agora e avisadas a todos numa mensagem só. Só admin. |
  | `market:showcase` | — | Pública, sem login. `{open, featured, next, ranking (top 5), recent (10 filmes mais novos), season, stats}`: a vitrine da tela inicial. |
  | `market:ranking` | — | `{ranking, season}`: pontos de cada conta (com os bônus) e o gênero em alta no mês. |
  | `market:collection` | `{id}` | `{id, name, score, copies}`: a coleção de qualquer conta, aberta pelo ranking (`publicCollection`). Só filmes, cópias e pontos, nada da carteira. |
  | `admin:season` | `{genre}` | Troca o gênero em alta neste mês (vazio volta ao sorteio). Só admin. |
  | `admin:grant` | `{name, amount}` | Dá de M$ 1 a M$ 10.000 para uma conta (extrato: "Ajuste do admin"). Só admin. |

  Mensagens empurradas:
  - `market:me` para o dono quando a carteira ou a coleção muda;
  - `market:auctions` para todos que estão logados quando uma estreia muda;
  - `market:notice` com avisos ("seu lance foi superado", "você arrematou…");
  - `auth:out` quando a sessão daquela conexão foi revogada.
- `public/market.js` e `public/market-config.js`: regras puras do Mercado (UMD, recebem `now`) e todos os números calibráveis. A economia inteira é um documento JSON (`eco`):
  - `users`: conta e carteira `{free, reserved}`;
  - `sessions`: só o sha256 do token;
  - `ledger`: extrato, com um lançamento para cada movimentação;
  - `films`: catálogo, com notas congeladas, raridade, `supply` e `minted`;
  - `copies`: `{id, film, serial, owner, history}`;
  - `house`: estado da Casa (`refilledAt` e `next`, a agenda das estreias);
  - `auctions`: `{id, kind: "house" | "user", event, seller, format, film, copy, rarity, minBid, reserve, startPrice, featured, startsAt, endsAt, high, highBy, bids, sealed, extended, status: "scheduled" | "open" | "closed" | "canceled", result}`; `auctionSeq` numera os ids;
  - `sealed`: `{uid: {v, at}}`, os lances secretos;
  - `result`: `{winner, price, fee, copy, reserveMissed, reveal}`.

  Saldo só muda por `credit`, `debit`, `reserve`, `release` e `capture`. A invariante (`free + reserved` igual à soma do extrato) é testada.
- `lib/store.js`: a interface de armazenamento é `load()`/`save(doc)`. `JsonFileStore` grava num `.tmp` e troca pelo `rename`, guardando um `.bak`; `MemoryStore` é para os testes. Para usar SQLite ou Postgres, basta outra classe com os mesmos métodos.
- `lib/films.js`: só no servidor, para ninguém forjar a raridade. Busca os filmes do Mercado com o `fetch` do Node e `User-Agent` próprio:
  - `loadPool`: sorteio, numa consulta que já filtra quem tem 2 notas;
  - `fetchFilms`: título (pt-BR, depois artigo da Wikipédia em português, depois rótulo pt e en), ano, diretor, gêneros e notas P444;
  - uma nota por fonte: a de data mais recente; no RT, o Tomatometer (%) vem antes da média x/10;
  - pôster pela Wikipédia (`pageimages`), só de `upload.wikimedia.org`;
  - tags do Wikidata: `oscars` (prêmios P166 do filme, agrupados nas famílias de `OSCAR_FAMILIES`; Direção fica de fora porque o Wikidata registra no diretor, e Animação porque quase nenhum filme tem) e `nacional` (país de origem Brasil, P495 = Q155); `loadTagPool` sorteia filmes com a tag (`nacional` ou `oscar:<família>`) e notas suficientes, `fetchFacts` busca só as tags (para filmes antigos);
  - `fromSparql` é pura e testada sem rede.
- `public/market-films.js`: `examples` (filmes de exemplo salvos no projeto), `cult`, `marvel` e `dc` (códigos do IMDb das tags Cult, Marvel e DC, feitas à mão) e `fix` (correções manuais por IMDb: `scores`, `film`, `include: true`, aplicadas só no cadastro).
- `lib/auth.js`: senha com scrypt (sal aleatório, `timingSafeEqual`), tokens aleatórios, senha temporária e limitador de tentativas (na memória).
- No servidor, toda mudança no Mercado passa por `mutate(fn)`: uma fila que aplica a regra numa cópia (`structuredClone`), salva e só então troca o estado. Se der `{error}` ou falhar ao salvar, nada muda. O servidor só aceita conexões depois de carregar o arquivo. A mesada roda em `marketTick` no início e a cada 60 s; a data dela fica salva, então sobrevive a reinícios.
- `public/catalog.js`: fontes de dados gratuitas e sem chave, chamadas pelo navegador.
  - Wikidata (SPARQL): sorteio de filmes, gêneros e notas (propriedade P444).
  - Wikipédia: pôsteres e sinopses, buscando primeiro em português, depois em inglês e por último no IMDb.
  - api.imdbapi.dev: nota ao vivo.
  - Reserva: 77 filmes embutidos (lista `RAW`), incluindo os 16 indicados pelo grupo.
  - Antes de começar, `finalize()` congela título, nota e pôster de cada lote.
- `public/net.js`: conexão WebSocket com reconexão automática e ajuste de relógio com o servidor. Com `window.ML_OFFLINE = true`, o online fica desligado.
- `public/app.js`: interface feita em template strings com re-render completo. Telas: início, sala, ao vivo e final. Modos: `online` e `local` (mesmo aparelho, roda o motor no navegador e tem botão de desfazer).

## Regras do jogo
- O host define o dinheiro inicial (padrão R$ 20) e o limite de filmes por jogador. Lance mínimo R$ 1; o máximo é o saldo. Quem fica sem dinheiro ou bate o limite aguarda o fim.
- Formatos de leilão:
  - Aberto: turnos, quem passa sai do lote, tempo opcional por vez.
  - Lance secreto: todos lançam escondido; empate vai para quem enviou primeiro.
  - Relógio holandês: o preço começa no maior saldo e cai R$ 1 por intervalo; o primeiro a apertar compra.
  - Misto: cada lote sorteia um dos formatos marcados.
- Regras extras:
  - Mercado de gêneros: o gênero principal de cada compra conta; o top 3 dá +3, +2 e +1 ponto por filme.
  - Missões secretas: uma por jogador, sorteada a partir dos lotes, valendo de 3 a 5 pontos.
- Donate (só online, só na sala antes de começar): cada jogador pode doar a partir de R$ 1, quantas vezes quiser. O valor sai do dinheiro inicial (`p.donated`) e sempre sobra pelo menos R$ 1 para o leilão. `backToLobby` zera as doações.
- As notas não aparecem na live (palco, pôster ampliado e estado enviado aos clientes); só no fim.
- Dois jeitos de ganhar:
  - Soma das notas (0 a 10, IMDb; se não houver, Metacritic ou Rotten Tomatoes) mais os bônus. Empate vai para quem tem mais saldo.
  - Voto da galera: `finish()` abre a votação (`st.voting = "open"`, `st.votes = {quem vota: em quem}`). Jogadores e espectadores votam na melhor coleção, ninguém na própria, e dá para trocar até o host encerrar (`closeVote`). Espectadores votam com um id `w1`, `w2`... que o servidor guarda por token (`room.voters`). Empate nos votos fica com quem está na frente na soma das notas. No modo local, cada jogador escolhe o voto num painel da tela final.
- Mercado (modo separado, só online; as 5 fases):
  - Conta com nome e senha.
  - **Moeda própria: M$** (`currency`; `mny()` no app, `Market.money()` nas regras). Não se mistura com o R$ fictício da partida rápida, que não mexe na carteira.
  - Carteira persistente: M$ 30 de boas-vindas e mesada de M$ 30 toda segunda às 00:00 de Brasília, igual para todos.
  - Semanas em que o servidor ficou fora não acumulam (`allowanceCatchUp`).
  - **Nota de referência:** média ponderada das notas de IMDb, Metacritic e Rotten Tomatoes (0 a 10, uma casa), com pesos em `scoreWeights`. O RT vale 0,5, porque o Tomatometer é a % de críticas positivas, não uma nota. O filme só entra com pelo menos `minScores` (2) notas.
  - **Unanimidade:** selo quando a maior nota menos a menor dá até `unanimityMaxSpread` (1,0).
  - **Faixas** (`rarities`; nota mínima, cópias, lance mínimo):

    | Faixa (`key`) | Nome na tela | Nota | Cópias | Lance mínimo | Alvo no catálogo |
    |---|---|---|---|---|---|
    | Tomate Podre (`podre`) | Tomate Podre | até 1,5 | 1 | M$ 25 | ~1% |
    | Comum (`comum`) | Sessão da Tarde | até 6,5 | 20 | M$ 1 | ~40% |
    | Incomum (`incomum`) | Bem na Crítica | 6,6 | 10 | M$ 3 | ~28% |
    | Raro (`raro`) | Indicado | 7,6 | 5 | M$ 6 | ~18% |
    | Épico (`epico`) | Aclamado | 8,4 | 3 | M$ 10 | ~9% |
    | Lendário (`lendario`) | Imortal | 8,8 | 1 | M$ 15 | ~3% |
    | Obra de Arte (`obra`) | Absolute Cinema | 9,2 | 1 | M$ 25 | ~1% |

    Neste arquivo, as faixas são chamadas pelo nome antigo (o do `key`). O nome na tela é o `name` de `rarities` e pode mudar sem mexer nos dados salvos.
    - **Editor de nomes** (só com `testMode`, só para admin, no Mercado): painel "🏷️ Nomes das raridades" no canto da tela. Troca os nomes na hora, só naquele navegador (`ml-rarnames`; aberto ou fechado em `ml-rarnames-open`). Fora do modo de teste, valem os nomes do `market-config.js`. O servidor sempre usa os do `market-config.js` nos avisos.

    Os cortes foram calibrados num catálogo de 509 filmes para chegar nos alvos (já contando o Garimpo).
    - `requireScores` faz uma faixa exigir mais notas; hoje a Obra de Arte e o Tomate Podre pedem 2, o mesmo que `minScores`.
    - **Tomate Podre** é o avesso da Obra de Arte. É uma faixa invertida (`max` em vez de `min`), decidida antes das outras, e o Garimpo não mexe nela. Fica na lista logo abaixo da Obra de Arte, então é a segunda mais rara. Tem 1 cópia, o mesmo lance mínimo e o mesmo valor de referência da Obra de Arte, sai na estreia do mês e tem teto de 1 por jogador. Na coleção vale `10 − nota` pontos (`filmPoints`).
  - **Garimpo:** filme com menos de `garimpoBelowLinks` (25) páginas na Wikipédia sobe `garimpoBoost` (1) faixa, até `garimpoCap` (Raro). Nunca rebaixa e pula a faixa invertida.
  - **Congelamento:** nota, raridade, tiragem (`supply`) e Garimpo congelam na **primeira cópia emitida**. Antes disso, `refreeze` recalcula no início do servidor (o Garimpo, pelas páginas salvas em `links`), então mudar pesos, faixas ou o corte do Garimpo vale para os filmes ainda sem cópias.
  - **Cópias:** nascem aos poucos com `mintCopy` (`tt…#n`, "cópia n/total"), cada uma com dono (`"house"` ou id da conta) e histórico. `transferCopy` troca o dono sem mexer em dinheiro: o servidor junta transferência e pagamento na mesma `mutate`.
  - **Filmes de exemplo:** `examples` em `public/market-films.js`, 11 filmes que cobrem todas as faixas (o Épico é O Exterminador do Futuro, e o Tomate Podre, Todo Mundo em Pânico 5), salvos com notas e pôster. Ficam sempre no catálogo e funcionam sem internet.
  - **A Casa monta o catálogo sozinha** (`refillCatalog` no servidor):
    - sorteia no Wikidata filmes com pelo menos `catalogMinLinks` páginas que já têm 2 notas;
    - fora do modo de teste, completa até `catalogTarget` filmes com cópias por emitir, ao iniciar e a cada `catalogRefreshHours`;
    - o botão "Atualizar agora" do admin busca `bootBatch` filmes;
    - se a rede falhar, só registra no log (com até 3 tentativas para 429/5xx).
  - **Modo de teste** (`testMode: true`, desligar em produção). A cada início do servidor (`bootMarket`):
    1. cancela as estreias abertas, devolvendo os lances;
    2. tira do catálogo os filmes sem cópias, menos os exemplos (`pruneCatalog`);
    3. busca `bootBatch` (12) filmes novos;
    4. abre as 3 estreias na hora (`restartEstreias`).
  - **Estreias da Casa** (`estreias`). Cada uma leiloa 1 cópia de um filme sorteado das suas faixas: uma cópia nova (`mintCopy` no fechamento) ou uma do estoque da Casa.

    | Estreia | Quando | Faixas | Duração |
    |---|---|---|---|
    | do dia | todo dia às 20h | Comum e Incomum | 15 min |
    | da semana | sábado às 20h | Raro e Épico | 30 min |
    | do mês | dia 1º às 20h | Lendário, Tomate Podre e Obra de Arte | 60 min |

    A agenda fica em `eco.house.next` e sobrevive a reinícios.
  - **Estreia personalizada** (admin, botão "✨ Estreia personalizada" no painel do admin; `event: "custom"`, limites em `customEstreia`):
    - filme sorteado (`lotCandidates`, a mesma lista do `pickLot`) entre as raridades **e** os gêneros marcados (qualquer gênero do filme vale; nada marcado = todos), ou escolhido no catálogo;
    - no sorteio, dá para abrir várias de uma vez (`count`, até `customEstreia.maxCount`, 10): mesmas regras, um filme diferente em cada. É tudo ou nada: se faltar filme ou um valor não servir para algum deles (por exemplo, o preço inicial do relógio abaixo do mínimo da raridade), nenhuma abre. Com filme escolhido, é uma por vez; precisa ter cópia para emitir ou no estoque da Casa e não estar em outra estreia aberta;
    - qualquer formato dos jogadores (Aberto, Lance secreto, Secreto de 2º preço, Relógio holandês), com o mesmo fechamento: o vencedor paga e a cópia nasce (ou sai do estoque) para ele. Nos secretos, `settleSealed` (o mesmo dos leilões dos jogadores) escolhe o vencedor e o preço;
    - lance mínimo livre de M$ 1 a `dutchMaxStart` (em branco, o da raridade); no relógio, também o preço inicial;
    - duração de 1 minuto a `customEstreia.maxMinutes` (7 dias) e nome opcional (padrão "Estreia especial");
    - a Casa disputa (`ghost`) só no Aberto, e o admin pode desligar. O teto dela é o lance mínimo escolhido mais a porcentagem da faixa. `auctionTick` roda a cada segundo, mas só entra na fila quando há algo vencido (`dueAuctions`).
  - **Lance (`bid`):**
    - precisa ser pelo menos o lance mínimo da faixa, ou o maior lance + 1;
    - sai do saldo livre e fica reservado; quem foi superado recebe o reservado de volta na hora;
    - quem está na frente não pode cobrir o próprio lance;
    - um lance nos últimos `extendWindowSec` (30 s) soma `extendBySec` (30 s) ao relógio.
  - **Fechamento (`closeAuction`):** o vencedor paga com o reservado (`capture`, o dinheiro sai de circulação) e recebe a cópia. Sem lances, nada é emitido.
  - **Valor de referência (`refValue`):** lance mínimo da faixa × `refValueFactor` (2), na média com as últimas `refValueSales` (5) vendas. Recompras e emissões não entram.
  - **Recompra (`sellToHouse`):** `buybackPct` (40%) do valor de referência, nunca acima de lance mínimo − 1 (mínimo M$ 1). Assim não há lucro garantido em comprar barato numa estreia e revender para a Casa. A cópia volta ao estoque e pode sair numa próxima estreia.
  - **Leilões dos jogadores** (`listCopy`): o dono escolhe na coleção uma cópia e define:
    - formato (`userFormats`);
    - duração (`userDurations`, de 5 min a 3 dias);
    - início agora ou agendado (até `maxScheduleDays`, 7 dias);
    - lance inicial opcional (`startBid`, no Aberto e nos secretos): visível para todos, vira o `minBid` do leilão (de lance mínimo da raridade a `dutchMaxStart`). Sem escolha, começa no lance mínimo da raridade. No Secreto de 2º preço, quem vence paga pelo menos o lance inicial;
    - reserva secreta opcional;
    - vitrine.

    A cópia fica travada até o fim: não pode ser vendida para a Casa nem anunciada de novo.

    | Formato | Como funciona |
    |---|---|
    | Aberto (`open`) | Igual às estreias: lance à vista, maior lance + 1, prorrogação no fim. |
    | Lance secreto (`sealed`) | Cada um dá um lance escondido, reservado na carteira, e pode trocar até o fim. O maior leva e paga o próprio lance; empate fica com quem mandou antes. |
    | Secreto de 2º preço (`vickrey`) | Como o secreto, mas quem vence paga o segundo maior lance (no mínimo a reserva e o lance mínimo da raridade). |
    | Relógio holandês (`dutch`) | O preço cai em linha reta do `startPrice` até o piso (`dutchPrice`) ao longo da duração. O primeiro a comprar leva na hora. O "preço mínimo" do dono é o piso e fica visível, porque a tela calcula o preço caindo. |

    - **Reserva secreta:** só o dono vê o valor; os outros só sabem que existe (`hasReserve`). Abaixo dela, a cópia fica com o dono e os lances voltam (`reserveMissed`).
    - **Lances secretos:** ficam escondidos até o fim. Cada um vê só o seu (`myBid`); no fim, `reveal` mostra todos.
    - **Taxas** (todas saem de circulação):
      - `listingFee` (M$ 2) ao anunciar, não volta;
      - `featureFee` (M$ 5) para a vitrine, de graça a partir de `featureFreeFrom` (Épico);
      - `saleFeePct` (8%, arredondado) paga por quem vende.

      No fechamento (`closeUser`), o comprador paga com o reservado (`purchase`), o dono recebe o preço (`sale`) e paga a taxa (`fee`).
    - **Vitrine:** os leilões na vitrine aparecem primeiro e geram `market:notice` para todos ao serem anunciados e quando abrem.
    - **Limites:** `maxActiveUserAuctions` (6) anúncios no Mercado e `maxActivePerUser` (2) por jogador, contando agendados e abertos.
    - **Desistir:** `unlist` só funciona antes do primeiro lance.
    - **Agendados:** abrem em `startDue`, chamado pelo `auctionTick`.
  - **Teto por raridade** (`rarityCaps`: Lendário 2, Tomate Podre 1, Obra de Arte 1): `capCheck` conta as cópias que a conta tem e os leilões em que ela está na frente (ou tem lance secreto). Vale em todo lance e compra.
  - **Comprador fantasma** (`ghostBuyer`): só nas estreias da Casa, e só nas faixas raras. A cada lance abaixo do teto, a Casa sorteia se cobre.
    - **Teto** (`ghostAbove`, `ghostCeiling`): lance mínimo da faixa mais uma porcentagem fixa, que não sobe com vendas nem com a temporada. Fica escondido.
    - **Chance** (`ghostChance`, `ghostChance()`): começa na porcentagem da faixa e cai por `ghostDecay` (0,5) a cada cobertura (`a.ghostCovers`). A tela mostra a chance atual (`houseChance` no `auctionView`).
    - **Cobertura:** sobe `ghostStep` (25%) do caminho entre o lance mínimo e o teto, no mínimo +1, sem passar do teto (`highBy: "house"`, nada fica reservado).
    - O sorteio vem do parâmetro `rng` de `bid` (o servidor usa `Math.random`; os testes e a simulação passam o próprio).

    | Faixa | Lance mínimo | Teto da Casa | Chance | Preço médio para levar (um jogador) |
    |---|---|---|---|---|
    | Comum e Incomum | M$ 1 e M$ 3 | não disputa | — | o lance mínimo |
    | Raro | M$ 6 | +25% (M$ 8) | 25% | M$ 6,5 |
    | Épico | M$ 10 | +40% (M$ 14) | 40% | M$ 11 |
    | Lendário | M$ 15 | +60% (M$ 24) | 60% | M$ 17 |
    | Tomate Podre e Obra de Arte | M$ 25 | +80% (M$ 45) | 80% | M$ 32 |
    - Se a Casa termina na frente, nada é emitido (`result.house`).
    - Não atua nos leilões dos jogadores: lá, a Casa comprando criaria dinheiro do nada, e a reserva secreta do dono já cumpre esse papel.
  - **Pontos da coleção** (`collectionScore`): soma dos pontos dos filmes (cada filme conta uma vez; a nota de referência, ou `10 − nota` no Tomate Podre), mais os bônus de `collectionBonuses`:

    Os conjuntos são em escada (`setPoints`): com o mínimo de filmes valem os pontos iniciais, cada filme a mais soma `step`, até o teto `max`. Começam baixos para um trio fácil não valer muito, e o teto evita bola de neve com sagas e diretores grandes. Na simulação, os bônus ficam em ~18% dos pontos (eram ~20% com valores fixos).

    | Bônus | Regra | Começa com | A mais por filme | Teto |
    |---|---|---|---|---|
    | Trilogia | 3 filmes da mesma `series` (P179 do Wikidata, só séries de filmes Q24856) | +4 | +2 | +12 |
    | Mesmo diretor | 3 filmes | +2 | +1 | +8 |
    | Mesma década | 4 filmes | +1 | +1 | +5 |
    | Mesmo gênero | 4 filmes com o mesmo gênero principal (o primeiro da lista) | +1 | +1 | +5 |
    | Cults, Cinema nacional, Marvel, DC | 3 filmes com a mesma tag (um filme conta em mais de um conjunto) | +3 | +1 | +8 |
    | Oscar por família (`oscarSet`) | 3 filmes com Oscar da mesma família: Melhor filme, Atuação, Roteiro, Música, Visual, Técnica ou Filme internacional | +2 | +1 | +6 |
    | Temporada | cada filme do gênero em alta | +`seasonPts` (2) por filme | — | — |

    `rankingView` ordena as contas pelos pontos.
  - **Tags dos filmes** (`filmTags` no config; `filmTags(f)` e `tags` no card enviado à tela):
    - **Cult, Marvel e DC:** pelas listas `cult`, `marvel` e `dc` de `market-films.js`, aplicadas a todo o catálogo a cada início (`applyTags`; no servidor, `LIST_TAGS`). Marvel e DC são os filmes com personagens dessas editoras, de qualquer estúdio (MCU, X-Men, Homem-Aranha da Sony, Batman de Burton e Nolan, DCEU, Coringa…); ficam de fora os quadrinhos que ninguém vê como "filme da DC" (V de Vingança, RED). O Wikidata sozinho não serve para montar essas listas: só acha os filmes do Marvel Studios e mistura intrusos na DC. Os títulos no Brasil estão em `fix`.
    - **Oscar** (`oscars`, lista de famílias de `oscarFamilies`) e **Nacional:** vêm do Wikidata no cadastro. Filmes cadastrados antes das tags são completados no início, em segundo plano (`backfillTags`). Na tela, os Oscars viram um selo só ("🏆 Oscar ×3"), com as famílias no balão.
    - **Sorteio:** a cada rodada, a Casa reserva vagas do catálogo para filmes com tag que ainda não estão nele (`tagDraws`: 2 cults, 1 do Oscar de uma família diferente a cada rodada, 1 nacional, 1 da Marvel e 1 da DC), dentro do limite normal da rodada.
    - O Clássico ficou de fora por enquanto. "Nacional" inclui coproduções com o Brasil.
  - **Temporada** (`season`): um gênero de `seasonGenres` por mês, sorteado de forma fixa pelo mês. O admin pode trocar só naquele mês (`setSeason`, `eco.house.season`). Filme do gênero em alta vale `seasonValueBoost` (1,25×) no valor de referência, mas só quando a chamada passa `now` (os testes ficam estáveis).
- Lotes: aleatório (Wikidata, com faixas de popularidade Famosos, Conhecidos e Garimpo), por categoria ou escolhidos a dedo. A prévia dos lotes fica escondida até alguém pedir para ver.

## Visual
Tema de live stream. A base é ameixa escura (`--ground #150f1f`), o vermelho "no ar" é `--live #ff4f6d`, o dourado do dinheiro é `--coin #ffd166` e a menta da "sua vez" é `--mint #4be3b0`. Fontes: Unbounded nos títulos e Onest no texto. O lote aparece num "palco" 16:9 com o pôster desfocado ao fundo; os lances viram alertas, a venda vira o carimbo "Vendido!" e há chat com reações. O donate vira um alerta no topo da tela: `--lvl` cresce a cada real (tamanho, brilho, itens caindo, tempo na tela, notas do som) e as faixas `DON_TIERS` (1, 2, 3, 5, 8, 10, 15, 20, 30, 50 e 100 reais) trocam o visual e somam efeitos: tela tremendo, buzina, sirene, clarão, raios e voz lendo a mensagem. Os sons são gerados com Web Audio, sem arquivos, e o botão 🔊 do chat liga ou desliga (`ml-sound`). O chat tem seletor de emoji, e mensagens só de emoji aparecem grandes. O Mercado é organizado em abas no topo (`MTABS`): Painel, Estreias, Leilões, Coleção, Catálogo, Ranking, Carteira e Admin. A aba aberta fica em `S.mtab` (`ml-mtab`); qualquer botão com `data-mtab` troca de aba. Dentro das abas, os painéis usam `mpanel()` (sem esconder). O catálogo, a coleção e os últimos leilões encerrados têm dois modos, cada um com a própria escolha (`S.views`, salva em `ml-views`; o seletor é `viewToggle(chave)`): **Lista** (`filmRow`) e **Pôsteres** (`posterCard(f, {foot, detail, below, label})`: `foot` troca a linha do rodapé, `detail` soma ao detalhe, `below` põe botões embaixo do card, como Anunciar e Vender na coleção). No modo Pôsteres, a moldura do card mostra a raridade (cor de `--rar`; Lendário com reflexo; Obra de Arte com borda arco-íris animada; Tomate Podre com moldura verde de gosma e 🍅 no selo), o rodapé mostra título, ano, nota e cópias, e os detalhes (`.pdetail`) sobem por cima do pôster com o mouse em cima ou com foco (toque no celular, Tab no teclado). O Painel resume tudo: números clicáveis (`stat`), temporada, "Acontecendo agora" (`liveNow` + `miniAuction`), top do ranking (`rankList`) e filmes recém-chegados (`filmStrip`). A tela inicial mostra a vitrine pública do Mercado (`marketShowcase`, atualizada a cada 20 s), com o convite "Criar conta e ganhar M$ 30". A tela de criar conta mostra as vantagens e o que está acontecendo ao lado do formulário. O pôster ampliado abre ao passar o mouse em qualquer `[data-zoom]` e fecha ao tirar o mouse, clicar fora ou apertar Esc. Explicações não ocupam a tela: o texto fica resumido (por exemplo "Temporada: Ficção científica") e a descrição abre num balão (`#tipPop`) com o mouse em cima, foco pelo teclado ou toque (outro toque ou toque fora fecha). Use `tip(html)` para o botão "?" ao lado de um título ou `tipAttr(html)` em qualquer botão.

## Cuidados
- O estado do cliente é salvo no `localStorage` com o prefixo `ml-` (token, nome, configuração, partida local, painéis escondidos em `ml-fold`, cache de metadados, `ml-sound`, `ml-auth`, que é o token da conta do Mercado, e `ml-rarnames`, os nomes de teste das raridades).
- Todo painel usa `panel(key, título, corpo, extra, classe)` em `app.js`: o título vira botão de esconder e o corpo só é montado aberto. Informações da sala (`info`), donate e regras começam escondidos.
- As salas se perdem quando o servidor reinicia. No plano gratuito do Render, o servidor dorme depois de uns 15 minutos sem uso.
- O Mercado não se perde ao reiniciar, porque fica em `ML_DATA`. Mas o disco do Render gratuito é apagado a cada deploy, então o banco de produção do Mercado ainda precisa ser escolhido antes de publicar.
- Ao mudar o Mercado, atualize `market.js`, `market-config.js` e `test/market.test.js` juntos. Ao mudar a busca de filmes, atualize `lib/films.js` e `test/films.test.js`.
- O Wikidata nem sempre tem título brasileiro: alguns filmes ficam com o nome original (por exemplo "The Godfather"). Corrija em `fix` de `public/market-films.js`, com `film: {title}`.
- Antes de publicar o Mercado: `testMode: false` em `market-config.js`. Senão, cada deploy cancela as estreias e limpa o catálogo.
- Ao mudar as regras, atualize `engine.js` e `test/engine.test.js` juntos e rode `npm test`.
