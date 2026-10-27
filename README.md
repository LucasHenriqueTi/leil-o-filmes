# Martelo Live

Leilão de filmes ao vivo para jogar com amigos. Cada jogador começa com o mesmo dinheiro, os filmes entram em lotes, os lances aparecem na hora para todo mundo e vence quem montar a melhor coleção.

Funciona de dois jeitos:

- **Online**: cada um no seu celular ou computador, numa sala com código de 4 letras.
- **Mesmo aparelho**: todos na mesma tela, passando a vez. Funciona até sem o servidor.

O projeto **não tem dependências**. É só Node.js puro, sem `npm install`.

## Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
cd martelo-live
npm start
```

Abra `http://localhost:3000`. Para testar o online sozinho, abra uma segunda janela anônima e entre com o código da sala.

Para jogar com quem está na mesma rede Wi-Fi, descubra o IP do seu computador (por exemplo `192.168.0.12`) e mande `http://192.168.0.12:3000` para a galera.

## Publicar na internet (Render, plano gratuito)

O Render aceita WebSocket no plano gratuito e lê o arquivo `render.yaml` deste projeto.

1. Crie uma conta no [GitHub](https://github.com) e suba a pasta `martelo-live` para um repositório novo.
2. Crie uma conta no [Render](https://render.com) e clique em **New → Blueprint**.
3. Escolha o repositório. O Render encontra o `render.yaml` e cria o serviço sozinho.
4. Quando terminar, o site fica em um endereço como `https://martelo-live.onrender.com`.

Se preferir configurar na mão: **New → Web Service**, ambiente **Node**, comando de build vazio (ou `npm install`), comando de início `npm start`, health check em `/health`.

**Sobre o plano gratuito do Render:** o serviço dorme depois de uns 15 minutos sem acesso. O primeiro acesso depois disso demora cerca de um minuto para acordar. Durante a partida ele fica acordado normalmente.

### Outras opções

- **Railway** ou **Fly.io**: funcionam do mesmo jeito. Comando de início `npm start`; a porta vem da variável `PORT`, que eles definem sozinhos.
- **VPS própria** (qualquer servidor Linux): `PORT=80 node server.js`, de preferência atrás de um Nginx com HTTPS. No Nginx, libere o WebSocket no caminho `/ws` com os cabeçalhos `Upgrade` e `Connection`.
- **Só site estático** (Netlify, GitHub Pages, Vercel): a pasta `public/` funciona sozinha, mas apenas no modo **mesmo aparelho**. As salas online precisam do servidor.

## Como se joga

1. Quem cria a sala vira o host: define o dinheiro inicial, quantos filmes cada um pode comprar, os formatos e as regras extras, e sorteia os lotes.
2. A galera entra pelo link `/sala/CODIGO` ou digitando o código. Quem chega depois que o leilão começou entra como espectador e pode usar o chat e as reações.
3. Quem fica sem dinheiro ou bate o limite de filmes aguarda o fim.
4. As notas dos filmes ficam escondidas durante a live. No fim, há dois jeitos de ganhar:
   - **Soma das notas**: cada filme vale a nota dele (IMDb; se não houver, Metacritic ou Rotten Tomatoes convertidos para 0 a 10). Somam-se os bônus das regras extras. Empate vai para quem guardou mais dinheiro.
   - **Voto da galera**: jogadores e espectadores votam na melhor coleção (ninguém vota na própria). O voto é secreto até o host encerrar a votação. Empate fica com quem somou mais nota.

### Formatos de leilão

| Formato | Como funciona |
|---|---|
| Aberto | Lances em turnos. Lance mínimo R$ 1 acima do atual, máximo o seu saldo. Quem passa sai do lote. Pode ter tempo por vez. |
| Lance secreto | Todos lançam escondido ao mesmo tempo. Revela junto e o maior leva, pagando o próprio lance. Empate fica com quem enviou primeiro. |
| Relógio holandês | O preço começa no maior saldo da mesa e cai R$ 1 a cada intervalo. O primeiro a apertar "Comprar" leva pelo preço da tela. |
| Misto | Marque mais de um formato e cada lote sorteia o seu. |

### Regras extras

- **Mercado de gêneros** (inspirado em *Modern Art*, de Reiner Knizia): no fim, os três gêneros mais comprados dão +3, +2 e +1 ponto por filme. A bolsa aparece ao vivo durante o leilão.
- **Missões secretas**: cada jogador recebe um objetivo escondido (ter 2 filmes do mesmo gênero, terminar com dinheiro guardado, fazer a compra mais cara etc.) que vale de 3 a 5 pontos. As missões são sorteadas a partir dos filmes da partida, então sempre dá para cumprir.

### Donate na sala

Antes do leilão começar, cada jogador pode mandar um donate a partir de R$ 1, com uma mensagem opcional. Ele aparece na tela de todo mundo como um alerta de live, com som. Cada real a mais deixa o alerta maior, com mais itens caindo e mais tempo no ar. Nas faixas de R$ 5, 10, 20, 30, 50 e 100 entram tela tremendo, buzina, sirene, clarão, voz lendo a mensagem e outros exageros. O valor sai do dinheiro inicial de quem doou, que sempre fica com pelo menos R$ 1 para o leilão. O botão 🔊 no chat liga ou desliga o som. Só funciona nas salas online.

O chat também tem um seletor de emoji (botão 😀 ao lado do campo), e mensagens só com emoji aparecem em tamanho grande.

## Mercado (em construção)

O Mercado é um modo separado, com economia que fica salva entre as partidas. A partida rápida e o modo mesmo aparelho continuam iguais e não mexem no Mercado.

O que já funciona:

- **Conta**: nome e senha. A primeira conta criada vira admin. Se alguém esquecer a senha, um admin gera uma senha temporária pela tela do Mercado.
- **Moeda própria (M$)**: o dinheiro do Mercado é separado do R$ da partida rápida. Um não vira o outro.
- **Carteira**: M$ 30 de boas-vindas e uma mesada de M$ 30 toda segunda às 00:00 (horário de Brasília), igual para todos. Semanas em que o servidor ficou desligado não acumulam.
- **Extrato**: cada entrada e saída de dinheiro aparece com o motivo e a data.
- **Catálogo do Mercado**: a Casa escolhe os filmes sozinha. Ela sorteia no Wikidata filmes que tenham pelo menos 2 notas entre IMDb, Metacritic e Rotten Tomatoes. Há também 9 filmes de exemplo salvos no projeto, um ou mais por raridade, que aparecem até sem internet.
- **Nota de referência**: a média dessas notas, de 0 a 10. O Rotten Tomatoes vale metade, porque mede a porcentagem de críticas positivas e não é uma nota (87% não quer dizer 8,7). Quando as notas quase não discordam (diferença de até 1 ponto), o filme ganha o selo **Unanimidade**.
- **Raridade**: a nota define quantas cópias o filme vai ter, e cada cópia é numerada ("cópia 2/3"), com dono e histórico de vendas.

  | Raridade | Nota | Cópias | Lance mínimo |
  |---|---|---|---|
  | Comum | até 6,4 | 20 | M$ 1 |
  | Incomum | 6,5 a 7,2 | 10 | M$ 3 |
  | Raro | 7,3 a 7,9 | 5 | M$ 6 |
  | Épico | 8,0 a 8,4 | 3 | M$ 10 |
  | Lendário | 8,5 a 9,4 | 1 | M$ 15 |
  | Obra de Arte | 9,5 a 10, com as 3 notas | 1 | M$ 25 |

- **Garimpo**: um filme pouco lembrado (menos de 30 páginas na Wikipédia) sobe uma raridade, até Épico.
- **Estreias da Casa**: é assim que as cópias entram no jogo. Cada estreia leiloa uma cópia, nova ou recomprada:

  | Estreia | Quando | Raridades | Duração |
  |---|---|---|---|
  | do dia | todo dia às 20h | Comum ou Incomum | 15 min |
  | da semana | sábado às 20h | Raro ou Épico | 30 min |
  | do mês | dia 1º às 20h | Lendário ou Obra de Arte | 60 min |

  O lance fica reservado na carteira. Se alguém passar, o dinheiro volta na hora. Um lance nos últimos 30 segundos soma mais 30 segundos ao relógio. Quem vence paga e recebe a cópia numerada.
- **Venda para a Casa**: na Coleção, cada cópia tem o botão "Vender para a Casa". A Casa paga 40% do valor de referência, que é o lance mínimo da raridade × 2, na média com as últimas vendas do filme. Ela nunca paga mais que o lance mínimo da raridade, então comprar barato numa estreia e revender não dá lucro. A cópia volta para o estoque e pode sair numa próxima estreia.

**Ferramentas do admin** (painel na tela do Mercado, só para admins):
- encerrar uma estreia antes do tempo (quem está na frente paga e recebe a cópia na hora);
- cancelar uma estreia (o lance volta);
- abrir uma estreia do dia, da semana ou do mês fora da agenda;
- dar M$ para uma conta de teste;
- ver a carteira e a coleção de todas as contas.

**Zerar o Mercado:** com o servidor desligado, rode `npm run reset`. Apaga contas, carteiras, catálogo, cópias e estreias. No próximo início tudo começa do zero, e a primeira conta criada vira admin.

**Modo de teste** (ligado por enquanto, em `testMode`): toda vez que o servidor liga, as estreias abertas são canceladas (com os lances devolvidos), o catálogo volta aos exemplos mais os filmes que já têm dono, a Casa busca 12 filmes novos e as três estreias abrem na hora. Desligue antes de publicar.

### Leilões entre jogadores

Na Coleção, o botão **Anunciar** coloca uma cópia sua em leilão para os outros jogadores. Você escolhe:

- **Formato:**

  | Formato | Como funciona |
  |---|---|
  | Aberto | Lances à vista, sempre maiores. Lance nos últimos 30 s soma mais 30 s. |
  | Lance secreto | Cada um dá um lance escondido e pode trocar até o fim. O maior leva e paga o próprio lance. |
  | Secreto de 2º preço | Lances escondidos. O maior leva, mas paga o valor do segundo maior lance. |
  | Relógio holandês | O preço começa no valor que você escolher e cai até o mínimo. O primeiro a apertar "Comprar" leva. |

- **Duração** (de 5 minutos a 3 dias) e **início** (agora ou agendado para até 7 dias depois).
- **Reserva secreta** (opcional): abaixo dela a cópia não é vendida, continua sua e os lances voltam. Os outros só sabem que existe uma reserva, não o valor.
- **Vitrine**: o leilão aparece em destaque e todo mundo recebe um aviso.

**Custos:** anunciar custa M$ 2. A vitrine custa mais M$ 5, e é de graça para Épico, Lendário e Obra de Arte. Quem vende paga 8% do preço. As taxas saem de circulação, o que segura a inflação. Até 6 leilões de jogadores podem estar anunciados ao mesmo tempo, no máximo 2 por pessoa. Dá para desistir de um anúncio enquanto ninguém deu lance.

Os lances funcionam como nas estreias: o valor fica reservado na carteira e volta se você for superado ou se o leilão não vender.

### Como a tela do Mercado é organizada

A tela inicial mostra o Mercado ao vivo, mesmo para quem ainda não tem conta: estreias acontecendo, ranking, filmes que chegaram ao catálogo e a temporada, com o convite para criar conta.

Dentro do Mercado, as abas no topo separam cada assunto:

| Aba | O que tem |
|---|---|
| Painel | Resumo: saldo, pontos, coleção, o que está ao vivo, ranking e novidades. |
| Estreias | As estreias da Casa e os últimos leilões encerrados (em lista ou em pôsteres, com o resultado no rodapé). |
| Leilões | Leilões entre jogadores. |
| Coleção | Suas cópias, em lista ou em pôsteres (com o número da cópia no rodapé), com os botões de anunciar e de vender para a Casa. |
| Catálogo | Os filmes do Mercado, em **Lista** ou em **Pôsteres**. Nos pôsteres, a moldura indica a raridade (Lendário brilha, Obra de Arte tem borda arco-íris), o rodapé traz título, ano, nota e cópias, e passar o mouse (ou tocar) mostra os detalhes. |
| Ranking | Ranking de colecionadores e temporada. |
| Carteira | Saldo, extrato e senha. |
| Admin | Só para admins. |

### Pontos, temporada e competição

- **Pontos da coleção:** cada filme vale a nota de referência dele (uma vez, mesmo com duas cópias). Os bônus somam:
  - 3 filmes da mesma série (trilogia): +8;
  - 3 do mesmo diretor: +5;
  - 4 da mesma década: +3;
  - 4 do mesmo gênero: +3.

  O **Ranking de colecionadores** mostra quem está na frente.
- **Temporada:** a cada mês, um gênero fica em alta. Cada filme dele vale +2 pontos e 25% a mais no valor de referência. O gênero aparece no ranking e nos filmes, com a etiqueta 🔥 em alta.
- **Teto por raridade:** cada jogador pode ter no máximo 2 Lendários e 1 Obra de Arte, contando os leilões em que está na frente.
- **A Casa compete nas estreias:** ela tem um teto escondido, perto do valor de referência. Se você dá um lance abaixo dele, a Casa cobre na hora. Para levar, é preciso passar do lance dela. Se ela terminar na frente, a cópia não sai. Assim, as estreias continuam disputadas mesmo com poucos jogadores.

### Simulação da economia

`npm run sim` simula um ano com 6 jogadores (gastador, colecionador e especulador) usando as regras de verdade. Mostra o dinheiro em circulação mês a mês, o que entrou e saiu, os preços e cópias por raridade e como cada perfil terminou. Para mudar: `npm run sim -- 26 4` (26 semanas, 4 jogadores). Use para calibrar os números em `public/market-config.js`.

Os números (mesada, raridades, cópias, estreias, recompra etc.) ficam em `public/market-config.js`. Os filmes de exemplo e as correções (uma nota ou um título que veio errado do Wikidata, ou um filme incluído à mão) ficam em `public/market-films.js`. Os dados ficam em `data/market.json`; dá para mudar o caminho com a variável `ML_DATA`.

**Atenção:** no Render gratuito, o disco é apagado a cada deploy. O Mercado ainda não está pronto para produção. Antes de publicar, é preciso escolher onde os dados vão ficar.

## De onde vêm os filmes

Todas as fontes são gratuitas e não precisam de chave:

- **Wikidata**: sorteio entre milhares de filmes, gêneros, título em português e notas.
- **Wikipédia**: pôsteres e sinopses.
- **api.imdbapi.dev**: nota do IMDb ao vivo, quando responde.

Sem acesso a essas fontes, o jogo usa os 77 filmes embutidos em `public/catalog.js`. Na partida rápida, as buscas são feitas pelo navegador de quem joga. No Mercado, quem busca é o servidor e congela as notas, para ninguém conseguir forjar a raridade de um filme.

## Estrutura

```
server.js            servidor: site + salas online (WebSocket) + Mercado
lib/websocket.js     WebSocket sem dependências
lib/store.js         onde o Mercado é salvo (arquivo JSON; trocável por um banco)
lib/auth.js          senhas e sessões do Mercado
lib/films.js         busca de filmes e notas do Mercado no Wikidata (servidor)
public/engine.js     regras do jogo (roda igual no servidor e no navegador)
public/market.js     regras do Mercado: contas, carteira, extrato, mesada, raridade, cópias
public/market-config.js  números do Mercado para calibrar
public/market-films.js   correções manuais de notas e títulos do Mercado
public/catalog.js    filmes, pôsteres, notas e sinopses
public/net.js        conexão com o servidor e reconexão automática
public/app.js        interface
public/styles.css    visual
test/                testes do motor, do Mercado, do armazenamento e de uma partida online completa
```

## Segurança e limites

- O servidor é a autoridade: valida cada lance, roda os relógios e só manda para cada pessoa o que ela pode ver. Lances secretos e missões dos outros nunca saem do servidor antes da hora.
- Cada jogador tem um token guardado no navegador. Se a conexão cair ou a página recarregar, ele volta para o mesmo lugar.
- Se o host cair por mais de 20 segundos, outro jogador conectado assume a sala.
- As salas ficam na memória do servidor. Se o servidor reiniciar, as salas em andamento acabam. Salas vazias somem depois de 30 minutos.
- Senhas do Mercado nunca são guardadas, só um hash (scrypt com sal). O token de login fica no navegador, e o servidor guarda só o hash dele. Depois de 5 senhas erradas, o login daquele nome fica bloqueado por 5 minutos.
- Limites: 10 jogadores e até 80 conexões por sala, 200 lotes, mensagens de chat com até 140 caracteres.

## Testes

```bash
npm test
```

Roda centenas de partidas simuladas no motor (todos os formatos, conferindo saldo, limites, sigilo do lance secreto e das missões) e uma partida online completa com 3 jogadores, 1 espectador e uma reconexão. Testa também as regras do Mercado (carteira, extrato, mesada, sessões), o arquivo de dados (inclusive a recuperação de um arquivo corrompido) e o fluxo de contas online, com um reinício do servidor no meio para conferir que nada se perde. O teste online precisa do Node 22 ou mais novo.
