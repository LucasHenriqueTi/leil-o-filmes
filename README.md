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
4. No fim, cada filme vale a nota dele (IMDb; se não houver, Metacritic ou Rotten Tomatoes convertidos para 0 a 10). Somam-se os bônus das regras extras. Empate vai para quem guardou mais dinheiro.

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

## De onde vêm os filmes

Todas as fontes são gratuitas e não precisam de chave:

- **Wikidata**: sorteio entre milhares de filmes, gêneros, título em português e notas.
- **Wikipédia**: pôsteres e sinopses.
- **api.imdbapi.dev**: nota do IMDb ao vivo, quando responde.

Sem acesso a essas fontes, o jogo usa os 77 filmes embutidos em `public/catalog.js`. As buscas são feitas pelo navegador de quem joga, não pelo servidor.

## Estrutura

```
server.js            servidor: site + salas online (WebSocket)
lib/websocket.js     WebSocket sem dependências
public/engine.js     regras do jogo (roda igual no servidor e no navegador)
public/catalog.js    filmes, pôsteres, notas e sinopses
public/net.js        conexão com o servidor e reconexão automática
public/app.js        interface
public/styles.css    visual
test/                testes do motor e de uma partida online completa
```

## Segurança e limites

- O servidor é a autoridade: valida cada lance, roda os relógios e só manda para cada pessoa o que ela pode ver. Lances secretos e missões dos outros nunca saem do servidor antes da hora.
- Cada jogador tem um token guardado no navegador. Se a conexão cair ou a página recarregar, ele volta para o mesmo lugar.
- Se o host cair por mais de 20 segundos, outro jogador conectado assume a sala.
- As salas ficam na memória do servidor. Se o servidor reiniciar, as salas em andamento acabam. Salas vazias somem depois de 30 minutos.
- Limites: 10 jogadores e até 80 conexões por sala, 200 lotes, mensagens de chat com até 140 caracteres.

## Testes

```bash
npm test
```

Roda centenas de partidas simuladas no motor (todos os formatos, conferindo saldo, limites, sigilo do lance secreto e das missões) e uma partida online completa com 3 jogadores, 1 espectador e uma reconexão. O teste online precisa do Node 22 ou mais novo.
