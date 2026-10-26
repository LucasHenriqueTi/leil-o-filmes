/* Servidor WebSocket mínimo (RFC 6455), sem dependências.
   Suporta mensagens de texto, fragmentação, ping/pong e fechamento.
   Suficiente para salas de jogo pequenas. */
const crypto = require("crypto");
const { EventEmitter } = require("events");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE = 1024 * 1024; // 1 MB

class Connection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.id = crypto.randomUUID();
    this.alive = true;
    this.open = true;
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.fragType = 0;
    socket.setNoDelay(true);
    socket.on("data", (chunk) => this._onData(chunk));
    socket.on("close", () => this._closed());
    socket.on("error", () => this._closed());
  }
  send(obj) {
    if (!this.open) return;
    this._frame(0x1, Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj)));
  }
  ping() { if (this.open) this._frame(0x9, Buffer.alloc(0)); }
  close(code = 1000) {
    if (!this.open) return;
    const b = Buffer.alloc(2); b.writeUInt16BE(code);
    this._frame(0x8, b);
    this.socket.end();
    this._closed();
  }
  _frame(op, payload) {
    const len = payload.length;
    let head;
    if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
    else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    head[0] = 0x80 | op;
    try { this.socket.write(Buffer.concat([head, payload])); } catch (e) { this._closed(); }
  }
  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (this.buf.length > MAX_MESSAGE + 16) return this.close(1009);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.close(1009);
        len = Number(big); off = 10;
      }
      if (!masked) return this.close(1002); // cliente sempre mascara
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      this.alive = true;
      if (op === 0x8) return this.close();
      if (op === 0x9) { this._frame(0xA, data); continue; }
      if (op === 0xA) continue;
      if (op === 0x0) { this.fragments.push(data); }
      else if (op === 0x1 || op === 0x2) { this.fragments = [data]; this.fragType = op; }
      else return this.close(1002);
      if (this.fragments.reduce((a, d) => a + d.length, 0) > MAX_MESSAGE) return this.close(1009);
      if (fin) {
        const msg = Buffer.concat(this.fragments); this.fragments = [];
        if (this.fragType === 0x1) this.emit("message", msg.toString("utf8"));
      }
    }
  }
  _closed() {
    if (!this.open) return;
    this.open = false;
    this.emit("close");
  }
}

// Liga o WebSocket a um servidor http existente, no caminho indicado.
function attachWebSocket(httpServer, pathName, onConnection) {
  const conns = new Set();
  httpServer.on("upgrade", (req, socket) => {
    const url = new URL(req.url, "http://x");
    const key = req.headers["sec-websocket-key"];
    if (url.pathname !== pathName || !key || String(req.headers.upgrade).toLowerCase() !== "websocket") {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n"); return socket.destroy();
    }
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
    const conn = new Connection(socket);
    conn.ip = req.headers["x-forwarded-for"] || socket.remoteAddress;
    conns.add(conn);
    conn.on("close", () => conns.delete(conn));
    onConnection(conn);
  });
  // batimento: derruba conexões mortas (celular que perdeu sinal etc.)
  const beat = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) { c.socket.destroy(); c._closed(); continue; }
      c.alive = false; c.ping();
    }
  }, 25000);
  beat.unref();
  return conns;
}

module.exports = { attachWebSocket };
