// Gera um único HTML (sem servidor) com tudo embutido, só no modo "mesmo aparelho".
// Uso: node scripts/build-preview.js [saida.html]
const fs = require("fs"), path = require("path");
const pub = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(pub, f), "utf8");
const artifact = process.argv.includes("--artifact");
const out = process.argv.filter((a) => !a.startsWith("--"))[2] || path.join(__dirname, "..", "dist", "martelo-live-offline.html");
let html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Martelo Live</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Unbounded:wght@600;700;800&display=swap">
<style>${read("styles.css")}</style></head><body>
<div id="app"></div>
<script>window.ML_OFFLINE = true;</script>
<script>${read("engine.js")}</script>
<script>${read("catalog.js")}</script>
<script>${read("net.js")}</script>
<script>${read("app.js")}</script>
</body></html>`;
if (artifact) html = html.replace(/<!doctype html>\s*<html[^>]*><head>/, "").replace("</head><body>", "").replace("</body></html>", "").replace('<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">', '<meta name="claude:viewport-fit-sides" content="cover">');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log("ok", out, Math.round(html.length / 1024) + " KB");
