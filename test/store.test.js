// Teste do armazenamento do Mercado: arquivo JSON e memória.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { MemoryStore, JsonFileStore, openStore } = require("../lib/store.js");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ml-store-"));
  try {
    const file = path.join(dir, "sub", "market.json");
    const s = new JsonFileStore(file);
    assert.strictEqual(await s.load(), null, "sem arquivo ainda");
    await s.save({ v: 1, n: 1 });
    assert.deepStrictEqual(await s.load(), { v: 1, n: 1 }, "ida e volta");
    assert.ok(!fs.existsSync(file + ".tmp"), "não sobra o temporário");
    await s.save({ v: 1, n: 2 });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file + ".bak", "utf8")), { v: 1, n: 1 }, ".bak guarda a versão anterior");
    // arquivo corrompido (queda no meio de uma escrita fora do rename): recupera o .bak
    fs.writeFileSync(file, '{"v":1,"n":');
    assert.deepStrictEqual(await s.load(), { v: 1, n: 1 }, "recupera do .bak");
    // corrompido e sem .bak: falha alto em vez de começar vazio e apagar tudo
    fs.unlinkSync(file + ".bak");
    await assert.rejects(() => s.load(), "corrompido sem .bak");
    console.log("ok arquivo JSON");

    const m = new MemoryStore();
    assert.strictEqual(await m.load(), null);
    const doc = { v: 1, users: { a: { n: 1 } } };
    await m.save(doc);
    doc.users.a.n = 99;
    assert.strictEqual((await m.load()).users.a.n, 1, "o store guarda uma cópia, não a referência");
    assert.ok(openStore(":memory:") instanceof MemoryStore);
    assert.ok(openStore(file) instanceof JsonFileStore);
    console.log("ok memória");
    console.log("Todos os testes de armazenamento passaram.");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
