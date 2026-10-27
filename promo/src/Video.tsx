// Monta um vídeo: as cenas em sequência, cada uma começando quando a anterior termina.
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Cena } from "./componentes";
import { C } from "./tema";

export type Roteiro = { cena: React.FC; dur: number }[];

export const duracao = (r: Roteiro) => r.reduce((t, c) => t + c.dur, 0);

export const Video: React.FC<{ roteiro: Roteiro }> = ({ roteiro }) => {
  let de = 0;
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      {roteiro.map(({ cena: Comp, dur }, i) => {
        const from = de; de += dur;
        return <Sequence key={i} from={from} durationInFrames={dur}><Cena dur={dur}><Comp /></Cena></Sequence>;
      })}
    </AbsoluteFill>
  );
};
