# Martelo Live: contexto do projeto

Leilão de filmes ao vivo para um grupo de amigos (Cibele, André, Kirito e Pinho). Começou como um MVP de um único HTML e virou um app Node com salas online. Toda a interface e todos os textos são em **português do Brasil**.

## Como rodar
- `npm start` sobe em http://localhost:3000. Não há dependências: é Node puro, sem `npm install`.
- `npm test` roda os testes do motor, do Mercado, do armazenamento e uma partida online completa com contas e reinício do servidor (o teste online precisa do Node 22 ou mais novo).
- Variáveis de ambiente: `PORT`; `ML_DATA` (arquivo do Mercado, padrão `data/market.json`, fora do git; `:memory:` não salva nada); `ML_ADMINS` (nomes separados por vírgula que viram admin ao criar a conta; a primeira conta criada sempre vira admin).
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
  | `market:me` | — | `{me, ledger, collection}` |

  Mensagens empurradas: `market:me` para o dono quando a carteira muda, e `auth:out` quando a sessão daquela conexão foi revogada.
- `public/market.js` e `public/market-config.js`: regras puras do Mercado (UMD, recebem `now`) e todos os números calibráveis. A economia inteira é um documento JSON (`eco`):
  - `users`: conta e carteira `{free, reserved}`;
  - `sessions`: só o sha256 do token;
  - `ledger`: extrato, com um lançamento para cada movimentação;
  - `films`, `copies`, `auctions` e `house`: reservados para as próximas fases.

  Saldo só muda por `credit`, `debit`, `reserve`, `release` e `capture`. A invariante (`free + reserved` igual à soma do extrato) é testada.
- `lib/store.js`: a interface de armazenamento é `load()`/`save(doc)`. `JsonFileStore` grava num `.tmp` e troca pelo `rename`, guardando um `.bak`; `MemoryStore` é para os testes. Para usar SQLite ou Postgres, basta outra classe com os mesmos métodos.
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
- Mercado (modo separado, só online; fase 1 de 5):
  - Conta com nome e senha.
  - Carteira persistente: R$ 30 de boas-vindas e mesada de R$ 30 toda segunda às 00:00 de Brasília, igual para todos.
  - Semanas em que o servidor ficou fora não acumulam (`allowanceCatchUp`).
  - A partida rápida não mexe na carteira.
  - Próximas fases: raridade com cópias numeradas, Leilão da Casa, leilões de usuários, coleções e simulação de economia.
- Lotes: aleatório (Wikidata, com faixas de popularidade Famosos, Conhecidos e Garimpo), por categoria ou escolhidos a dedo. A prévia dos lotes fica escondida até alguém pedir para ver.

## Visual
Tema de live stream. A base é ameixa escura (`--ground #150f1f`), o vermelho "no ar" é `--live #ff4f6d`, o dourado do dinheiro é `--coin #ffd166` e a menta da "sua vez" é `--mint #4be3b0`. Fontes: Unbounded nos títulos e Onest no texto. O lote aparece num "palco" 16:9 com o pôster desfocado ao fundo; os lances viram alertas, a venda vira o carimbo "Vendido!" e há chat com reações. O donate vira um alerta no topo da tela: `--lvl` cresce a cada real (tamanho, brilho, itens caindo, tempo na tela, notas do som) e as faixas `DON_TIERS` (1, 2, 3, 5, 8, 10, 15, 20, 30, 50 e 100 reais) trocam o visual e somam efeitos: tela tremendo, buzina, sirene, clarão, raios e voz lendo a mensagem. Os sons são gerados com Web Audio, sem arquivos, e o botão 🔊 do chat liga ou desliga (`ml-sound`). O chat tem seletor de emoji, e mensagens só de emoji aparecem grandes. O pôster ampliado abre ao passar o mouse em qualquer `[data-zoom]` e fecha ao tirar o mouse, clicar fora ou apertar Esc.

## Cuidados
- O estado do cliente é salvo no `localStorage` com o prefixo `ml-` (token, nome, configuração, partida local, painéis escondidos em `ml-fold`, cache de metadados, `ml-sound` e `ml-auth`, que é o token da conta do Mercado).
- Todo painel usa `panel(key, título, corpo, extra, classe)` em `app.js`: o título vira botão de esconder e o corpo só é montado aberto. Informações da sala (`info`), donate e regras começam escondidos.
- As salas se perdem quando o servidor reinicia. No plano gratuito do Render, o servidor dorme depois de uns 15 minutos sem uso.
- O Mercado não se perde ao reiniciar, porque fica em `ML_DATA`. Mas o disco do Render gratuito é apagado a cada deploy, então o banco de produção do Mercado ainda precisa ser escolhido antes de publicar.
- Ao mudar o Mercado, atualize `market.js`, `market-config.js` e `test/market.test.js` juntos.
- Ao mudar as regras, atualize `engine.js` e `test/engine.test.js` juntos e rode `npm test`.
