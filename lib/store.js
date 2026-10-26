/* ============================================================
   Martelo Live — armazenamento do Mercado
   Interface: `await load()` devolve o documento salvo (ou null) e `await save(doc)` grava tudo.
   - MemoryStore: testes e servidor sem disco (ML_DATA=":memory:").
   - JsonFileStore: arquivo JSON local. Grava num .tmp e troca pelo rename (nunca fica
     meio escrito) e guarda a versão anterior em .bak para recuperar se o arquivo corromper.
   Para trocar por SQLite ou Postgres, basta outra classe com os mesmos dois métodos.
   ============================================================ */
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

class MemoryStore {
  constructor(doc) { this.json = doc ? JSON.stringify(doc) : null; }
  async load() { return this.json ? JSON.parse(this.json) : null; }
  async save(doc) { this.json = JSON.stringify(doc); }
}

class JsonFileStore {
  constructor(file) { this.file = path.resolve(file); }
  async read(file) {
    try { return JSON.parse(await fsp.readFile(file, "utf8")); }
    catch (e) { if (e.code === "ENOENT") return null; if (e instanceof SyntaxError) return undefined; throw e; }
  }
  async load() {
    const main = await this.read(this.file);
    if (main) return main;
    const bak = await this.read(this.file + ".bak");
    if (bak) { console.warn(`Mercado: ${path.basename(this.file)} ${main === undefined ? "corrompido" : "não encontrado"}, usando o .bak`); return bak; }
    if (main === undefined) throw new Error(`Mercado: ${this.file} está corrompido e não há .bak`);
    return null;
  }
  async save(doc) {
    const tmp = this.file + ".tmp";
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(doc));
    try { await fsp.copyFile(this.file, this.file + ".bak"); } catch (e) { if (e.code !== "ENOENT") throw e; }
    await fsp.rename(tmp, this.file);
  }
}

function openStore(where) {
  if (where === ":memory:") return new MemoryStore();
  return new JsonFileStore(where || path.join(__dirname, "..", "data", "market.json"));
}

module.exports = { MemoryStore, JsonFileStore, openStore };
