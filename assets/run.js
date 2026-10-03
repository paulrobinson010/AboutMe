/* ---------- Paul's 1K ---------- */
// The page keeps score of you. Start scrolling and a watch starts recording:
// distance is how far you've travelled through the page — one full read, top
// to bottom, is exactly 1 km on any screen — and time is how long you've been
// at it. The route you trace is GPS art; reach the bottom and see what it
// spells. Same deal as everything else here: the run lives in this closure
// and nowhere else, and a reload wipes it.
(() => {
  const hud = document.getElementById("run-hud");
  const card = document.getElementById("run-card");
  if (!hud || !card) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root) => (root || document).querySelector(sel);

  /* ---- the route: "PR." the way a runner would have to draw it ---- */
  // Strokes in a ~93 x 64 box, y pointing down. Linking jogs between letters
  // are flagged so they draw dashed, like a watch on auto-pause.
  const raw = [];
  const to = (x, y, link) => raw.push({ x, y, link: !!link });
  const arc = (cx, cy, r, a0, a1, n) => {
    for (let i = 1; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      to(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  to(4, 64); to(4, 0); to(20, 0);                     // P: up the stem, over the top
  arc(20, 17, 17, -Math.PI / 2, Math.PI / 2, 24);     //    round the bowl
  to(4, 34); to(4, 64);                               //    back to the stem, down it
  to(42, 64, true);                                   // jog along to the R
  to(42, 0); to(58, 0);                               // R: stem, top
  arc(58, 17, 17, -Math.PI / 2, Math.PI / 2, 24);     //    bowl
  to(50, 34); to(72, 64);                             //    and the leg
  to(83.5, 58, true);                                 // jog to the full stop
  arc(88, 58, 4.5, Math.PI, Math.PI * 3, 18);         // one tight loop: "."

  // Resample to evenly spaced points so progress maps linearly onto the
  // letters, then wobble them like a real GPS trace.
  const N = 640;
  const pts = (() => {
    const segs = [];
    let total = 0;
    for (let i = 1; i < raw.length; i++) {
      const a = raw[i - 1], b = raw[i], len = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ a, b, len, link: b.link, at: total });
      total += len;
    }
    const out = [];
    let s = 0;
    for (let i = 0; i < N; i++) {
      const want = total * i / (N - 1);
      while (s < segs.length - 1 && segs[s].at + segs[s].len < want) s++;
      const g = segs[s], t = g.len ? (want - g.at) / g.len : 0;
      out.push({
        x: g.a.x + (g.b.x - g.a.x) * t + Math.sin(i * 0.23 + 1.3) * 0.42 + Math.sin(i * 0.061 + 4) * 0.55,
        y: g.a.y + (g.b.y - g.a.y) * t + Math.sin(i * 0.19 + 2.1) * 0.42 + Math.sin(i * 0.047) * 0.55,
        link: g.link,
      });
    }
    return out;
  })();
  const box = pts.reduce((b, p) => ({
    x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x),
    y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y),
  }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });

  /* ---- where on the page you are, and what colour that paints ---- */
  const legs = [{ el: $(".hero-wrap"), name: "The start line", c: "#f2f0ea" }];
  const projects = [...document.querySelectorAll(".work-item")].map((el) => ({
    el, c: el.dataset.accent || "#fa801e", project: true,
    // X-Marks wears a wordmark instead of an h3, so fall back to its alt text
    name: (($("h3", el) || {}).textContent || ($(".wordmark", el) || { alt: "" }).alt.split(" —")[0] || "Project").trim(),
  }));
  legs.push(...projects,
    { el: $("#treadgame"), name: "The spotlight", c: "#f0b71a" },
    { el: $("#ethos"), name: "The Deal", c: "#f2f0ea" },
    { el: $("#about"), name: "About", c: "#9b6bff" },
    { el: $("#contact"), name: "The finish", c: "#fa801e" });
  const live = legs.filter((l) => l.el);
  const here = () => {
    const mid = innerHeight * 0.5;
    for (const l of live) {
      const r = l.el.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) return l;
    }
    return null;
  };

  /* ---- the HUD ---- */
  const el = {
    label: $(".rh-label", hud), dist: $(".rh-dist", hud), time: $(".rh-time", hud),
    pace: $(".rh-pace", hud), hr: $(".rh-hr", hud), vs: $(".rh-vs", hud),
    map: $(".rh-map", hud), pips: $(".rh-pips", hud), x: $(".rh-x", hud),
  };
  el.pips.innerHTML = projects.map(() => "<i></i>").join("");
  const pipEls = [...el.pips.children];

  const fmt = (sec) => {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  };
  const paceOf = (mps) => (mps < 0.4 ? "--:--" : fmt(Math.min(3599, 1000 / mps)));

  /* ---- drawing the trace ---- */
  const fit = (cv) => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  };
  // upto: how many points have been run. skipped: draw the un-run remainder
  // as a faint dotted outline (only the finish card ever reveals that).
  const drawTrace = (cv, colours, upto, opts) => {
    opts = opts || {};
    const { ctx, w, h } = fit(cv);
    ctx.clearRect(0, 0, w, h);
    const pad = opts.pad || 6;
    const sc = Math.min((w - pad * 2) / (box.x1 - box.x0), (h - pad * 2) / (box.y1 - box.y0));
    const ox = (w - (box.x1 - box.x0) * sc) / 2 - box.x0 * sc;
    const oy = (h - (box.y1 - box.y0) * sc) / 2 - box.y0 * sc;
    const X = (p) => ox + p.x * sc, Y = (p) => oy + p.y * sc;
    const lw = opts.width || Math.max(1.6, sc * 2.1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (opts.skipped && upto < N - 1) {
      ctx.setLineDash([1, lw * 1.8]);
      ctx.strokeStyle = "rgba(242, 240, 234, 0.22)";
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(X(pts[Math.floor(upto)]), Y(pts[Math.floor(upto)]));
      for (let i = Math.floor(upto) + 1; i < N; i++) ctx.lineTo(X(pts[i]), Y(pts[i]));
      ctx.stroke();
    }

    // one path per run of same colour + same kind, so it's a handful of
    // strokes rather than six hundred
    const end = Math.min(N - 1, upto);
    const whole = Math.floor(end), part = end - whole;
    const segs = whole + (part > 0 ? 1 : 0);
    const tip = (j) => {                     // where segment j ends
      if (j < whole) return [X(pts[j + 1]), Y(pts[j + 1])];
      const a = pts[whole], b = pts[whole + 1];
      return [X(a) + (X(b) - X(a)) * part, Y(a) + (Y(b) - Y(a)) * part];
    };
    let i = 0;
    while (i < segs) {
      const c = colours[i] || "#f2f0ea", link = pts[i + 1].link;
      ctx.beginPath();
      ctx.moveTo(X(pts[i]), Y(pts[i]));
      let j = i;
      while (j < segs && (colours[j] || "#f2f0ea") === c && pts[j + 1].link === link) {
        const [tx, ty] = tip(j);
        ctx.lineTo(tx, ty);
        j++;
      }
      ctx.setLineDash(link ? [lw * 0.6, lw * 2.2] : []);
      ctx.globalAlpha = link ? 0.45 : 1;
      ctx.strokeStyle = c;
      ctx.lineWidth = link ? lw * 0.7 : lw;
      if (opts.glow && !link) { ctx.shadowColor = c; ctx.shadowBlur = lw * 3; }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      i = j;
    }
    ctx.setLineDash([]);

    if (opts.head !== false && upto > 0) {
      const k = Math.min(N - 1, Math.floor(upto)), f = Math.min(1, upto - k);
      const a = pts[k], b = pts[Math.min(N - 1, k + 1)];
      const hx = X(a) + (X(b) - X(a)) * f, hy = Y(a) + (Y(b) - Y(a)) * f;
      const c = colours[Math.max(0, k - 1)] || "#f2f0ea";
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.arc(hx, hy, lw * 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(hx, hy, lw * 1.05, 0, Math.PI * 2); ctx.fill();
    }
  };

  /* ---- the run ---- */
  // idle → running → done; "rewind" while we carry you back to the top for
  // another go; "off" once you've binned it.
  let state = "idle";
  let armed = false;
  let lastY = scrollY;
  let run, best = null;   // best: your previous finish, for the virtual partner

  const fresh = () => ({
    dist: 0, time: 0, hr: 66, hrSum: 0, colours: new Array(N).fill(null),
    upto: 0, tAt: new Array(101).fill(null), linger: new Map(), reached: new Set(),
    trail: [{ t: 0, d: 0 }], current: null,
  });
  run = fresh();

  const span = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
  // every game overlay on the site locks the body while it's up
  const overlayOpen = () => document.body.style.overflow === "hidden";

  let labelTimer = null;
  const say = (text, ms) => {
    el.label.textContent = text;
    clearTimeout(labelTimer);
    if (ms) labelTimer = setTimeout(() => { el.label.textContent = state === "done" ? "Finished" : "Paul's 1K"; }, ms);
  };

  const start = () => {
    state = "running";
    run = fresh();
    run.current = here();
    hud.classList.add("on");
    hud.classList.toggle("vs-on", !!best);
    say(best ? "Chasing " + fmt(best.time) : "This page keeps score", 3200);
    tickClock = performance.now();
    render(true);
  };

  const advance = (metres) => {
    run.dist += metres;
    const was = run.upto;
    run.upto = Math.min(N - 1, run.dist / 1000 * (N - 1));
    const c = (run.current && run.current.c) || "#f2f0ea";
    for (let i = Math.floor(was); i <= Math.floor(run.upto); i++) if (!run.colours[i]) run.colours[i] = c;
    const k = Math.min(100, Math.floor(run.dist / 10));
    for (let i = 0; i <= k; i++) if (run.tAt[i] === null) run.tAt[i] = run.time;
  };

  let rafPending = false;
  const onScroll = () => {
    const y = scrollY;
    const dy = Math.abs(y - lastY);
    lastY = y;
    if (state === "rewind") {
      if (y <= 2) { state = "idle"; say("Ready when you are"); }
      return;
    }
    if (!armed || state === "off" || state === "done" || dy === 0 || overlayOpen()) return;
    if (state === "idle") start();
    advance(dy / span() * 1000);
    hud.classList.remove("rest");
    clearTimeout(restTimer);
    restTimer = setTimeout(() => hud.classList.add("rest"), 2600);
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; where(); render(); finishCheck(); });
    }
  };
  let restTimer = null;

  const where = () => {
    const l = here();
    if (!l || l === run.current) return;
    run.current = l;
    hud.style.setProperty("--run-c", l.c);
    if (l.project && !run.reached.has(l)) {
      run.reached.add(l);
      const i = projects.indexOf(l);
      if (pipEls[i]) pipEls[i].style.background = l.c;
      say(l.name + " · " + fmt(run.time), 1800);
      if (!reduced) { hud.classList.remove("buzz"); void hud.offsetWidth; hud.classList.add("buzz"); }
    }
  };

  const finishCheck = () => {
    const atBottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 6;
    if (state === "running" && atBottom && run.dist >= 100) finish();
  };

  /* the clock runs on its own, four times a second — and stops while a game
     is open or the tab is hidden, the same way a watch auto-pauses */
  let tickClock = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(1, (now - tickClock) / 1000);
    tickClock = now;
    if (state !== "running" || document.hidden || overlayOpen()) return;
    run.time += dt;
    run.trail.push({ t: run.time, d: run.dist });
    while (run.trail.length > 2 && run.time - run.trail[0].t > 6) run.trail.shift();
    const t0 = run.trail[0];
    const v = run.time - t0.t > 0.5 ? (run.dist - t0.d) / (run.time - t0.t) : 0;
    // a made-up heart: it chases your scroll speed with a lag, like a real one
    const target = 66 + 112 * (1 - Math.exp(-v / 8));
    run.hr += (target - run.hr) * Math.min(1, dt * 0.35);
    run.hrSum += run.hr * dt;
    if (run.current) run.linger.set(run.current, (run.linger.get(run.current) || 0) + dt);
    run.v = v;
    render();
  }, 250);

  let lastDrawn = -1;
  const render = (force) => {
    el.dist.firstChild.nodeValue = (run.dist / 1000).toFixed(2);
    el.time.textContent = fmt(run.time);
    el.pace.firstChild.nodeValue = paceOf(run.v || 0);
    el.hr.lastChild.nodeValue = " " + Math.round(run.hr);
    hud.style.setProperty("--beat", (60 / run.hr).toFixed(2) + "s");
    if (best) {
      const k = Math.min(100, Math.floor(run.dist / 10));
      const them = best.tAt[k];
      if (them !== null && run.time > 0) {
        const d = run.time - them;
        el.vs.textContent = (d <= 0 ? "−" : "+") + fmt(Math.abs(d));
        el.vs.className = "rh-vs " + (d <= 0 ? "ahead" : "behind");
      }
    }
    if (force || Math.abs(run.upto - lastDrawn) > 0.4) {
      lastDrawn = run.upto;
      drawTrace(el.map, run.colours, run.upto, { pad: 4 });
    }
  };

  /* ---- the finish ---- */
  const c$ = (s) => $(s, card);
  const cardMap = c$(".rc-map");
  let drawAnim = 0;

  const verdict = (pace) => {
    if (pace < 60) return "Under a minute a kilometre. That's not running, that's a scroll wheel.";
    if (pace < 170) return "Faster than Kipchoge's marathon pace (2:50/km). Did you read any of it?";
    if (pace < 240) return "Club-runner quick. Skimmed the good bits — the games are still there.";
    if (pace < 360) return "Steady parkrun pace. Took it all in, didn't hang about.";
    if (pace < 600) return "A proper read. Respect.";
    return "Walked it and stopped for every view. Gaitway would approve.";
  };

  const replay = () => {
    cancelAnimationFrame(drawAnim);
    card.classList.remove("shown");
    const res = card._res;
    if (reduced) {
      drawTrace(cardMap, res.colours, res.upto, { pad: 14, glow: true, skipped: true, head: false });
      card.classList.add("shown");
      return;
    }
    const t0 = performance.now(), dur = 2600;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      drawTrace(cardMap, res.colours, res.upto * e, { pad: 14, glow: true, skipped: p === 1, head: p < 1 });
      if (p < 1) drawAnim = requestAnimationFrame(step);
      else card.classList.add("shown");
    };
    drawAnim = requestAnimationFrame(step);
  };

  const openCard = () => {
    card.classList.add("open");
    hud.classList.remove("on");
    replay();
    c$(".rc-again").focus({ preventScroll: true });
  };
  const closeCard = () => {
    cancelAnimationFrame(drawAnim);
    card.classList.remove("open", "shown");
    if (state === "done") hud.classList.add("on");
  };

  const finish = () => {
    state = "done";
    const res = {
      time: run.time, dist: run.dist, upto: run.upto, colours: run.colours.slice(),
      tAt: run.tAt.slice(), hr: run.time ? run.hrSum / run.time : run.hr,
      linger: run.linger, reached: run.reached.size,
    };
    const full = run.upto >= N - 2;
    const pace = res.time / Math.max(0.001, res.dist / 1000);
    let title, sub;
    if (!full) {
      title = "Part of a PR.";
      sub = "You joined mid-route — the dotted bit is the page you skipped. Go again from the top for the full letters.";
    } else if (!best) {
      title = "That's a PR.";
      sub = "Look at your route. Paul Robinson, personal record — same initials, same full stop.";
    } else if (res.time < best.time) {
      title = "New PR.";
      sub = fmt(best.time - res.time) + " faster than your last one. The partner you were chasing was you.";
    } else {
      title = "Not a PR.";
      sub = fmt(res.time - best.time) + " off your best of " + fmt(best.time) + ". The route still spells it, mind.";
    }
    if (full && (!best || res.time < best.time)) best = res;

    c$(".rc-title").textContent = title;
    c$(".rc-sub").textContent = sub;
    c$(".rc-dist").textContent = (res.dist / 1000).toFixed(2) + " km";
    c$(".rc-time").textContent = fmt(res.time);
    c$(".rc-pace").textContent = fmt(Math.min(3599, pace)) + " /km";
    c$(".rc-hr").textContent = Math.round(res.hr) + " bpm";
    c$(".rc-verdict").textContent = verdict(pace);

    // where the time went, as one bar in the colours you ran through
    const total = [...res.linger.values()].reduce((a, b) => a + b, 0) || 1;
    const parts = [...res.linger.entries()].sort((a, b) => live.indexOf(a[0]) - live.indexOf(b[0]));
    c$(".rc-bar").innerHTML = parts
      .map(([l, t]) => `<i style="flex-grow:${(t / total).toFixed(4)};background:${l.c}" title="${l.name} ${fmt(t)}"></i>`)
      .join("");
    const top = parts.slice().sort((a, b) => b[1] - a[1])[0];
    c$(".rc-most").textContent = top
      ? "Longest stop: " + top[0].name + " (" + fmt(top[1]) + ") · " + res.reached + " of " + projects.length + " projects passed"
      : "";

    card._res = res;
    el.label.textContent = "Finished";
    hud.classList.add("done");
    setTimeout(openCard, reduced ? 0 : 450);
  };

  const again = () => {
    closeCard();
    hud.classList.remove("on", "done");
    run = fresh();
    pipEls.forEach((p) => (p.style.background = ""));
    el.vs.textContent = "";
    render(true);
    state = "rewind";
    scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    if (scrollY <= 2) { state = "idle"; }
    // a smooth scroll can be interrupted; don't strand the run in rewind
    setTimeout(() => { if (state === "rewind") state = "idle"; lastY = scrollY; }, 2500);
  };

  /* ---- wiring ---- */
  // Only start counting once you've actually touched something: a restored
  // scroll position or a #hash jump on load isn't you running.
  const arm = () => { if (!armed) { armed = true; lastY = scrollY; } };
  ["wheel", "touchstart", "keydown", "pointerdown"].forEach((t) =>
    addEventListener(t, arm, { passive: true, capture: true }));
  addEventListener("scroll", onScroll, { passive: true });

  hud.addEventListener("click", (e) => {
    if (e.target.closest(".rh-x")) {
      state = "off";
      hud.classList.remove("on");
      return;
    }
    if (state === "done") openCard();
  });
  c$(".rc-x").addEventListener("click", closeCard);
  c$(".rc-replay").addEventListener("click", replay);
  c$(".rc-again").addEventListener("click", again);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && card.classList.contains("open") && !overlayOpen()) closeCard();
  });
  addEventListener("resize", () => {
    if (hud.classList.contains("on")) drawTrace(el.map, run.colours, run.upto, { pad: 4 });
    if (card.classList.contains("shown")) {
      const r = card._res;
      drawTrace(cardMap, r.colours, r.upto, { pad: 14, glow: true, skipped: true, head: false });
    }
  });

  // the big custom cursor should know about these buttons too
  const cursor = $(".cursor");
  if (cursor) {
    document.querySelectorAll("#run-hud button, #run-card button").forEach((b) => {
      b.addEventListener("mouseenter", () => cursor.classList.add("is-hovering"));
      b.addEventListener("mouseleave", () => cursor.classList.remove("is-hovering"));
    });
  }
})();
