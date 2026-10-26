/* Martelo Live — conexão com o servidor (WebSocket nativo, reconexão automática) */
(function () {
  "use strict";
  const listeners = {};
  const waits = new Map();
  let ws = null, seq = 0, retry = 0, wantOpen = false, timer = null;
  let offset = 0, bestLag = Infinity;  // relógio do servidor - relógio local
  const Net = {
    status: "off",       // off | connecting | on | unavailable
    available: /^https?:$/.test(location.protocol) && !window.ML_OFFLINE,
    on(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    now() { return Date.now() + offset; },
    connect() {
      if (!this.available) { this.status = "unavailable"; emit("status"); return; }
      wantOpen = true;
      if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
      open();
    },
    call(t, d) {
      return new Promise((resolve) => {
        if (!ws || ws.readyState !== 1) return resolve({ error: "Sem conexão com o servidor. Tentando reconectar…" });
        const id = ++seq;
        const to = setTimeout(() => { waits.delete(id); resolve({ error: "O servidor demorou para responder. Tente de novo." }); }, 10000);
        waits.set(id, (v) => { clearTimeout(to); resolve(v); });
        ws.send(JSON.stringify({ t, id, d }));
      });
    },
    send(t, d) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t, d })); }
  };
  function emit(t, d) { (listeners[t] || []).forEach((fn) => fn(d)); }
  function open() {
    clearTimeout(timer);
    Net.status = "connecting"; emit("status");
    const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
    try { ws = new WebSocket(url); } catch (e) { return schedule(); }
    const sentAt = Date.now();
    ws.onopen = () => {
      retry = 0; Net.status = "on"; emit("status");
      const t0 = Date.now();
      Net.call("time").then((r) => { if (r && r.now) { const lag = (Date.now() - t0) / 2; if (lag < bestLag) { bestLag = lag; offset = r.now + lag - Date.now(); } } });
      emit("open");
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === "ack") { const w = waits.get(m.id); if (w) { waits.delete(m.id); w(m.d); } return; }
      emit(m.t, m.d);
    };
    ws.onclose = () => {
      waits.forEach((w) => w({ error: "A conexão caiu. Tentando reconectar…" })); waits.clear();
      if (Net.status === "on") emit("lost");
      Net.status = Date.now() - sentAt < 1500 && retry > 3 ? "unavailable" : "connecting";
      emit("status");
      schedule();
    };
    ws.onerror = () => {};
  }
  function schedule() {
    if (!wantOpen) return;
    retry++;
    timer = setTimeout(open, Math.min(8000, 600 * retry));
  }
  window.Net = Net;
})();
