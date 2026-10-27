// Os três anúncios de 45 s (1350 quadros a 30 fps).
import { CenaConvite, CenaDonate, CenaGancho } from "./cenas-comuns";
import { CenaCatalogo, CenaConta, CenaEstreias, CenaLegenda, CenaLeiloes, CenaRaridades } from "./cenas-mercado";
import { CenaAssistir, CenaFormatos, CenaLance, CenaMesmoAparelho, CenaSala, CenaVotacao } from "./cenas-partida";
import { CenaConjuntos, CenaPontos, CenaRankingTela, CenaRecompensas, CenaTags, CenaTemporada } from "./cenas-ranking";
import { Roteiro } from "./Video";
import { C } from "./tema";

// vídeo 1: leilão ao vivo com convidados (online) ou no mesmo aparelho
export const PARTIDA: Roteiro = [
  { cena: () => <CenaGancho texto="Leilão de filmes *ao vivo* com a galera." />, dur: 105 },
  { cena: CenaSala, dur: 180 },
  { cena: CenaMesmoAparelho, dur: 150 },
  { cena: CenaFormatos, dur: 195 },
  { cena: CenaLance, dur: 180 },
  { cena: CenaDonate, dur: 120 },
  { cena: CenaAssistir, dur: 165 },
  { cena: CenaVotacao, dur: 150 },
  { cena: () => <CenaConvite titulo="Online com link ou *no mesmo aparelho*." sub="Sem cadastro, direto no navegador. Chame a galera." cor={C.live} />, dur: 105 },
];

// vídeo 2: o Mercado, explicado
export const MERCADO: Roteiro = [
  { cena: () => <CenaGancho texto="Colecione filmes *raros* e dispute com a galera." selo="MERCADO" cor={C.coin} />, dur: 90 },
  { cena: CenaConta, dur: 150 },
  { cena: CenaEstreias, dur: 195 },
  { cena: CenaRaridades, dur: 225 },
  { cena: CenaCatalogo, dur: 195 },
  { cena: CenaLegenda, dur: 150 },
  { cena: CenaLeiloes, dur: 195 },
  { cena: () => <CenaConvite titulo="Crie sua conta e ganhe *M$ 30*." sub="Estreias todo dia, cópias numeradas e leilões entre a galera." />, dur: 150 },
];

// vídeo 3: o ranking (pontos, conjuntos, tags, temporada e recompensas)
export const RANKING: Roteiro = [
  { cena: () => <CenaGancho texto="Quem tem a *melhor coleção* da galera?" selo="RANKING" cor={C.mint} />, dur: 105 },
  { cena: CenaPontos, dur: 180 },
  { cena: CenaConjuntos, dur: 225 },
  { cena: CenaTags, dur: 195 },
  { cena: CenaTemporada, dur: 120 },
  { cena: CenaRankingTela, dur: 225 },
  { cena: CenaRecompensas, dur: 195 },
  { cena: () => <CenaConvite titulo="Monte sua coleção e *suba no ranking*." sub="Crie sua conta e ganhe M$ 30 para começar." cor={C.mint} />, dur: 105 },
];

