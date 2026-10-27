// Vídeo 2: o Mercado (conta, estreias, raridades, leilões entre jogadores).
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AoVivo, CardRaridade, Chip, Fundo, Legenda, Tela, useFormato } from "./componentes";
import { centro } from "./cenas-comuns";
import { C, DISPLAY, Raridade } from "./tema";

/* conta: M$ 30 de boas-vindas e mesada toda segunda */
export const CenaConta: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const valor = Math.round(interpolate(f, [16, 46], [0, 30], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const pop = spring({ frame: f - 46, fps, config: { damping: 8, stiffness: 220 } });
  const w = (vertical ? 820 : 700) * u;
  return (
    <AbsoluteFill>
      <Fundo tom={C.coin} />
      <AbsoluteFill style={{ ...centro, flexDirection: vertical ? "column" : "row", gap: (vertical ? 50 : 90) * u, padding: 70 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 760) * u, display: "flex", flexDirection: "column", gap: 30 * u, alignItems: vertical ? "center" : "flex-start" }}>
          <Legenda texto="Crie sua conta e ganhe *M$ 30*." size={(vertical ? 84 : 76) * u} align={vertical ? "center" : "left"} />
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: (vertical ? 120 : 110) * u, color: C.coin, lineHeight: 1, transform: `scale(${f >= 46 ? interpolate(pop, [0, 1], [1.2, 1]) : 1})` }}>+M$ {valor}</div>
          <Chip texto="📅 Toda segunda tem mesada de M$ 30" at={64} size={(vertical ? 32 : 30) * u} cor={C.coin} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 * u, width: w }}>
          <Tela src="telas/carteira-v.png" width={w} at={8} zoom={0.02} radius={22} />
          <Tela src="telas/extrato-v.png" width={w} at={22} zoom={0.02} radius={22} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* estreias da Casa: do dia, da semana e do mês */
export const CenaEstreias: React.FC = () => {
  const { vertical, u } = useFormato();
  return (
    <AbsoluteFill>
      <Fundo tom={C.live} />
      <AbsoluteFill style={{ ...centro, flexDirection: vertical ? "column" : "row", gap: 70 * u, padding: 80 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 720) * u, display: "flex", flexDirection: "column", gap: 28 * u, alignItems: vertical ? "center" : "flex-start" }}>
          <AoVivo texto="ESTREIAS DA CASA" size={30 * u} />
          <Legenda texto="Leilões com *relógio correndo* e cópias novas." size={(vertical ? 76 : 70) * u} align={vertical ? "center" : "left"} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 * u, alignItems: vertical ? "center" : "flex-start" }}>
            <Chip texto="🎟️ Todo dia às 20h" at={40} size={32 * u} cor={C.live} />
            <Chip texto="🎬 Todo sábado: Raro e Épico" at={56} size={32 * u} cor={C.live} />
            <Chip texto="🏆 Todo dia 1º: Lendário e Obra de Arte" at={72} size={32 * u} cor={C.live} />
          </div>
        </div>
        <Tela src="telas/estreia-v.png" width={(vertical ? 740 : 620) * u} at={10} zoom={0.04} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* raridades: de Comum a Obra de Arte (notas e raridades calculadas pelo próprio Mercado) */
const CARDS: [string, number, string, Raridade, string][] = [
  ["Transformers", 2007, "6,0", "comum", "20 cópias"], ["Piratas do Caribe", 2003, "6,8", "incomum", "10 cópias"], ["Interestelar", 2014, "7,9", "raro", "5 cópias"],
  ["Asas", 1927, "8,3", "epico", "3 cópias"], ["Em Busca do Ouro", 1925, "8,8", "lendario", "1 cópia"], ["O Poderoso Chefão", 1972, "9,6", "obra", "cópia 1/1"]];
export const CenaRaridades: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame();
  const cw = (vertical ? 290 : 250) * u;
  return (
    <AbsoluteFill>
      <Fundo tom={f > 150 ? "#b48cff" : C.coin} />
      <AbsoluteFill style={{ ...centro, gap: 60 * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 1600) * u, minHeight: (vertical ? 240 : 0) * u }}>
          {f < 150 ? <Legenda texto="Cópias numeradas: *quanto mais raro, menos cópias*." size={(vertical ? 72 : 64) * u} />
            : <Legenda texto="Nota 9,5 ou mais vira *Obra de Arte*: uma cópia só." at={150} size={(vertical ? 72 : 64) * u} cor="#b48cff" />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${vertical ? 3 : 6}, ${cw}px)`, gap: 26 * u, alignItems: "end" }}>
          {CARDS.map(([t, y, n, r, rod], i) => <CardRaridade key={t} title={t} year={y} nota={n} raridade={r} rodape={rod} width={cw} at={12 + i * 14} destaque={r === "obra" && f > 150} />)}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* leilões entre jogadores: quatro formatos, reserva secreta e vitrine */
export const CenaLeiloes: React.FC = () => {
  const { vertical, u } = useFormato();
  const w = (vertical ? 860 : 620) * u;
  const fs = (vertical ? 30 : 28) * u;
  return (
    <AbsoluteFill>
      <Fundo tom={C.mint} />
      <AbsoluteFill style={{ ...centro, flexDirection: vertical ? "column" : "row", gap: (vertical ? 44 : 70) * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 620) * u, display: "flex", flexDirection: "column", gap: 28 * u, alignItems: vertical ? "center" : "flex-start" }}>
          <Legenda texto="Anuncie suas cópias e *venda para a galera*." size={(vertical ? 74 : 66) * u} align={vertical ? "center" : "left"} cor={C.mint} />
          <div style={{ display: "flex", gap: 12 * u, flexWrap: "wrap", justifyContent: vertical ? "center" : "flex-start", maxWidth: (vertical ? 900 : 600) * u }}>
            <Chip texto="🔨 Aberto" at={30} size={fs} /><Chip texto="✉️ Lance secreto" at={40} size={fs} /><Chip texto="🥈 Secreto de 2º preço" at={50} size={fs} />
            <Chip texto="⏱️ Relógio holandês" at={60} size={fs} /><Chip texto="🔒 Reserva secreta" at={80} size={fs} cor={C.coin} /><Chip texto="⭐ Vitrine" at={92} size={fs} cor={C.coin} />
          </div>
        </div>
        <Tela src="telas/leiloes-v.png" width={w} at={8} zoom={0.03} radius={22} maxH={(vertical ? 1000 : 940) * u} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
