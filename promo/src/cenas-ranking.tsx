// Vídeo 3: o ranking (pontos de cada filme, conjuntos em escada, tags, temporada e recompensas).
import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CardRaridade, Chip, Fundo, Legenda, Poster, Tela, useFormato } from "./componentes";
import { centro } from "./cenas-comuns";
import { BODY, C, DISPLAY, Raridade } from "./tema";

const n1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// pôster pequeno que cai no lugar
const Mini: React.FC<{ title: string; w: number; at: number }> = ({ title, w, at }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  if (f < at) return <div style={{ width: w }} />;
  const s = spring({ frame: f - at, fps, config: { damping: 12 } });
  return (
    <div style={{ width: w, borderRadius: w * 0.07, overflow: "hidden", boxShadow: "0 16px 40px rgba(0,0,0,0.5)", opacity: s, transform: `translateY(${(1 - s) * -60}px) rotate(${(1 - s) * 8}deg)` }}>
      <Poster title={title} width={w} />
    </div>
  );
};
// número que pula quando muda
const Pula: React.FC<{ valor: string; at: number; size: number; cor?: string }> = ({ valor, at, size, cor = C.mint }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  if (f < at) return <span style={{ fontSize: size }}>&nbsp;</span>;
  const s = spring({ frame: f - at, fps, config: { damping: 8, stiffness: 220 } });
  return <span style={{ display: "inline-block", fontFamily: DISPLAY, fontWeight: 800, fontSize: size, color: cor, transform: `scale(${interpolate(s, [0, 1], [1.4, 1])})` }}>{valor}</span>;
};

/* pontos: cada filme vale a nota; o Tomate Podre vale 10 − nota */
const FILMES: [string, number, Raridade, number, number, string][] = [
  ["O Poderoso Chefão", 1972, "obra", 9.6, 9.6, "cópia 1/1"], ["Cidade de Deus", 2002, "epico", 8.4, 8.4, "3 cópias"], ["Todo Mundo em Pânico 5", 2013, "podre", 0.9, 9.1, "cópia 1/1"]];
export const CenaPontos: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame();
  const cw = (vertical ? 300 : 280) * u, troca = 115;
  const total = FILMES.reduce((t, x, i) => t + (f >= 40 + i * 22 ? x[4] : 0), 0);
  return (
    <AbsoluteFill>
      <Fundo tom={f > troca ? "#8bc34a" : C.mint} />
      <AbsoluteFill style={{ ...centro, gap: 40 * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 1600) * u, minHeight: (vertical ? 200 : 0) * u }}>
          {f < troca ? <Legenda texto="Cada filme vale a *nota* dele." size={(vertical ? 76 : 70) * u} cor={C.mint} />
            : <Legenda texto="No Tomate Podre é ao contrário: *quanto pior, mais vale*." at={troca} size={(vertical ? 68 : 64) * u} cor="#8bc34a" />}
        </div>
        <div style={{ display: "flex", gap: 30 * u, alignItems: "flex-end" }}>
          {FILMES.map(([t, y, r, nota, vale, rod], i) => (
            <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * u }}>
              <CardRaridade title={t} year={y} nota={n1(nota)} raridade={r} rodape={rod} width={cw} at={8 + i * 10} destaque={r === "podre" && f > troca} />
              <Pula valor={`+${n1(vale)}`} at={40 + i * 22} size={56 * u} cor={r === "podre" ? "#8bc34a" : C.mint} />
              {r === "podre" && f > troca ? <span style={{ fontFamily: BODY, fontSize: 26 * u, color: C.ink }}>10 − 0,9 = 9,1</span> : null}
            </div>
          ))}
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 52 * u, color: C.ink }}>= <span style={{ color: C.mint }}>{n1(total)}</span> pontos</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* conjuntos em escada: começam pequenos e crescem a cada filme */
const NOLAN = ["Interestelar", "A Origem", "O Grande Truque", "Batman"];
const ESCADA: [string, string, string][] = [["🎞️ Trilogia", "3 filmes: +4", "+2 por filme, até +12"], ["🎬 Mesmo diretor", "3 filmes: +2", "+1 por filme, até +8"],
  ["📅 Década · 🎭 Gênero", "4 filmes: +1", "+1 por filme, até +5"]];
export const CenaConjuntos: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame();
  const at = [16, 38, 60, 82], n = at.filter((a) => f >= a).length, pts = n < 3 ? 0 : n === 3 ? 2 : 3;
  const pw = (vertical ? 210 : 190) * u, fs = (vertical ? 30 : 28) * u;
  return (
    <AbsoluteFill>
      <Fundo tom={C.coin} />
      <AbsoluteFill style={{ ...centro, gap: (vertical ? 40 : 34) * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 1600) * u }}><Legenda texto="Conjuntos crescem a *cada filme* a mais." size={(vertical ? 74 : 66) * u} /></div>
        <div style={{ display: "flex", gap: 18 * u }}>{NOLAN.map((t, i) => <Mini key={t} title={t} w={pw} at={at[i]} />)}</div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 40 * u, color: C.ink, background: `${C.mint}22`, border: `2px solid ${C.mint}88`, borderRadius: 999, padding: `${12 * u}px ${30 * u}px` }}>
          🎬 Mesmo diretor: Christopher Nolan · {n} {n === 1 ? "filme" : "filmes"} {n >= 3 ? <Pula key={pts} valor={`+${pts}`} at={at[n - 1]} size={40 * u} /> : <span style={{ color: C.mute }}>(a partir de 3)</span>}
        </div>
        <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: 14 * u, alignItems: "center" }}>
          {ESCADA.map(([nome, ini, mais], i) => <Chip key={nome} texto={`${nome}: ${ini}, ${mais}`} at={115 + i * 16} size={fs} cor={C.coin} />)}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* tags: cults, nacionais e Oscars por família também viram conjunto */
const GRUPOS: [string, string[], string, number][] = [
  ["🌀 Cults +3", ["Clube da Luta", "Donnie Darko", "O Grande Lebowski"], "#7aa7ff", 16],
  ["Cinema nacional +3", ["Cidade de Deus", "Central do Brasil", "Bacurau"], C.mint, 66],
  ["🎭 Oscar: Atuação +2", ["O Poderoso Chefão", "Batman", "Gladiador"], C.coin, 116]];
export const CenaTags: React.FC = () => {
  const { vertical, u } = useFormato();
  const pw = (vertical ? 170 : 150) * u;
  return (
    <AbsoluteFill>
      <Fundo tom="#b48cff" />
      <AbsoluteFill style={{ ...centro, gap: (vertical ? 34 : 50) * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 1600) * u }}><Legenda texto="Cults, nacionais e *Oscars* também viram conjunto." size={(vertical ? 66 : 62) * u} cor="#b48cff" /></div>
        <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: (vertical ? 30 : 50) * u, alignItems: "center" }}>
          {GRUPOS.map(([nome, filmes, cor, at]) => (
            <div key={nome} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 * u }}>
              <div style={{ display: "flex", gap: 12 * u }}>{filmes.map((t, i) => <Mini key={t} title={t} w={pw} at={at + i * 8} />)}</div>
              <Chip texto={nome} at={at + 26} size={(vertical ? 32 : 30) * u} cor={cor} />
            </div>
          ))}
        </div>
        <Chip texto="🏆 Oscar por família: Melhor filme · Atuação · Roteiro · Música · Visual · Técnica · Internacional" at={150} size={(vertical ? 24 : 26) * u} cor={C.coin} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* temporada: um gênero por mês fica em alta */
export const CenaTemporada: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = spring({ frame: f - 14, fps, config: { damping: 10 } });
  const pw = (vertical ? 200 : 180) * u;
  return (
    <AbsoluteFill>
      <Fundo tom={C.live} />
      <AbsoluteFill style={{ ...centro, gap: 40 * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 1600) * u }}><Legenda texto="Todo mês um gênero fica *em alta*." size={(vertical ? 76 : 70) * u} cor={C.live} /></div>
        <div style={{ transform: `scale(${s})`, fontFamily: BODY, fontWeight: 700, fontSize: 46 * u, color: C.ink, padding: `${16 * u}px ${36 * u}px`, borderRadius: 24 * u,
          background: `linear-gradient(90deg, ${C.live}44, ${C.ground})`, border: `2px solid ${C.live}` }}>🔥 Temporada: <b>Crimes</b></div>
        <div style={{ display: "flex", gap: 16 * u }}>{["Pulp Fiction", "O Poderoso Chefão", "Cidade de Deus"].map((t, i) => <Mini key={t} title={t} w={pw} at={30 + i * 10} />)}</div>
        <div style={{ display: "flex", gap: 14 * u, flexWrap: "wrap", justifyContent: "center" }}>
          <Chip texto="+2 pontos por filme do gênero" at={64} size={(vertical ? 32 : 30) * u} cor={C.live} /><Chip texto="+25% no valor da cópia" at={78} size={(vertical ? 32 : 30) * u} cor={C.live} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ranking de verdade e a coleção de quem está na frente */
export const CenaRankingTela: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame(), troca = 110;
  return (
    <AbsoluteFill>
      <Fundo tom={C.mint} />
      <AbsoluteFill style={{ ...centro, flexDirection: vertical ? "column" : "row", gap: (vertical ? 40 : 80) * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 640) * u, minHeight: (vertical ? 220 : 0) * u }}>
          {f < troca ? <Legenda texto="Veja quem está na frente e *de onde vêm* os pontos." size={(vertical ? 66 : 62) * u} align={vertical ? "center" : "left"} cor={C.mint} />
            : <Legenda texto="Toque num jogador e *veja a coleção* dele." at={troca} size={(vertical ? 66 : 62) * u} align={vertical ? "center" : "left"} cor={C.mint} />}
        </div>
        {f < troca ? <Tela key="r" src="telas/ranking-v.png" width={(vertical ? 760 : 640) * u} at={6} zoom={0.02} radius={20} maxH={(vertical ? 1300 : 960) * u} />
          : <Tela key="c" src="telas/colecao-outro-v.png" width={(vertical ? 720 : 580) * u} at={troca} zoom={0.02} radius={20} maxH={(vertical ? 1300 : 960) * u} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* recompensas: quem fica no topo vai ganhar M$ e filmes */
const PODIO: [string, string, string, number, string[]][] = [
  ["2º", "A", C.coin, 0.72, ["💰 M$", "🎞️ Filme"]], ["1º", "C", C.live, 1, ["💰 M$", "🎞️ Filme raro"]], ["3º", "K", C.mint, 0.55, ["💰 M$"]]];
export const CenaRecompensas: React.FC = () => {
  const { vertical, u, width, height } = useFormato();
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const bw = (vertical ? 270 : 300) * u, hmax = (vertical ? 520 : 420) * u;
  return (
    <AbsoluteFill>
      <Fundo tom={C.coin} />
      {Array.from({ length: 40 }, (_, i) => {
        const x = random("rx" + i) * width, y = ((random("ry" + i) * height * 1.2 + f * (6 + random("rv" + i) * 8)) % (height * 1.2)) - height * 0.1;
        return <span key={i} style={{ position: "absolute", left: x, top: y, fontSize: (28 + random("rs" + i) * 30) * u, opacity: 0.5, transform: `rotate(${f * 3 + i * 40}deg)` }}>{i % 3 ? "💰" : "🎞️"}</span>;
      })}
      <AbsoluteFill style={{ ...centro, gap: 50 * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 1600) * u }}><Legenda texto="Os melhores do ranking vão ganhar *M$ e até filmes*." size={(vertical ? 72 : 68) * u} /></div>
        <div style={{ display: "flex", gap: 20 * u, alignItems: "flex-end" }}>
          {PODIO.map(([pos, letra, cor, alt, premios], i) => {
            const s = spring({ frame: f - (20 + i * 12), fps, config: { damping: 12 } });
            return (
              <div key={pos} style={{ width: bw, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * u }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 * u, alignItems: "center", opacity: f >= 60 + i * 10 ? 1 : 0 }}>
                  {premios.map((p, k) => <Chip key={p} texto={p} at={60 + i * 10 + k * 6} size={(vertical ? 28 : 28) * u} cor={C.coin} />)}
                </div>
                <span style={{ width: 90 * u, height: 90 * u, borderRadius: "50%", background: cor, display: "grid", placeItems: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 42 * u, color: "#160d22", transform: `scale(${s})` }}>{letra}</span>
                <div style={{ width: "100%", height: hmax * alt * s, borderRadius: `${18 * u}px ${18 * u}px 0 0`, background: `linear-gradient(180deg, ${cor}, ${cor}33)`, display: "flex", justifyContent: "center", paddingTop: 16 * u }}>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 56 * u, color: "#160d22" }}>{pos}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontFamily: BODY, fontSize: (vertical ? 34 : 32) * u, color: C.mute, textAlign: "center" }}>Quanto mais alto no ranking, maior o prêmio.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
