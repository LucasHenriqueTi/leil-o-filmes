// Peças do vídeo que recriam o visual do app: fundo, selo AO VIVO, legenda, tela do app,
// alerta de lance, carimbo "Vendido!", pôster gerado e card com moldura de raridade.
import React from "react";
import { AbsoluteFill, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BODY, C, DISPLAY, hue, POSTERES, RARIDADES, Raridade } from "./tema";

// formato atual: unidade = 1 px num quadro de 1080 de lado menor; vertical = 9:16
export function useFormato() {
  const { width, height, fps } = useVideoConfig();
  return { vertical: height > width, u: Math.min(width, height) / 1080, width, height, fps };
}

// entra e sai com fade nas bordas da cena
export const Cena: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, 8, dur - 8, dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Fundo: React.FC<{ tom?: string }> = ({ tom = C.live }) => {
  const f = useCurrentFrame();
  const x = 30 + Math.sin(f / 40) * 10, y = 25 + Math.cos(f / 50) * 8;
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <AbsoluteFill style={{ background: `radial-gradient(70% 60% at ${x}% ${y}%, ${tom}33, transparent 70%), radial-gradient(60% 50% at 80% 90%, ${C.coin}22, transparent 70%)` }} />
    </AbsoluteFill>
  );
};

export const AoVivo: React.FC<{ texto?: string; size?: number }> = ({ texto = "AO VIVO", size = 22 }) => {
  const f = useCurrentFrame();
  const piscando = 0.25 + 0.75 * Math.abs(Math.cos(f / 10));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.4, background: C.live, color: "#fff", fontFamily: DISPLAY, fontWeight: 700,
      fontSize: size, letterSpacing: "0.04em", padding: `${size * 0.3}px ${size * 0.55}px`, borderRadius: size * 0.35, whiteSpace: "nowrap" }}>
      <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: "50%", background: "#fff", opacity: piscando }} />
      {texto}
    </span>
  );
};

export const Logo: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
    <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, color: C.ink, letterSpacing: "-0.02em" }}>martelo</span>
    <AoVivo texto="live" size={size * 0.4} />
  </div>
);

// legenda grande que sobe com mola; destaque (entre * *) sai em dourado
export const Legenda: React.FC<{ texto: string; at?: number; size?: number; align?: "center" | "left"; cor?: string }> = ({ texto, at = 0, size = 64, align = "center", cor = C.coin }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 16, mass: 0.6 } });
  const partes = texto.split("*");
  return (
    <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, lineHeight: 1.08, letterSpacing: "-0.03em", color: C.ink, textAlign: align,
      opacity: s, transform: `translateY(${(1 - s) * 40}px)`, textWrap: "balance" as never }}>
      {partes.map((p, i) => (i % 2 ? <span key={i} style={{ color: cor }}>{p}</span> : <span key={i}>{p}</span>))}
    </div>
  );
};

// captura real do app numa moldura, com um leve zoom
// maxH recorta a captura pela altura (mostra só o topo); celular põe a moldura de um aparelho
export const Tela: React.FC<{ src: string; width: number; at?: number; zoom?: number; radius?: number; maxH?: number; celular?: boolean; children?: React.ReactNode }> = ({ src, width, at = 0, zoom = 0.04, radius = 22, maxH, celular, children }) => {
  const f = useCurrentFrame(), { fps, durationInFrames } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 18 } });
  const z = 1 + interpolate(f, [at, durationInFrames], [0, zoom], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const borda = celular ? `${width * 0.025}px solid #07040c` : `2px solid ${C.line}`;
  return (
    <div style={{ position: "relative", width, maxHeight: maxH, borderRadius: celular ? width * 0.1 : radius, overflow: "hidden", border: borda, boxShadow: "0 30px 90px rgba(0,0,0,0.6)", flexShrink: 0,
      opacity: s, transform: `translateY(${(1 - s) * 60}px) scale(${z})` }}>
      <Img src={staticFile(src)} style={{ width: "100%", display: "block" }} />
      {children}
    </div>
  );
};

// alerta de lance do palco (fx-alert do app)
export const AlertaLance: React.FC<{ nome: string; valor: string; cor: string; at: number; size?: number }> = ({ nome, valor, cor, at, size = 1 }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 14 } });
  if (f < at) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 * size, padding: `${12 * size}px ${22 * size}px ${12 * size}px ${12 * size}px`, borderRadius: 18 * size,
      background: "rgba(14,9,22,0.97)", border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 16px 40px rgba(0,0,0,0.5)", transform: `translateX(${(s - 1) * 120}%)` }}>
      <span style={{ width: 54 * size, height: 54 * size, borderRadius: "50%", background: cor, display: "grid", placeItems: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 22 * size, color: "#160d22" }}>{nome[0]}</span>
      <div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30 * size, color: C.coin, lineHeight: 1.1 }}>{valor}</div>
        <div style={{ fontFamily: BODY, fontSize: 19 * size, color: C.ink }}>{nome} deu um lance</div>
      </div>
    </div>
  );
};

// carimbo "Vendido!" (fx-stamp do app)
export const Carimbo: React.FC<{ at: number; titulo: string; detalhe: string; size?: number }> = ({ at, titulo, detalhe, size = 1 }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  if (f < at) return null;
  const s = spring({ frame: f - at, fps, config: { damping: 9, stiffness: 180 } });
  return (
    <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) rotate(-4deg) scale(${interpolate(s, [0, 1], [1.8, 1])})`, opacity: Math.min(1, s * 2),
      background: C.coin, color: C.coinInk, borderRadius: 20 * size, padding: `${18 * size}px ${34 * size}px`, textAlign: "center", boxShadow: "0 24px 70px rgba(0,0,0,0.55)" }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 70 * size, lineHeight: 1, letterSpacing: "-0.03em" }}>{titulo}</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 22 * size, marginTop: 6 * size }}>{detalhe}</div>
    </div>
  );
};

// pôster: o real quando está em POSTERES; senão, o gerado pelo app
export const Poster: React.FC<{ title: string; year?: string | number; width: number }> = ({ title, year, width }) => {
  const h = hue(title), real = POSTERES[title];
  if (real) return <Img src={staticFile(real)} style={{ width, aspectRatio: "2 / 3", objectFit: "cover", display: "block" }} />;
  return (
    <div style={{ width, aspectRatio: "2 / 3", position: "relative", overflow: "hidden", background: `linear-gradient(160deg, hsl(${h} 50% 34%), hsl(${(h + 50) % 360} 55% 12%))` }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: width * 0.03, padding: width * 0.09 }}>
        {year ? <span style={{ fontFamily: BODY, fontSize: width * 0.07, color: "rgba(255,255,255,0.7)" }}>{year}</span> : null}
        <b style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.12, lineHeight: 0.98, letterSpacing: "-0.02em", color: "#fff" }}>{title}</b>
      </div>
    </div>
  );
};

// card do catálogo em pôsteres: moldura pela raridade, selo e rodapé com nota e cópias
export const CardRaridade: React.FC<{ title: string; year: number; nota: string; raridade: Raridade; rodape: string; width: number; at: number; destaque?: boolean }> = ({ title, year, nota, raridade, rodape, width, at, destaque }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 13 } });
  if (f < at) return <div style={{ width }} />;
  const r = RARIDADES[raridade], obra = raridade === "obra", lend = raridade === "lendario";
  const frame = obra
    ? `linear-gradient(${f * 3}deg, #ff4f6d, #ffd166, #4be3b0, #7aa7ff, #b48cff, #ff4f6d)`
    : `linear-gradient(160deg, ${r.color}, ${r.color}55 55%, ${r.color}bb)`;
  const brilho = obra ? "0 0 60px rgba(180,140,255,0.55)" : lend ? `0 0 46px ${C.coin}66` : raridade === "epico" ? "0 0 32px #b48cff55" : "0 14px 40px rgba(0,0,0,0.4)";
  return (
    <div style={{ width, padding: width * 0.02, borderRadius: width * 0.09, background: frame, boxShadow: brilho, opacity: s,
      transform: `translateY(${(1 - s) * 80}px) scale(${(destaque ? 1.08 : 1) * interpolate(s, [0, 1], [0.8, 1])})` }}>
      <div style={{ borderRadius: width * 0.075, overflow: "hidden", background: C.ground, position: "relative" }}>
        <Poster title={title} year={year} width={width * 0.96} />
        <span style={{ position: "absolute", top: width * 0.05, left: width * 0.05, fontFamily: BODY, fontWeight: 800, fontSize: width * 0.065, letterSpacing: "0.06em", textTransform: "uppercase",
          padding: `${width * 0.02}px ${width * 0.05}px`, borderRadius: 999, background: "rgba(21,15,31,0.82)", color: obra ? "#fff" : r.color, border: `1px solid ${obra ? "#fff9" : r.color + "99"}` }}>{r.name}</span>
        <div style={{ padding: `${width * 0.05}px ${width * 0.06}px`, borderTop: `1px solid ${r.color}66`, background: `linear-gradient(180deg, ${r.color}22, ${C.ground})` }}>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: width * 0.075, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: BODY, fontSize: width * 0.065, color: C.mute }}>
            <span>{rodape}</span><b style={{ fontFamily: DISPLAY, color: obra ? C.coin : r.color, fontSize: width * 0.085 }}>★ {nota}</b>
          </div>
        </div>
      </div>
    </div>
  );
};

// etiqueta que entra com mola (bônus, formatos, avisos)
export const Chip: React.FC<{ texto: string; at: number; size: number; cor?: string }> = ({ texto, at, size, cor = C.mint }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  if (f < at) return null;
  const s = spring({ frame: f - at, fps, config: { damping: 9, stiffness: 200 } });
  return <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: size, padding: `${size * 0.3}px ${size * 0.65}px`, borderRadius: 999, whiteSpace: "nowrap",
    background: `${cor}26`, border: `2px solid ${cor}88`, color: C.ink, transform: `scale(${s})`, display: "inline-block" }}>{texto}</span>;
};

// reações do chat subindo pela tela (fx-react do app)
export const Reacoes: React.FC<{ from: number; n?: number; size: number; area: { left: number; width: number; bottom: number; height: number } }> = ({ from, n = 18, size, area }) => {
  const f = useCurrentFrame();
  const emojis = ["🔥", "😱", "😂", "💸", "🍿", "👏"];
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const t = f - from - i * 5;
        if (t < 0 || t > 50) return null;
        const x = area.left + random("rx" + i) * area.width + Math.sin(t / 6 + i) * size * 0.3;
        const y = area.bottom - (t / 50) * area.height;
        return <span key={i} style={{ position: "absolute", left: x, top: y, fontSize: size * (0.8 + random("rs" + i) * 0.5), opacity: interpolate(t, [0, 6, 38, 50], [0, 1, 1, 0]),
          transform: `scale(${interpolate(t, [0, 8], [0.4, 1], { extrapolateRight: "clamp" })})` }}>{emojis[i % emojis.length]}</span>;
      })}
    </>
  );
};

// pôsteres reais caindo ao fundo
export const ChuvaDePosteres: React.FC<{ n?: number; opacity?: number }> = ({ n = 12, opacity = 0.35 }) => {
  const f = useCurrentFrame(), { width, height } = useVideoConfig();
  const titulos = ["Em Busca do Ouro", "Interestelar", "O Garoto", "A Origem", "Asas", "Crepúsculo", "Sherlock Jr.", "Transformers", "Viagem à Lua", "Kung Fu Panda",
    "Aurora", "O Poderoso Chefão", "Steamboat Bill, Jr.", "Um Sonho de Liberdade", "Piratas do Caribe", "Batman"];
  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      {Array.from({ length: n }, (_, i) => {
        const w = 120 + random("w" + i) * 120, x = random("x" + i) * width, vel = 2 + random("v" + i) * 3;
        const y = ((random("y" + i) * (height + 400) + f * vel) % (height + 400)) - 400;
        return <div key={i} style={{ position: "absolute", left: x - w / 2, top: y, transform: `rotate(${(random("r" + i) - 0.5) * 24}deg)`, borderRadius: 12, overflow: "hidden" }}>
          <Poster title={titulos[i % titulos.length]} width={w} />
        </div>;
      })}
    </AbsoluteFill>
  );
};
