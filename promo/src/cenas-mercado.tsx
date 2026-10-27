// Vídeo 2: o Mercado (conta, estreias, raridades, catálogo, legenda e leilões entre jogadores).
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

/* estreias da Casa: do dia, da semana e do mês, com a Casa disputando */
export const CenaEstreias: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame();
  // a chance da Casa cai pela metade a cada cobertura
  const chance = f < 120 ? 60 : f < 150 ? 30 : 15, cs = (vertical ? 32 : 28) * u;
  return (
    <AbsoluteFill>
      <Fundo tom={C.live} />
      <AbsoluteFill style={{ ...centro, flexDirection: vertical ? "column" : "row", gap: (vertical ? 50 : 60) * u, padding: 70 * u }}>
        <div style={{ width: (vertical ? 960 : 760) * u, display: "flex", flexDirection: "column", gap: 24 * u, alignItems: vertical ? "center" : "flex-start" }}>
          <AoVivo texto="ESTREIAS DA CASA" size={30 * u} />
          <Legenda texto="Leilões com *relógio correndo* e cópias novas." size={(vertical ? 70 : 66) * u} align={vertical ? "center" : "left"} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 * u, alignItems: vertical ? "center" : "flex-start" }}>
            <Chip texto="🎟️ Todo dia: Comum e Incomum" at={30} size={cs} cor={C.live} />
            <Chip texto="🎬 Sábado: Raro e Épico" at={44} size={cs} cor={C.live} />
            <Chip texto="🏆 Dia 1º: Lendário, Obra e 🍅" at={58} size={cs} cor={C.live} />
            {f >= 90 ? <Chip key={chance} texto={`🏠 Casa: ${chance}% de chance de cobrir`} at={f < 120 ? 90 : f < 150 ? 120 : 150} size={cs} cor={C.coin} /> : null}
          </div>
        </div>
        <Tela src="telas/estreia-card.png" width={(vertical ? 940 : 900) * u} at={10} zoom={0.03} radius={24} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* raridades: de Comum a Obra de Arte, e o Tomate Podre (notas e raridades calculadas pelo próprio Mercado) */
const CARDS: [string, number, string, Raridade, string][] = [
  ["Transformers", 2007, "6,0", "comum", "20 cópias"], ["Piratas do Caribe", 2003, "6,8", "incomum", "10 cópias"], ["Interestelar", 2014, "7,9", "raro", "5 cópias"],
  ["O Exterminador do Futuro", 1984, "8,6", "epico", "3 cópias"], ["Batman", 2008, "8,9", "lendario", "1 cópia"],
  ["Todo Mundo em Pânico 5", 2013, "0,9", "podre", "cópia 1/1"], ["O Poderoso Chefão", 1972, "9,6", "obra", "cópia 1/1"]];
export const CenaRaridades: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame();
  const cw = (vertical ? 290 : 228) * u, troca = 140;
  return (
    <AbsoluteFill>
      <Fundo tom={f > troca ? "#8bc34a" : C.coin} />
      <AbsoluteFill style={{ ...centro, gap: 50 * u, padding: 50 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 1700) * u, minHeight: (vertical ? 230 : 0) * u }}>
          {f < troca ? <Legenda texto="Cópias numeradas: *quanto mais raro, menos cópias*." size={(vertical ? 68 : 62) * u} />
            : <Legenda texto="Nota altíssima vira *Obra de Arte*. Nota péssima vira *Tomate Podre*." at={troca} size={(vertical ? 64 : 60) * u} cor="#8bc34a" />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${vertical ? 3 : 7}, ${cw}px)`, gap: 22 * u, alignItems: "end", justifyContent: "center" }}>
          {CARDS.map(([t, y, n, r, rod], i) => <CardRaridade key={t} title={t} year={y} nota={n} raridade={r} rodape={rod} width={cw} at={12 + i * 13} destaque={(r === "obra" || r === "podre") && f > troca} />)}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* catálogo: filtros por raridade e gênero, e as tags que valem pontos */
export const CenaCatalogo: React.FC = () => {
  const { vertical, u } = useFormato();
  const fs = (vertical ? 30 : 28) * u;
  return (
    <AbsoluteFill>
      <Fundo tom="#7aa7ff" />
      <AbsoluteFill style={{ ...centro, gap: (vertical ? 36 : 40) * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 1600) * u }}><Legenda texto="Filtre o catálogo por *raridade e gênero*." size={(vertical ? 70 : 62) * u} cor="#7aa7ff" /></div>
        <div style={{ display: "flex", gap: 12 * u, flexWrap: "wrap", justifyContent: "center", maxWidth: (vertical ? 980 : 1500) * u }}>
          <Chip texto="🌀 Cult" at={40} size={fs} cor={C.coin} /><Chip texto="🏆 Oscar ×3" at={52} size={fs} cor={C.coin} /><Chip texto="Nacional" at={64} size={fs} cor={C.coin} />
          <Chip texto="🔥 em alta" at={76} size={fs} cor={C.live} /><Chip texto="Unanimidade" at={88} size={fs} /><Chip texto="Garimpo" at={100} size={fs} />
        </div>
        <Tela src="telas/catalogo-crimes-m.png" width={(vertical ? 960 : 1100) * u} at={8} zoom={0.02} radius={22} maxH={(vertical ? 1180 : 660) * u} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* legenda: tudo explicado no "?" do catálogo */
export const CenaLegenda: React.FC = () => {
  const { vertical, u } = useFormato();
  return (
    <AbsoluteFill>
      <Fundo tom={C.mint} />
      <AbsoluteFill style={{ ...centro, flexDirection: vertical ? "column" : "row", gap: (vertical ? 40 : 80) * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 680) * u, display: "flex", flexDirection: "column", gap: 24 * u, alignItems: vertical ? "center" : "flex-start" }}>
          <Legenda texto="Ficou com dúvida? *Está tudo* no ? do catálogo." size={(vertical ? 70 : 66) * u} align={vertical ? "center" : "left"} cor={C.mint} />
          <Chip texto="Raridades, selos, tags e pontos" at={30} size={(vertical ? 30 : 28) * u} />
        </div>
        <Tela src="telas/legenda-v.png" width={(vertical ? 700 : 600) * u} at={8} zoom={0.03} radius={18} maxH={(vertical ? 1150 : 960) * u} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* leilões entre jogadores: quatro formatos, reserva secreta e vitrine */
export const CenaLeiloes: React.FC = () => {
  const { vertical, u } = useFormato();
  const w = (vertical ? 900 : 780) * u;
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
        <div style={{ display: "flex", flexDirection: "column", gap: (vertical ? 20 : 14) * u, width: w }}>
          {[1, 2].map((i) => <Tela key={i} src={`telas/leilao-card-${i}.png`} width={w} at={8 + (i - 1) * 18} zoom={0.02} radius={20} />)}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
