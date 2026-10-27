// Visual do Martelo Live (mesmos tokens de public/styles.css) e textos do vídeo.
import { loadFont as loadUnbounded } from "@remotion/google-fonts/Unbounded";
import { loadFont as loadOnest } from "@remotion/google-fonts/Onest";

export const DISPLAY = loadUnbounded("normal", { weights: ["700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily;
export const BODY = loadOnest("normal", { weights: ["400", "600", "700"], subsets: ["latin", "latin-ext"] }).fontFamily;

export const C = {
  ground: "#150f1f",
  surface: "#1f172d",
  raise: "#2a2040",
  line: "#3a2e55",
  ink: "#f7f2ff",
  mute: "#a99cc4",
  live: "#ff4f6d",
  coin: "#ffd166",
  coinInk: "#2a1a00",
  mint: "#4be3b0",
};

// endereço no convite final: troque pelo endereço publicado
export const SITE_URL = "martelo-live.onrender.com";
export const FPS = 30;

// raridades do Mercado (public/market-config.js)
export const RARIDADES = {
  comum: { name: "Comum", color: "#a99cc4", copies: 20 },
  incomum: { name: "Incomum", color: C.mint, copies: 10 },
  raro: { name: "Raro", color: "#7aa7ff", copies: 5 },
  epico: { name: "Épico", color: "#b48cff", copies: 3 },
  lendario: { name: "Lendário", color: C.coin, copies: 1 },
  obra: { name: "Obra de Arte", color: "#fff3c4", copies: 1 },
} as const;
export type Raridade = keyof typeof RARIDADES;

// pôsteres reais (public/posteres); um filme fora desta lista aparece com o pôster gerado pelo app
export const POSTERES = {
  "Transformers": "posteres/transformers.jpg",
  "Crepúsculo": "posteres/crepusculo.jpg",
  "Piratas do Caribe": "posteres/piratas.jpg",
  "Interestelar": "posteres/interestelar.png",
  "Kung Fu Panda": "posteres/kung-fu-panda.jpg",
  "A Origem": "posteres/a-origem.jpg",
  "Batman": "posteres/batman.jpg",
  "Um Sonho de Liberdade": "posteres/um-sonho-de-liberdade.png",
  "O Poderoso Chefão": "posteres/o-poderoso-chefao.jpg",
  "Em Busca do Ouro": "posteres/em-busca-do-ouro.jpg",
  "O Garoto": "posteres/o-garoto.jpg",
  "Asas": "posteres/asas.jpg",
  "Sherlock Jr.": "posteres/sherlock-jr.jpg",
  "Steamboat Bill, Jr.": "posteres/marinheiro.jpg",
  "Viagem à Lua": "posteres/viagem-a-lua.jpg",
  "Aurora": "posteres/aurora.jpg",
} as Record<string, string>;

// mesma cor do pôster gerado pelo app (poster() em public/app.js), a partir do título
export function hue(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
