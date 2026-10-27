import React from "react";
import { Composition } from "remotion";
import { MERCADO, PARTIDA } from "./roteiros";
import { FPS } from "./tema";
import { duracao, Video } from "./Video";

// dois anúncios, cada um em vertical (Reels, TikTok, Shorts) e horizontal (YouTube, site)
const Partida: React.FC = () => <Video roteiro={PARTIDA} />;
const Mercado: React.FC = () => <Video roteiro={MERCADO} />;
const FORMATOS = [["Vertical", 1080, 1920], ["Horizontal", 1920, 1080]] as const;

export const RemotionRoot: React.FC = () => (
  <>
    {FORMATOS.map(([fmt, width, height]) => (
      <React.Fragment key={fmt}>
        <Composition id={`Partida-${fmt}`} component={Partida} durationInFrames={duracao(PARTIDA)} fps={FPS} width={width} height={height} />
        <Composition id={`Mercado-${fmt}`} component={Mercado} durationInFrames={duracao(MERCADO)} fps={FPS} width={width} height={height} />
      </React.Fragment>
    ))}
  </>
);
