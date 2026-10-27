// Cenas usadas nos dois vídeos. Cada cena funciona nas duas proporções: useFormato() diz se é vertical.
import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AoVivo, ChuvaDePosteres, Fundo, Legenda, Logo, useFormato } from "./componentes";
import { BODY, C, DISPLAY, SITE_URL } from "./tema";

export const centro: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" };

/* gancho: logo e a frase do vídeo, com pôsteres caindo */
export const CenaGancho: React.FC<{ texto: string; selo?: string; cor?: string }> = ({ texto, selo, cor = C.live }) => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 11 } });
  return (
    <AbsoluteFill>
      <Fundo tom={cor} />
      <ChuvaDePosteres n={vertical ? 16 : 14} opacity={0.4} />
      <AbsoluteFill style={{ ...centro, gap: 44 * u, padding: 80 * u }}>
        <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`, opacity: s }}><Logo size={(vertical ? 120 : 110) * u} /></div>
        {selo ? <div style={{ opacity: s }}><AoVivo texto={selo} size={34 * u} /></div> : null}
        <div style={{ maxWidth: (vertical ? 920 : 1400) * u }}><Legenda texto={texto} at={18} size={(vertical ? 96 : 92) * u} cor={cor} /></div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* donate: o alerta fica mais exagerado a cada real */
const TIERS: [number, string, string][] = [[1, "💰", "Doação"], [2, "💵", "Doação em dobro"], [3, "💸", "Chuva de dinheiro"], [5, "🔥", "Doação pegando fogo"], [8, "🚀", "Doação foguete"],
  [10, "💎", "Doação diamante"], [15, "👑", "Doação da realeza"], [20, "🌋", "Erupção de dinheiro"], [30, "🤯", "Mega doação"], [50, "☄️", "Doação lendária"], [100, "🏦", "O magnata chegou"]];
export const CenaDonate: React.FC = () => {
  const { vertical, u, width, height } = useFormato();
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const k = Math.max(0, Math.min(TIERS.length - 1, Math.floor((f - 8) / 7)));
  const [v, emo, titulo] = TIERS[k];
  const pop = spring({ frame: f - (8 + k * 7), fps, config: { damping: 8, stiffness: 220 } });
  // cresce a cada real, mas com teto para não sair do quadro (o vertical é mais estreito)
  const escala = (1 + Math.min(v, 60) * 0.004) * interpolate(pop, [0, 1], [0.92, 1]);
  const tremor = v >= 5 ? Math.min(2 + v / 3, 16) * 1.6 : 0;
  const tx = (random("tx" + f) - 0.5) * tremor * u, ty = (random("ty" + f) - 0.5) * tremor * u;
  const borda = v >= 30 ? `linear-gradient(${f * 6}deg, #ff4f6d, #ffd166, #4be3b0, #7aa7ff, #b48cff)` : v >= 3 ? `linear-gradient(160deg, ${C.coin}, #ff9d5c)` : C.coin;
  const pool = TIERS.slice(0, k + 1).map((t) => t[1]), chuva = Math.min(6 + k * 7, 70);
  return (
    <AbsoluteFill>
      <Fundo tom={v >= 30 ? "#b48cff" : C.coin} />
      {v >= 50 ? <AbsoluteFill style={{ opacity: 0.28, background: `repeating-conic-gradient(from ${f * 2}deg at 50% 55%, ${C.coin} 0 6deg, transparent 6deg 18deg)` }} /> : null}
      {Array.from({ length: chuva }, (_, i) => {
        const x = random("cx" + i) * width, y = ((random("cy" + i) * height * 1.2 + f * (8 + random("cv" + i) * 10)) % (height * 1.2)) - height * 0.1;
        return <span key={i} style={{ position: "absolute", left: x, top: y, fontSize: (30 + random("cs" + i) * 40) * u, transform: `rotate(${f * 4 + i * 30}deg)` }}>{pool[i % pool.length]}</span>;
      })}
      <AbsoluteFill style={{ ...centro, gap: 90 * u, padding: 70 * u, transform: `translate(${tx}px, ${ty}px)` }}>
        <div style={{ maxWidth: (vertical ? 960 : 1500) * u }}><Legenda texto="Doe antes da live e *roube a cena*." size={(vertical ? 80 : 68) * u} /></div>
        <div style={{ padding: 6 * u, borderRadius: 34 * u, background: borda, transform: `scale(${escala})`, boxShadow: `0 0 ${(20 + Math.min(v, 60) * 1.4) * u}px ${C.coin}88` }}>
          <div style={{ minWidth: 560 * u, borderRadius: 29 * u, background: C.surface, padding: `${28 * u}px ${46 * u}px`, textAlign: "center" }}>
            <div style={{ fontSize: (70 + Math.min(v, 60) * 0.6) * u, lineHeight: 1.1 }}>{emo}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24 * u, letterSpacing: "0.08em", textTransform: "uppercase", color: C.mute }}>{titulo}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: (76 + Math.min(v, 60) * 0.55) * u, lineHeight: 1.05, color: C.coin }}>R$ {v}</div>
            <div style={{ fontFamily: BODY, fontSize: 28 * u, color: C.ink, marginTop: 8 * u }}><b style={{ color: C.mint }}>Pinho</b> doou</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* convite final */
export const CenaConvite: React.FC<{ titulo: string; sub: string; cor?: string }> = ({ titulo, sub, cor = C.coin }) => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = spring({ frame: f - 30, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill>
      <Fundo tom={cor} />
      <ChuvaDePosteres n={12} opacity={0.14} />
      <AbsoluteFill style={{ ...centro, gap: 46 * u, padding: 80 * u }}>
        <Logo size={(vertical ? 110 : 96) * u} />
        <div style={{ maxWidth: (vertical ? 960 : 1500) * u }}><Legenda texto={titulo} at={8} size={(vertical ? 100 : 96) * u} cor={cor} /></div>
        <div style={{ fontFamily: BODY, fontSize: (vertical ? 40 : 36) * u, color: C.mute, textAlign: "center", maxWidth: (vertical ? 900 : 1400) * u }}>{sub}</div>
        <div style={{ opacity: s, transform: `translateY(${(1 - s) * 30}px)`, fontFamily: DISPLAY, fontWeight: 700, fontSize: (vertical ? 44 : 40) * u, color: C.coinInk,
          background: C.coin, padding: `${18 * u}px ${40 * u}px`, borderRadius: 22 * u }}>{SITE_URL}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
