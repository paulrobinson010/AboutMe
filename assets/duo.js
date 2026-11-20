/* Duo — two phones, one game, no server of ours.
   One phone opens a room on the relay (the same one Putt's live scores use)
   and shows a QR code; the other scans it. Everything sent is sealed with
   AES-GCM under a key that lives after the # in the link, which browsers
   never send anywhere, so the relay only ever passes on gibberish. The room
   takes two: the first phone to join the host is its partner, anyone else
   gets "that game's full". Nothing is stored. */
window.Duo = (() => {
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const RELAY = (LOCAL && new URLSearchParams(location.search).get("relay")) || "wss://relay.robbo-online.uk";
  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = (t) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const id = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));
  const aes = (k) => crypto.subtle.importKey("raw", unb64u(k), "AES-GCM", false, ["encrypt", "decrypt"]);
  const seal = async (key, o) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(o))));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64u(out);
  };
  const unseal = async (key, t) => { const b = unb64u(t); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, key, b.slice(12)))); };
  const ok = () => !!(window.crypto && crypto.subtle);

  // a new room: { r: room id, k: key }
  const newRoom = async () => ({ r: id(16), k: b64u(await crypto.subtle.exportKey("raw", await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]))) });
  const fromHash = () => { const m = location.hash.match(/^#j=([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{43})$/); return m ? { r: m[1], k: m[2] } : null; };
  const joinUrl = (room) => location.href.split("#")[0] + "#j=" + room.r + "." + room.k;

  // a socket to the room that keeps itself up: backoff, pings, back from the pocket
  const Link = (room, onMsg, onState) => {
    let ws = null, back = 1000, t = 0, ping = 0, heard = 0, stopped = false;
    const drop = () => { if (ws) { ws.onclose = ws.onmessage = null; try { ws.close(); } catch (_) {} ws = null; } clearInterval(ping); onState("off"); };
    const retry = () => { if (stopped) return; clearTimeout(t); t = setTimeout(connect, back); back = Math.min(back * 2, 15000); };
    const connect = () => {
      if (stopped || ws) return;
      clearTimeout(t); onState("connecting");
      try { ws = new WebSocket(RELAY + "/room/" + room); } catch (_) { ws = null; return retry(); }
      ws.onopen = () => {
        back = 1000; heard = Date.now(); onState("on"); onMsg({ t: "open" });
        ping = setInterval(() => { if (Date.now() - heard > 75000) { drop(); return connect(); } try { ws.send("ping"); } catch (_) {} }, 25000);
      };
      ws.onmessage = (e) => { heard = Date.now(); let m; try { m = JSON.parse(e.data); } catch (_) { return; } onMsg(m); };
      ws.onclose = () => { drop(); retry(); };
    };
    const wake = () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (!ws) { back = 1000; return connect(); }
      const asked = Date.now(); try { ws.send("ping"); } catch (_) {}
      setTimeout(() => { if (ws && heard < asked) { drop(); connect(); } }, 4000);
    };
    document.addEventListener("visibilitychange", wake); addEventListener("online", wake);
    connect();
    return {
      send: (o) => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; } return false; },
      stop: () => { stopped = true; clearTimeout(t); document.removeEventListener("visibilitychange", wake); removeEventListener("online", wake); drop(); },
    };
  };

  // Pair up and talk. room: { r, k, peer? } (peer is filled in, and kept, once
  // paired). role: "host" | "guest". me: this phone's id.
  // onMsg(o): a message from the partner ({ k: "hi" } when they say hello).
  // onState({ sock, peer, full }): the line, and whether the partner's about.
  const connect = ({ room, role, me, onMsg, onState, onPeer }) => {
    let key = null, link = null, sock = "off", heard = 0, full = false, lastHi = 0, beat = 0, live = 0;
    const peerUp = () => Date.now() - heard < 45000;
    const tell = () => onState && onState({ sock, peer: peerUp(), paired: !!room.peer, full });
    const raw = async (o) => { if (link && key) link.send({ t: "D", v: await seal(key, Object.assign({ from: me, role }, o)) }); };
    const hi = () => { lastHi = Date.now(); raw({ k: "hi" }); };
    aes(room.k).then((k) => {
      key = k;
      link = Link(room.r, async (m) => {
        if (m.t === "open") return hi();
        if (m.t !== "D" || typeof m.v !== "string") return;
        let o; try { o = await unseal(key, m.v); } catch (_) { return; }   // not our room's
        if (!o || o.from === me || typeof o.from !== "string") return;
        if (o.k === "full") { if (o.to === me) { full = true; tell(); } return; }
        if (o.role === role) return;   // two hosts, or two guests: not for us
        if (!room.peer) { room.peer = o.from; onPeer && onPeer(o.from); }
        if (o.from !== room.peer) { if (role === "host") raw({ k: "full", to: o.from }); return; }   // a third phone
        const fresh = !peerUp();
        heard = Date.now(); tell();
        if (o.k === "hi") { if (fresh || Date.now() - lastHi > 3000) hi(); }
        onMsg(o);
      }, (st) => { sock = st; tell(); });
    });
    beat = setInterval(hi, 15000);
    live = setInterval(tell, 5000);
    return {
      send: (o) => raw(o),
      peerUp,
      stop: () => { clearInterval(beat); clearInterval(live); if (link) link.stop(); link = null; },
    };
  };

  // the QR code for a link, drawn as crisp squares into a box
  let lib = null;
  const loadQR = () => lib || (lib = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = "assets/vendor/qrcode.js";
    s.onload = () => res(window.qrcode); s.onerror = () => { lib = null; rej(); }; document.head.appendChild(s);
  }));
  const qr = async (box, url) => {
    if (box.dataset.url === url) return;
    box.innerHTML = ""; box.dataset.url = url;
    try {
      const q = (await loadQR())(0, "L"); q.addData(url); q.make();
      const n = q.getModuleCount(); let d = "";
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += "M" + c + " " + r + "h1v1h-1z";
      box.innerHTML = '<svg viewBox="-2 -2 ' + (n + 4) + " " + (n + 4) + '" shape-rendering="crispEdges" role="img" aria-label="QR code to join"><path fill="#07080f" d="' + d + '"/></svg>';
    } catch (_) { box.dataset.url = ""; }
  };
  const share = async (url, title, toast) => {
    try { if (navigator.share) await navigator.share({ title, url }); else { await navigator.clipboard.writeText(url); toast && toast("Link copied"); } } catch (_) {}
  };

  return { ok, id, newRoom, fromHash, joinUrl, connect, qr, share };
})();
