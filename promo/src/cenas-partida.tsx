// Vídeo 1: jogar com os amigos online e assistir aos leilões.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AlertaLance, Carimbo, Chip, Fundo, Legenda, Reacoes, Tela, useFormato } from "./componentes";
import { centro } from "./cenas-comuns";
import { BODY, C, DISPLAY, SITE_URL } from "./tema";

/* sala: cria, manda o link e a galera entra */
export const CenaSala: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const copiado = f >= 50;
  const pulo = spring({ frame: f - 50, fps, config: { damping: 8, stiffness: 240 } });
  const fs = (vertical ? 30 : 28) * u;
  const link = (
    <div style={{ display: "flex", alignItems: "center", gap: 16 * u, background: C.surface, border: `2px solid ${C.line}`, borderRadius: 22 * u, padding: `${14 * u}px ${14 * u}px ${14 * u}px ${24 * u}px`,
      opacity: spring({ frame: f - 14, fps, config: { damping: 16 } }) }}>
      <span style={{ fontFamily: BODY, fontSize: fs, color: C.ink, whiteSpace: "nowrap" }}>🔗 {SITE_URL}/sala/<b style={{ fontFamily: DISPLAY, color: C.coin }}>QHGC</b></span>
      <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: fs * 0.9, whiteSpace: "nowrap", padding: `${10 * u}px ${18 * u}px`, borderRadius: 14 * u,
        background: copiado ? C.mint : C.raise, color: copiado ? "#0b2a20" : C.ink, transform: `scale(${copiado ? interpolate(pulo, [0, 1], [1.25, 1]) : 1})` }}>{copiado ? "Copiado ✓" : "Copiar convite"}</span>
    </div>
  );
  return (
    <AbsoluteFill>
      <Fundo tom={C.mint} />
      <AbsoluteFill style={{ ...centro, flexDirection: vertical ? "column" : "row", gap: (vertical ? 50 : 80) * u, padding: 70 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 820) * u, display: "flex", flexDirection: "column", gap: 34 * u, alignItems: vertical ? "center" : "flex-start" }}>
          <Legenda texto="Crie uma sala e *mande o link* para a galera." size={(vertical ? 80 : 72) * u} align={vertical ? "center" : "left"} cor={C.mint} />
          {link}
          <div style={{ display: "flex", gap: 12 * u, flexWrap: "wrap", justifyContent: vertical ? "center" : "flex-start" }}>
            <Chip texto="André entrou" at={66} size={28 * u} cor={C.coin} /><Chip texto="Kirito entrou" at={80} size={28 * u} cor={C.mint} /><Chip texto="Pinho entrou" at={94} size={28 * u} cor="#7aa7ff" />
          </div>
        </div>
        <Tela src="telas/sala-v.png" width={(vertical ? 820 : 700) * u} at={8} zoom={0.03} radius={24} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* formatos: aberto, secreto e relógio holandês, cada um com uma animação curta */
// k: escala do conteúdo do card (no vertical os cards são largos e baixos)
const Formato: React.FC<{ icone: string; nome: string; desc: string; at: number; w: number; k: number; area: number; children: React.ReactNode }> = ({ icone, nome, desc, at, w, k, area, children }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 14 } });
  if (f < at) return <div style={{ width: w, height: 1 }} />;
  return (
    <div style={{ width: w, background: C.surface, border: `2px solid ${C.line}`, borderRadius: 30 * k, padding: `${26 * k}px ${30 * k}px`, display: "flex", flexDirection: "column", gap: 12 * k,
      opacity: s, transform: `translateY(${(1 - s) * 70}px)`, boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 36 * k, color: C.ink, whiteSpace: "nowrap" }}>{icone} {nome}</div>
      <div style={{ fontFamily: BODY, fontSize: 26 * k, color: C.mute, lineHeight: 1.3 }}>{desc}</div>
      <div style={{ height: area, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
};
export const CenaFormatos: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame();
  const w = (vertical ? 880 : 540) * u, k = (vertical ? 1.3 : 1.04) * u, area = (vertical ? 135 : 170) * k;
  const t0 = [20, 44, 68];
  // aberto: os lances se sucedem
  const lances = [["Cibele", "R$ 3", "#ff4f6d"], ["André", "R$ 5", "#ffd166"], ["Kirito", "R$ 9", "#4be3b0"]] as const;
  const li = Math.min(2, Math.max(0, Math.floor((f - t0[0] - 6) / 26)));
  // secreto: envelopes fechados e a revelação
  const revela = f >= 150;
  // holandês: o preço cai R$ 1 a cada 5 quadros até alguém comprar
  const preco = Math.max(9, 20 - Math.floor(Math.max(0, f - t0[2] - 10) / 5));
  const comprou = preco === 9 && f > t0[2] + 70;
  return (
    <AbsoluteFill>
      <Fundo tom={C.coin} />
      <AbsoluteFill style={{ ...centro, gap: (vertical ? 36 : 56) * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 1600) * u }}><Legenda texto="Escolha o jeito de *dar lance*." size={(vertical ? 80 : 70) * u} /></div>
        <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: (vertical ? 26 : 34) * u }}>
          <Formato icone="🔨" nome="Aberto" desc="Cada um na sua vez. Quem passa sai do lote." at={t0[0]} w={w} k={k} area={area}>
            {f >= t0[0] + 6 ? <AlertaLance key={li} nome={lances[li][0]} valor={lances[li][1]} cor={lances[li][2]} at={t0[0] + 6 + li * 26} size={1.25 * k} /> : null}
          </Formato>
          <Formato icone="✉️" nome="Lance secreto" desc="Todo mundo lança escondido. A revelação vem no fim." at={t0[1]} w={w} k={k} area={area}>
            <div style={{ display: "flex", gap: 18 * k }}>
              {[["C", "#ff4f6d", "R$ 4"], ["K", "#4be3b0", "R$ 7"], ["P", "#7aa7ff", "R$ 6"]].map(([l, cor, v], i) => (
                <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 * k, transform: `scale(${revela && i === 1 ? 1.15 : 1})` }}>
                  <span style={{ width: 64 * k, height: 64 * k, borderRadius: "50%", background: cor, display: "grid", placeItems: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 28 * k, color: "#160d22" }}>{l}</span>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 * k, color: revela ? (i === 1 ? C.coin : C.mute) : C.ink }}>{revela ? v : "✉️ ?"}</span>
                </div>
              ))}
            </div>
          </Formato>
          <Formato icone="⏱️" nome="Relógio holandês" desc="O preço cai sem parar. Quem apertar primeiro leva." at={t0[2]} w={w} k={k} area={area}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 76 * k, color: comprou ? C.mint : C.coin, lineHeight: 1 }}>R$ {preco}</div>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 26 * k, color: comprou ? C.mint : C.live, marginTop: 10 * k }}>{comprou ? "Pinho apertou e levou!" : "▼ caindo"}</div>
            </div>
          </Formato>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* lances: o palco ao vivo, alertas e o carimbo de vendido */
export const CenaLance: React.FC = () => {
  const { vertical, u } = useFormato();
  const w = (vertical ? 1000 : 1460) * u, k = w / 1250;   // k: tamanho dos alertas em relação à tela capturada
  const lances = [["Cibele", "R$ 3", "#ff4f6d", 14], ["André", "R$ 5", "#ffd166", 46], ["Kirito", "R$ 9", "#4be3b0", 78]] as const;
  const f = useCurrentFrame();
  const atual = [...lances].reverse().find((l) => f >= l[3]);
  return (
    <AbsoluteFill>
      <Fundo tom={C.live} />
      <AbsoluteFill style={{ ...centro, gap: 50 * u, padding: 60 * u, flexDirection: vertical ? "column" : "column-reverse" }}>
        <div style={{ maxWidth: (vertical ? 960 : 1600) * u, minHeight: (vertical ? 260 : 120) * u }}>
          {f < 112 ? <Legenda texto="Lances aparecem *na hora* para todo mundo." size={(vertical ? 78 : 66) * u} />
            : <Legenda texto="Quem der mais *leva o filme*." at={112} size={(vertical ? 78 : 66) * u} />}
        </div>
        <Tela src="telas/palco-online-h.png" width={w} zoom={0.03}>
          {atual ? <div key={atual[0]} style={{ position: "absolute", left: "1.8%", bottom: "7.6%" }}><AlertaLance nome={atual[0]} valor={atual[1]} cor={atual[2]} at={atual[3]} size={k} /></div> : null}
          <Carimbo at={112} titulo="Vendido!" detalhe="Em Busca do Ouro para Kirito por R$ 9" size={k} />
        </Tela>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* espectadores: assistem, comentam e reagem */
export const CenaAssistir: React.FC = () => {
  const { vertical, u } = useFormato();
  const w = (vertical ? 640 : 1180) * u;
  const h = vertical ? w * (2532 / 1170) : w * (1425 / 1950);
  const maxH = vertical ? 1340 * u : undefined;
  const altura = maxH ? Math.min(h, maxH) : h;
  return (
    <AbsoluteFill>
      <Fundo tom="#b48cff" />
      <AbsoluteFill style={{ ...centro, flexDirection: vertical ? "column" : "row", gap: (vertical ? 40 : 70) * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 560) * u, display: "flex", flexDirection: "column", gap: 30 * u, alignItems: vertical ? "center" : "flex-start" }}>
          <Legenda texto="Quem não joga *assiste, comenta e reage*." size={(vertical ? 74 : 68) * u} align={vertical ? "center" : "left"} cor="#b48cff" />
          <div style={{ display: "flex", gap: 12 * u, flexWrap: "wrap", justifyContent: vertical ? "center" : "flex-start" }}>
            <Chip texto="👀 Só assistir" at={30} size={30 * u} cor="#b48cff" /><Chip texto="💬 Chat com emoji" at={44} size={30 * u} cor="#b48cff" /><Chip texto="🔥 Reações" at={58} size={30 * u} cor="#b48cff" />
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <Tela src={vertical ? "telas/live-v.png" : "telas/live-h.png"} width={w} at={6} zoom={0.02} radius={20} maxH={maxH} celular={vertical} />
          <Reacoes from={40} size={(vertical ? 64 : 58) * u} area={{ left: w * (vertical ? 0.55 : 0.7), width: w * (vertical ? 0.3 : 0.22), bottom: altura * 0.85, height: altura * 0.6 }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* votação: a galera escolhe a melhor coleção */
export const CenaVotacao: React.FC = () => {
  const { vertical, u } = useFormato();
  const f = useCurrentFrame();
  const votos = Math.min(4, Math.max(0, Math.floor((f - 40) / 14) + 1));
  return (
    <AbsoluteFill>
      <Fundo tom={C.mint} />
      <AbsoluteFill style={{ ...centro, gap: 34 * u, padding: 60 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 1600) * u }}><Legenda texto="No fim, *a galera vota* na melhor coleção." size={(vertical ? 78 : 66) * u} cor={C.mint} /></div>
        <div style={{ height: 72 * u, display: "flex", alignItems: "center" }}>
          {f >= 40 ? <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 38 * u, color: "#0b2a20", background: C.mint, padding: `${12 * u}px ${26 * u}px`, borderRadius: 18 * u,
            boxShadow: "0 16px 40px rgba(0,0,0,0.45)", transform: `scale(${interpolate(f - 40 - (votos - 1) * 14, [0, 4], [1.18, 1], { extrapolateRight: "clamp" })})` }}>🗳️ {votos} {votos === 1 ? "voto" : "votos"} para Kirito</div> : null}
        </div>
        <Tela src={vertical ? "telas/final-v.png" : "telas/final-cards-h.png"} width={(vertical ? 900 : 1150) * u} at={8} zoom={0.02} radius={22} maxH={(vertical ? 1100 : 644) * u} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* mesmo aparelho: sem internet, todo mundo joga passando o celular */
export const CenaMesmoAparelho: React.FC = () => {
  const { vertical, u } = useFormato();
  const fs = (vertical ? 30 : 28) * u;
  return (
    <AbsoluteFill>
      <Fundo tom={C.coin} />
      <AbsoluteFill style={{ ...centro, flexDirection: vertical ? "column" : "row", gap: (vertical ? 50 : 90) * u, padding: 70 * u }}>
        <div style={{ maxWidth: (vertical ? 960 : 760) * u, display: "flex", flexDirection: "column", gap: 30 * u, alignItems: vertical ? "center" : "flex-start" }}>
          <Legenda texto="Sem internet? *Todo mundo no mesmo aparelho*." size={(vertical ? 76 : 70) * u} align={vertical ? "center" : "left"} />
          <div style={{ display: "flex", gap: 12 * u, flexWrap: "wrap", justifyContent: vertical ? "center" : "flex-start" }}>
            <Chip texto="📱 Passa a vez" at={36} size={fs} cor={C.coin} /><Chip texto="✉️ Lance secreto escondido" at={50} size={fs} cor={C.coin} /><Chip texto="↩️ Dá para desfazer" at={64} size={fs} cor={C.coin} />
          </div>
        </div>
        <Tela src="telas/local-jogadores-v.png" width={(vertical ? 760 : 620) * u} at={8} zoom={0.03} radius={24} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
