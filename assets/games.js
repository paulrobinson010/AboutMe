/* Three playable tasters, one per app that didn't have one: The Belt for
   TreadGame, Car Back for CycleHUD, The Network for Gaitway.

   Same deal as the rest of the site — every score lives in a closure and dies
   with the overlay. Nothing is written down, nothing is sent anywhere. */
(() => {
  "use strict";

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ── the shell every game sits in ──────────────────────────────────────
     One implementation of open/close/Escape/scroll-lock, so a new game only
     has to know how to draw itself. build() returns an optional { stop } and
     is called fresh on every open, so nothing survives a close. */
  function mount(id, openers, build) {
    const el = document.getElementById(id);
    if (!el) return;
    const stage = el.querySelector(".tgm-stage");
    let live = null;

    const close = () => {
      if (live && live.stop) live.stop();
      live = null;
      stage.innerHTML = "";
      el.classList.remove("open");
      document.body.style.overflow = "";
    };
    const open = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (el.classList.contains("open")) return;
      el.classList.add("open");
      document.body.style.overflow = "hidden";
      live = build(stage, el);
    };

    el.querySelector(".tgm-close").addEventListener("click", close);
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.classList.contains("open")) close();
    });
    document.querySelectorAll(openers).forEach((o) => {
      o.addEventListener("click", open);
      o.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open(e);
      });
    });
  }

  /* A canvas sized to its box in device pixels, kept right across resizes. */
  function canvasIn(stage, extraClass) {
    const c = document.createElement("canvas");
    c.className = "tgm-canvas" + (extraClass ? " " + extraClass : "");
    stage.appendChild(c);
    const ctx = c.getContext("2d");
    let w = 0, h = 0;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    addEventListener("resize", fit);
    return { c, ctx, fit, get w() { return w; }, get h() { return h; },
             release() { removeEventListener("resize", fit); } };
  }

  /* ══ 1. THE BELT ══════════════════════════════════════════════════════
     TreadGame's premise without a treadmill: your pace drives the game, you
     just make it with two thumbs instead of two legs. Alternate the pads (or
     Z and X) to build speed, steer with the arrows, bank the colour called. */
  mount("belt", "#open-belt, .t-tread .mark", (stage) => {
    stage.innerHTML =
      '<div class="belt-hud">' +
        '<b><i>SPD</i><span id="b-spd">0.0</span><em>km/h</em></b>' +
        '<b><i>PACE</i><span id="b-pace">--:--</span><em>/km</em></b>' +
        '<b><i>DIST</i><span id="b-dist">0</span><em>m</em></b>' +
        '<b><i>CAL</i><span id="b-cal">0</span><em>kcal</em></b>' +
      '</div>' +
      '<div class="belt-call">Get running</div>' +
      '<div class="belt-wrap"></div>' +
      '<div class="belt-foot">' +
        '<button class="belt-pad" data-pad="l" type="button" aria-label="Left step">L</button>' +
        '<div class="belt-mid"><b id="b-score">0</b><i>banked</i><u id="b-time">60</u></div>' +
        '<button class="belt-pad" data-pad="r" type="button" aria-label="Right step">R</button>' +
      '</div>' +
      '<p class="tgm-help">Alternate the <b>L</b> and <b>R</b> pads &mdash; or <kbd>Z</kbd><kbd>X</kbd> &mdash; to build pace, ' +
      'like feet on the belt. Steer with the arrows on either side, or <kbd>&larr;</kbd><kbd>&rarr;</kbd>.</p>';

    const wrap = stage.querySelector(".belt-wrap");
    // Steering was a hidden gesture (tap a side of the belt). Give it two
    // targets you can actually see and reach with the same thumbs.
    wrap.insertAdjacentHTML("beforeend",
      '<button class="belt-steer" data-steer="-1" type="button" aria-label="Move left">\u2039</button>' +
      '<button class="belt-steer" data-steer="1" type="button" aria-label="Move right">\u203a</button>');
    const view = canvasIn(wrap);
    const ctx = view.ctx;
    const el = (id) => stage.querySelector("#" + id);
    const callEl = stage.querySelector(".belt-call");

    const COLOURS = [
      { name: "ORANGE", hex: "#fa801e" },
      { name: "BLUE",   hex: "#2f7bff" },
      { name: "GREEN",  hex: "#28c46c" },
    ];
    const LANES = [-1, 0, 1];

    let pace = 0;            // 0..1, decays unless you keep stepping
    let lastPad = null;      // alternating pads is what builds it
    let lane = 1, laneX = 0; // current lane and its eased position
    let dist = 0, score = 0, tokens = [], rungs = [];
    let target = 0, callAt = 0, flash = 0, flashCol = "#fff";
    let started = false, over = false, t0 = 0, last = 0, raf = 0;
    let runCycle = 0.9;      // a stance, not a stick, before the first step

    for (let i = 0; i < 14; i++) rungs.push(i / 14);

    const step = (pad) => {
      if (over) return;
      if (!started) begin();
      if (pad === lastPad) return;        // both feet, or it isn't running
      lastPad = pad;
      pace = clamp(pace + 0.085, 0, 1);
    };
    const steer = (d) => { if (!over) lane = clamp(lane + d, 0, 2); };

    const keys = (e) => {
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); step("l"); }
      else if (k === "x") { e.preventDefault(); step("r"); }
      else if (k === "arrowleft" || k === "a") { e.preventDefault(); steer(-1); }
      else if (k === "arrowright" || k === "d") { e.preventDefault(); steer(1); }
    };
    addEventListener("keydown", keys);

    stage.querySelectorAll(".belt-pad").forEach((p) => {
      const hit = (e) => { e.preventDefault(); step(p.dataset.pad); };
      p.addEventListener("pointerdown", hit);
    });
    wrap.querySelectorAll(".belt-steer").forEach((b) => {
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); steer(+b.dataset.steer); });
    });
    view.c.addEventListener("pointerdown", (e) => {
      const r = view.c.getBoundingClientRect();
      steer(e.clientX - r.left < r.width / 2 ? -1 : 1);
    });

    const newCall = (now) => {
      target = Math.floor(Math.random() * COLOURS.length);
      callAt = now;
      callEl.textContent = "BANK " + COLOURS[target].name;
      callEl.style.color = COLOURS[target].hex;
    };

    function begin() {
      started = true;
      t0 = performance.now();
      newCall(t0);
    }

    // z runs 1 (horizon) to 0 (underfoot); everything scales through this
    const HORIZON = () => view.h * 0.34;
    const proj = (z) => {
      const s = 1 / (0.22 + z * 1.85);
      const sN = 1 / 0.22, sF = 1 / 2.07;
      const hz = HORIZON();
      return { s: s / sN, y: hz + (view.h - hz) * ((s - sF) / (sN - sF)) };
    };

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05) || 0;
      last = now;

      if (started && !over) {
        // Decay has to ease off as you slow, or there is no equilibrium: a flat
        // rate means any tempo below break-even leaves you stuck at zero no
        // matter how long you keep at it. Proportional + a small floor gives
        // every tempo its own speed, and still brings you to a stop.
        pace = clamp(pace - dt * (0.04 + pace * 0.32), 0, 1);
        const kmh = pace * 15.5;
        const mps = kmh / 3.6;
        dist += mps * dt;

        el("b-spd").textContent = kmh.toFixed(1);
        el("b-pace").textContent = kmh < 1 ? "--:--" :
          (() => { const s = 3600 / kmh; return Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0"); })();
        el("b-dist").textContent = Math.round(dist);
        el("b-cal").textContent = Math.round(dist * 0.06);

        const left = Math.max(0, 60 - (now - t0) / 1000);
        el("b-time").textContent = Math.ceil(left);
        if (left <= 0) finish();

        if (now - callAt > 7000) newCall(now);

        // tokens arrive faster the faster you are going
        if (pace > 0.06 && Math.random() < dt * (0.7 + pace * 5)) {
          tokens.push({ z: 1, lane: Math.floor(Math.random() * 3),
                        c: Math.floor(Math.random() * COLOURS.length) });
        }
        for (const t of tokens) t.z -= dt * pace * 0.95;   // stand still, nothing comes
        for (let i = tokens.length - 1; i >= 0; i--) {
          const t = tokens[i];
          if (t.z <= 0.04) {
            if (t.lane === lane) {
              if (t.c === target) { score += 10; flash = 1; flashCol = COLOURS[t.c].hex; }
              // a wrong colour should sting, not end the run: 0.22 was a quarter
              // of your pace, and at speed you meet enough tokens that running
              // fast actively made you slower than jogging
              else { score = Math.max(0, score - 4); pace = clamp(pace - 0.09, 0, 1); flash = 1; flashCol = "#e0473f"; }
            }
            tokens.splice(i, 1);
          }
        }
        for (let i = 0; i < rungs.length; i++) {
          rungs[i] -= dt * pace * 0.95;
          if (rungs[i] <= 0) rungs[i] += 1;
        }
        runCycle += dt * (2 + pace * 12);
      }

      laneX += (LANES[lane] - laneX) * Math.min(1, dt * 11);
      flash = Math.max(0, flash - dt * 2.6);
      draw();
    }

    function draw() {
      const w = view.w, h = view.h, cx = w / 2, hz = HORIZON();
      const sky = ctx.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, "#0a1730"); sky.addColorStop(1, "#12386b");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hz);
      ctx.fillStyle = "#071023"; ctx.fillRect(0, hz, w, h - hz);

      const LW = w * 0.30;                    // half-width of the belt at z=0
      const BELT = 2.5;                       // belt spread
      const LANE = BELT * 2 / 3;              // lane centres, two thirds out
      const edge = (z, side) => { const p = proj(z); return { x: cx + side * LW * p.s * BELT, y: p.y }; };

      // the belt itself
      ctx.beginPath();
      const tl = edge(1, -1), tr = edge(1, 1), br = edge(0, 1), bl = edge(0, -1);
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      const belt = ctx.createLinearGradient(0, hz, 0, h);
      belt.addColorStop(0, "#8a4410"); belt.addColorStop(1, "#fa801e");
      ctx.fillStyle = belt; ctx.fill();

      // tread rungs rushing at you — the speed you feel
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      for (const rz of rungs) {
        const a = edge(rz, -1), b = edge(rz, 1);
        ctx.lineWidth = Math.max(1, proj(rz).s * 9);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      // lane dividers
      ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 2;
      for (const d of [-1 / 3, 1 / 3]) {
        const p1 = proj(1), p0 = proj(0);
        ctx.beginPath();
        ctx.moveTo(cx + d * LW * p1.s * BELT, p1.y);
        ctx.lineTo(cx + d * LW * p0.s * BELT, p0.y);
        ctx.stroke();
      }

      // tokens, furthest first so near ones sit on top
      const sorted = tokens.slice().sort((a, b) => b.z - a.z);
      for (const t of sorted) {
        const p = proj(t.z);
        const x = cx + LANES[t.lane] * LW * p.s * LANE;
        const r = Math.max(2, p.s * 46);
        ctx.beginPath(); ctx.arc(x, p.y - r * 0.5, r, 0, Math.PI * 2);
        ctx.fillStyle = COLOURS[t.c].hex; ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.strokeStyle = "rgba(255,255,255,0.65)"; ctx.stroke();
      }

      const rp = proj(0.06);            // one depth for both axes, or he
      drawRunner(cx + laneX * LW * rp.s * LANE, rp.y, w);   // runs off the belt

      if (flash > 0) {
        ctx.fillStyle = flashCol;
        ctx.globalAlpha = flash * 0.28;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      if (!started) {
        ctx.fillStyle = "rgba(4,8,18,0.62)"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#f2f0ea";
        ctx.textAlign = "center";
        ctx.font = "700 " + Math.round(Math.min(w * 0.062, 30)) + "px 'Space Grotesk', system-ui, sans-serif";
        ctx.fillText("Start stepping", cx, h * 0.5);
      }
    }

    /* We are behind him, so a run cycle here is not legs swinging side to
       side — that reads as a star jump. From this angle running is one leg
       planted while the other kicks its heel up behind, alternating. */
    function drawRunner(x, y, w) {
      const sc = Math.max(1.25, Math.min(w / 190, 2.6));
      const drive = 0.32 + pace * 0.68;                 // a stance at rest, a stride at speed
      const bob = Math.abs(Math.cos(runCycle)) * 4.5 * sc * (0.25 + pace);
      const yy = y - bob;
      const lean = 3 * sc * (0.25 + pace);

      const leg = (side, ph) => {
        const lift = Math.max(0, Math.sin(ph)) * drive;
        const hipX = x + side * 4.6 * sc, hipY = yy - 2 * sc;
        const kneeX = hipX + side * 1.4 * sc, kneeY = hipY + 13 * sc - lift * 6.5 * sc;
        const footX = kneeX - side * 1.2 * sc - lift * 2 * sc * side;
        const footY = kneeY + 13 * sc - lift * 15 * sc;
        ctx.moveTo(hipX, hipY); ctx.lineTo(kneeX, kneeY); ctx.lineTo(footX, footY);
      };
      const arm = (side, ph) => {
        const sw = Math.sin(ph) * drive;
        const shX = x + side * 7 * sc + lean, shY = yy - 23 * sc;
        const elX = shX + side * 3.4 * sc, elY = shY + 10 * sc;
        ctx.moveTo(shX, shY); ctx.lineTo(elX, elY);
        ctx.lineTo(elX + side * 1.5 * sc - sw * 3.5 * sc, elY + 8 * sc - Math.abs(sw) * 3 * sc);
      };
      const body = () => {
        ctx.beginPath();
        ctx.moveTo(x - 7 * sc + lean, yy - 23 * sc); ctx.lineTo(x + 7 * sc + lean, yy - 23 * sc);  // shoulders
        ctx.moveTo(x - 4.6 * sc, yy - 2 * sc); ctx.lineTo(x + 4.6 * sc, yy - 2 * sc);              // hips
        ctx.moveTo(x + lean, yy - 23 * sc); ctx.lineTo(x, yy - 2 * sc);                            // spine
        leg(1, runCycle); leg(-1, runCycle + Math.PI);
        arm(1, runCycle + Math.PI); arm(-1, runCycle);
        ctx.stroke();
      };

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.38)";   // an outline, or he vanishes into the belt
      ctx.lineWidth = 8.5 * sc;
      body();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4.4 * sc;
      body();

      ctx.beginPath();
      ctx.arc(x + lean * 1.2, yy - 31 * sc, 7.4 * sc, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.38)"; ctx.lineWidth = 3.4 * sc; ctx.stroke();
      ctx.fillStyle = "#ffffff"; ctx.fill();
    }

    function finish() {
      over = true;
      callEl.textContent = "Belt stopped";
      callEl.style.color = "#fa801e";
      const card = document.createElement("div");
      card.className = "tgm-over";
      card.innerHTML = "<h4>" + score + " banked</h4><p>" + Math.round(dist) +
        "m at " + (dist / 60 * 3.6).toFixed(1) + "km/h average.</p>" +
        "<button type='button'>Run it again</button>";
      card.querySelector("button").addEventListener("click", () => {
        card.remove();
        pace = 0; dist = 0; score = 0; tokens = []; lane = 1;
        over = false; started = false; lastPad = null;
        el("b-score").textContent = "0";
        callEl.textContent = "Get running"; callEl.style.color = "";
      });
      wrap.appendChild(card);
    }

    last = performance.now();
    raf = requestAnimationFrame(frame);
    const scoreTick = setInterval(() => { el("b-score").textContent = score; }, 120);

    return {
      stop() {
        cancelAnimationFrame(raf);
        clearInterval(scoreTick);
        removeEventListener("keydown", keys);
        view.release();
      },
    };
  });

  /* ══ 2. CAR BACK ══════════════════════════════════════════════════════
     What CycleHUD is actually for: knowing what's behind you without looking.
     Call each car as it closes — too eager and you've cried wolf. */
  mount("carback", "#open-carback, .t-cycle .mark", (stage) => {
    stage.innerHTML =
      '<div class="cb-top">' +
        '<span><b id="cb-score">0</b><i>points</i></span>' +
        '<span><b id="cb-time">45</b><i>seconds left</i></span>' +
      '</div>' +
      '<div class="cb-wrap"></div>' +
      '<div class="cb-call" id="cb-call">Watch your six</div>' +
      '<button class="cb-btn" id="cb-btn" type="button">Call it</button>' +
      '<p class="tgm-help">A car is worth calling once it reaches the inner ring. ' +
      '<kbd>Space</kbd> works too. Call an empty road and you have cried wolf.</p>';

    const wrap = stage.querySelector(".cb-wrap");
    const view = canvasIn(wrap, "cb-canvas");
    const ctx = view.ctx;
    const scoreEl = stage.querySelector("#cb-score");
    const timeEl = stage.querySelector("#cb-time");
    const callEl = stage.querySelector("#cb-call");

    let cars = [], score = 0, sweep = 0, over = false;
    let t0 = performance.now(), last = t0, raf = 0, flash = 0, flashOk = true;
    const IN = 0.42, GONE = 0.1;      // callable band, and the point it's past you

    const say = (text, ok) => {
      callEl.textContent = text;
      callEl.style.color = ok ? "#25e3ee" : "#e0473f";
      flash = 1; flashOk = ok;
    };

    const call = () => {
      if (over) return;
      // the nearest car inside the band is the one you mean
      let best = null;
      for (const c of cars) if (!c.done && c.r <= IN && c.r > GONE) if (!best || c.r < best.r) best = c;
      if (best) { best.done = true; score += 10; say("Car back — called", true); }
      else { score = Math.max(0, score - 5); say("Nothing there", false); }
      scoreEl.textContent = score;
    };
    stage.querySelector("#cb-btn").addEventListener("click", call);
    const keys = (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); call(); } };
    addEventListener("keydown", keys);

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05) || 0;
      last = now;
      sweep = (sweep + dt * 1.9) % (Math.PI * 2);

      if (!over) {
        const left = Math.max(0, 45 - (now - t0) / 1000);
        timeEl.textContent = Math.ceil(left);
        if (left <= 0) finish();
        if (Math.random() < dt * 0.85 && cars.length < 4) {
          cars.push({ r: 1, a: rand(0, Math.PI * 2), v: rand(0.075, 0.16), done: false });
        }
        for (let i = cars.length - 1; i >= 0; i--) {
          const c = cars[i];
          c.r -= c.v * dt;
          if (c.r <= GONE) {
            if (!c.done) { score = Math.max(0, score - 5); say("One went by uncalled", false); scoreEl.textContent = score; }
            cars.splice(i, 1);
          }
        }
      }
      flash = Math.max(0, flash - dt * 2.2);
      draw();
    }

    function draw() {
      const w = view.w, h = view.h, cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.44;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#04121a"; ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(37,227,238,0.28)"; ctx.lineWidth = 1;
      for (const f of [1, 0.72, IN, 0.2]) {
        ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(37,227,238,0.5)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R * IN, 0, Math.PI * 2); ctx.stroke();

      const g = ctx.createConicGradient ? null : null;   // keep it simple and portable
      ctx.save();                                        // sweep
      ctx.translate(cx, cy); ctx.rotate(sweep);
      const wedge = ctx.createLinearGradient(0, 0, R, 0);
      wedge.addColorStop(0, "rgba(37,227,238,0.30)");
      wedge.addColorStop(1, "rgba(37,227,238,0)");
      ctx.fillStyle = wedge;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -0.38, 0); ctx.closePath(); ctx.fill();
      ctx.restore();

      for (const c of cars) {
        const x = cx + Math.cos(c.a) * R * c.r, y = cy + Math.sin(c.a) * R * c.r;
        const near = c.r <= IN;
        ctx.beginPath(); ctx.arc(x, y, near ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = c.done ? "#28c46c" : near ? "#e6392e" : "#b23a32";
        ctx.fill();
        if (near && !c.done) {
          ctx.beginPath(); ctx.arc(x, y, 8 + (1 - c.r / IN) * 10, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(230,57,46,0.5)"; ctx.lineWidth = 2; ctx.stroke();
        }
      }
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#f2f0ea"; ctx.fill();

      if (flash > 0) {
        ctx.strokeStyle = flashOk ? "rgba(37,227,238," + flash + ")" : "rgba(230,57,46," + flash + ")";
        ctx.lineWidth = 5; ctx.strokeRect(2, 2, w - 4, h - 4);
      }
    }

    function finish() {
      over = true;
      callEl.textContent = "Ride over";
      callEl.style.color = "#25e3ee";
      const card = document.createElement("div");
      card.className = "tgm-over";
      card.innerHTML = "<h4>" + score + "</h4><p>Every car behind you, on screen.</p>" +
        "<button type='button'>Ride again</button>";
      card.querySelector("button").addEventListener("click", () => {
        card.remove(); cars = []; score = 0; over = false;
        t0 = performance.now(); scoreEl.textContent = "0";
        callEl.textContent = "Watch your six"; callEl.style.color = "";
      });
      wrap.appendChild(card);
    }

    raf = requestAnimationFrame(frame);
    return { stop() { cancelAnimationFrame(raf); removeEventListener("keydown", keys); view.release(); } };
  });

  /* ══ 3. THE NETWORK ═══════════════════════════════════════════════════
     Gaitway's thesis as a puzzle: every path joined into one network, and the
     run you'd never have thought of hiding somewhere in it. Cover as much
     ground as you can without repeating a path. */
  mount("network", "#open-network, .t-gait .mark", (stage) => {
    stage.innerHTML =
      '<div class="nw-top"><b id="nw-dist">0</b><i>m covered</i><span id="nw-left"></span></div>' +
      '<div class="nw-wrap"></div>' +
      '<p class="nw-note" id="nw-note">Tap a junction joined to the one you are on.</p>' +
      '<p class="tgm-help">No path twice. The run ends when every path out of you has been used.</p>';

    const wrap = stage.querySelector(".nw-wrap");
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "nw-svg");
    wrap.appendChild(svg);

    const distEl = stage.querySelector("#nw-dist");
    const leftEl = stage.querySelector("#nw-left");
    const noteEl = stage.querySelector("#nw-note");

    let nodes = [], edges = [], at = 0, covered = 0, over = false;

    function build() {
      nodes = []; edges = []; covered = 0; at = 0; over = false;
      const COLS = 4, ROWS = 4;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        nodes.push({
          x: 12 + c * 25.3 + rand(-3.4, 3.4),
          y: 12 + r * 25.3 + rand(-3.4, 3.4),
        });
      }
      const id = (c, r) => r * COLS + c;
      const add = (a, b) => {
        const A = nodes[a], B = nodes[b];
        const m = Math.round(Math.hypot(A.x - B.x, A.y - B.y) * 18);
        edges.push({ a, b, m, used: false });
      };
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (c < COLS - 1 && Math.random() < 0.86) add(id(c, r), id(c + 1, r));
        if (r < ROWS - 1 && Math.random() < 0.86) add(id(c, r), id(c, r + 1));
      }
      // a lone junction is a dead start; give any orphan a way back in
      nodes.forEach((_, i) => {
        if (!edges.some(e => e.a === i || e.b === i)) {
          const c = i % COLS, r = (i / COLS) | 0;
          if (c < COLS - 1) add(i, id(c + 1, r)); else add(i, id(c - 1, r));
        }
      });
      at = Math.floor(Math.random() * nodes.length);
    }

    const outs = (n) => edges.filter(e => !e.used && (e.a === n || e.b === n));

    function render() {
      svg.textContent = "";
      for (const e of edges) {
        const A = nodes[e.a], B = nodes[e.b];
        const l = document.createElementNS(NS, "line");
        l.setAttribute("x1", A.x); l.setAttribute("y1", A.y);
        l.setAttribute("x2", B.x); l.setAttribute("y2", B.y);
        l.setAttribute("class", "nw-edge" + (e.used ? " used" : "") +
          (!e.used && (e.a === at || e.b === at) ? " open" : ""));
        svg.appendChild(l);
      }
      // the distance on each path out, the way the watch calls a fork
      for (const e of outs(at)) {
        const A = nodes[e.a], B = nodes[e.b];
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", (A.x + B.x) / 2); t.setAttribute("y", (A.y + B.y) / 2 - 1.4);
        t.setAttribute("class", "nw-m");
        t.textContent = e.m + "m";
        svg.appendChild(t);
      }
      nodes.forEach((n, i) => {
        const reachable = outs(at).some(e => e.a === i || e.b === i);
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", n.x); c.setAttribute("cy", n.y);
        c.setAttribute("r", i === at ? 3.4 : reachable ? 2.8 : 1.8);
        c.setAttribute("class", "nw-node" + (i === at ? " here" : reachable ? " next" : ""));
        if (reachable) c.addEventListener("click", () => go(i));
        svg.appendChild(c);
      });
    }

    function go(to) {
      if (over) return;
      const e = outs(at).find(x => x.a === to || x.b === to);
      if (!e) return;
      e.used = true;
      covered += e.m;
      at = to;
      distEl.textContent = covered;
      const left = outs(at);
      leftEl.textContent = left.length ? left.length + " ways on" : "";
      if (!left.length) finish();
      else noteEl.textContent = left.length === 1 ? "One way on from here." : "Pick your fork.";
      render();
    }

    function finish() {
      over = true;
      const unused = edges.filter(e => !e.used).length;
      noteEl.textContent = "Nowhere left to go.";
      const card = document.createElement("div");
      card.className = "tgm-over";
      card.innerHTML = "<h4>" + covered + "m</h4><p>" +
        (unused === 0 ? "Every path in the network. Nothing left unrun."
                      : unused + " path" + (unused === 1 ? "" : "s") + " you never got to.") +
        "</p><button type='button'>New network</button>";
      card.querySelector("button").addEventListener("click", () => {
        card.remove(); build(); render();
        distEl.textContent = "0"; leftEl.textContent = "";
        noteEl.textContent = "Tap a junction joined to the one you are on.";
      });
      wrap.appendChild(card);
    }

    build();
    render();
    return { stop() {} };
  });
})();
