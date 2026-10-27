// Os dois anúncios de 45 s (1350 quadros a 30 fps).
import { CenaColecao, CenaConvite, CenaDonate, CenaGancho } from "./cenas-comuns";
import { CenaConta, CenaEstreias, CenaLeiloes, CenaRaridades } from "./cenas-mercado";
import { CenaAssistir, CenaFormatos, CenaLance, CenaSala, CenaVotacao } from "./cenas-partida";
import { Roteiro } from "./Video";
import { C } from "./tema";

// vídeo 1: jogar com os amigos online e assistir
export const PARTIDA: Roteiro = [
  { cena: () => <CenaGancho texto="Leilão de filmes *ao vivo* com a galera." />, dur: 105 },
  { cena: CenaSala, dur: 195 },
  { cena: CenaFormatos, dur: 210 },
  { cena: CenaLance, dur: 210 },
  { cena: CenaDonate, dur: 135 },
  { cena: CenaAssistir, dur: 195 },
  { cena: CenaVotacao, dur: 180 },
  { cena: () => <CenaConvite titulo="Chame a galera e *crie uma sala*." sub="Sem cadastro e direto no navegador. É só mandar o link." cor={C.live} />, dur: 120 },
];

// vídeo 2: o Mercado
export const MERCADO: Roteiro = [
  { cena: () => <CenaGancho texto="Colecione filmes *raros* e dispute com a galera." selo="MERCADO" cor={C.coin} />, dur: 105 },
  { cena: CenaConta, dur: 180 },
  { cena: CenaEstreias, dur: 210 },
  { cena: CenaRaridades, dur: 255 },
  { cena: CenaLeiloes, dur: 240 },
  { cena: CenaColecao, dur: 210 },
  { cena: () => <CenaConvite titulo="Crie sua conta e ganhe *M$ 30*." sub="Estreias todo dia, cópias numeradas e um ranking da galera." />, dur: 150 },
];
