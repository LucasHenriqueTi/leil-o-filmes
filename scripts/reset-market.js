// Apaga todos os dados do Mercado: contas, carteiras, extrato, catálogo, cópias e estreias.
// Uso: npm run reset   (com o servidor desligado; respeita ML_DATA e PORT)
// O servidor guarda tudo na memória e grava de novo a cada mudança, por isso precisa estar desligado.
const fs = require("fs"), path = require("path");
const file = path.resolve(process.env.ML_DATA || path.join(__dirname, "..", "data", "market.json"));
const port = process.env.PORT || 3000;

(async () => {
  try {
    const r = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      console.error(`O servidor está ligado na porta ${port}. Desligue (Ctrl+C no terminal do npm start) e rode de novo.`);
      process.exit(1);
    }
  } catch (e) { /* desligado: pode apagar */ }
  const gone = [file, file + ".bak", file + ".tmp"].filter((f) => fs.existsSync(f));
  if (!gone.length) return console.log(`Nada para apagar: ${file} não existe.`);
  gone.forEach((f) => fs.unlinkSync(f));
  console.log(`Mercado zerado. Apagado: ${gone.map((f) => path.basename(f)).join(", ")}`);
  console.log("No próximo npm start tudo começa do zero: a primeira conta criada vira admin.");
})();
