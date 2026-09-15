/* NoobCube's taster: a real 3x3 you can turn.

   Its own file on purpose. It used to live at the end of games.js, where a
   throw from anything above it would have stopped it ever running, and where a
   cached copy of that file kept serving the version from before it existed.

   Each cubie carries its own orientation matrix. A layer turn multiplies that
   matrix and re-lays the cubie out with the rotation applied before the
   translation, so it orbits the middle of the cube rather than spinning where
   it stands. Solve it winds the whole history back. */
(() => {
  const box = document.getElementById("cubebox");
  if (!box) return;
  const stage = document.getElementById("cube-stage");
  const cubeEl = document.getElementById("cube-3d");
  const note = document.getElementById("cube-note");
  const turnsEl = document.getElementById("cube-turns");
  const dirBtn = document.getElementById("cube-dir");

  // CSS space: x right, y DOWN, z towards you. So the top layer is y = -1.
  const COLOUR = { U: "#f5f5f0", D: "#ffd61a", F: "#1cb359", B: "#0d6bd9", R: "#e02a2e", L: "#fa7d17" };
  const STICKERS = [
    { key: "U", n: [0, -1, 0], face: "rotateX(90deg)" },
    { key: "D", n: [0, 1, 0], face: "rotateX(-90deg)" },
    { key: "R", n: [1, 0, 0], face: "rotateY(90deg)" },
    { key: "L", n: [-1, 0, 0], face: "rotateY(-90deg)" },
    { key: "F", n: [0, 0, 1], face: "" },
    { key: "B", n: [0, 0, -1], face: "rotateY(180deg)" },
  ];
  // Which axis each face spins about, and which layer it is.
  // A clockwise turn is always 90 * layer degrees, which falls out of the
  // handedness of CSS's coordinate space and saves six special cases.
  const MOVES = {
    U: { axis: 1, layer: -1 }, D: { axis: 1, layer: 1 },
    R: { axis: 0, layer: 1 },  L: { axis: 0, layer: -1 },
    F: { axis: 2, layer: 1 },  B: { axis: 2, layer: -1 },
  };

  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const mul = (a, b) => a.map((row, i) =>
    [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
  const apply = (m, v) => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);

  // Rotation about an axis by +-90, in CSS's convention.
  const rot = (axis, deg) => {
    const c = 0, s = deg > 0 ? 1 : -1;
    if (axis === 0) return [[1, 0, 0], [0, c, -s], [0, s, c]];
    if (axis === 1) return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  };

  let cubies = [], unit = 56, busy = false, history = [], turns = 0, clockwise = true;
  let view = { x: -22, y: -34 };

  const matrix3d = (m) => `matrix3d(${m[0][0]},${m[1][0]},${m[2][0]},0,` +
    `${m[0][1]},${m[1][1]},${m[2][1]},0,` +
    `${m[0][2]},${m[1][2]},${m[2][2]},0,0,0,0,1)`;

  // The rotation has to come first so the cubie orbits the middle of the
  // cube rather than spinning where it stands.
  const place = (c) => {
    c.el.style.transform = matrix3d(c.m) +
      ` translate3d(${c.home[0] * unit}px, ${c.home[1] * unit}px, ${c.home[2] * unit}px)`;
  };

  const build = () => {
    cubeEl.innerHTML = "";
    cubies = [];
    unit = Math.round(cubeEl.clientWidth / 3) || 56;
    const push = unit / 2;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (!x && !y && !z) continue;
          const el = document.createElement("div");
          el.className = "cubie";
          const home = [x, y, z];
          STICKERS.forEach((s) => {
            if (s.n[0] * x + s.n[1] * y + s.n[2] * z !== 1) return;
            const face = document.createElement("div");
            face.className = "sticker";
            face.style.background = COLOUR[s.key];
            face.style.transform = `${s.face} translateZ(${push}px)`;
            el.appendChild(face);
          });
          cubeEl.appendChild(el);
          const c = { el, home, m: I.map((r) => r.slice()) };
          cubies.push(c);
          place(c);
        }
      }
    }
    applyView();
  };

  const applyView = () => {
    cubeEl.style.transform = `rotateX(${view.x}deg) rotateY(${view.y}deg)`;
  };

  const isSolved = () => {
    const seen = {};
    for (const c of cubies) {
      for (const s of STICKERS) {
        if (s.n[0] * c.home[0] + s.n[1] * c.home[1] + s.n[2] * c.home[2] !== 1) continue;
        const dir = apply(c.m, s.n).join(",");
        if (seen[dir] && seen[dir] !== s.key) return false;
        seen[dir] = s.key;
      }
    }
    return true;
  };

  /// Turn one layer: every cubie whose position along `axis` sits in `layer`.
  const spin = (axis, layer, deg, animate) => new Promise((done) => {
    const R = rot(axis, deg);
    const moving = cubies.filter((c) => Math.round(apply(c.m, c.home)[axis]) === layer);

    moving.forEach((c) => {
      if (animate) c.el.classList.add("turning");
      c.m = mul(R, c.m);
      place(c);
    });

    if (!animate) return done();
    setTimeout(() => {
      moving.forEach((c) => c.el.classList.remove("turning"));
      done();
    }, 230);
  });

  /// The spin a named move stands for, so buttons and swipes record alike.
  const moveSpin = (name, forward) => {
    const m = MOVES[name];
    return { axis: m.axis, layer: m.layer, deg: (forward ? 1 : -1) * 90 * m.layer };
  };

  const turn = (name, forward, animate) => {
    const move = MOVES[name];
    if (!move) return Promise.resolve();
    return spin(move.axis, move.layer, (forward ? 1 : -1) * 90 * move.layer, animate);
  };

  const setNote = (text, win) => {
    note.textContent = text;
    note.classList.toggle("win", !!win);
  };

  const doMove = async (name, forward, record) => {
    if (busy) return;
    busy = true;
    await turn(name, forward, true);
    if (record) {
      history.push(moveSpin(name, forward));
      turns += 1;
      turnsEl.textContent = turns;
    }
    busy = false;
    if (isSolved() && turns > 0) {
      setNote("Solved! " + turns + (turns === 1 ? " turn." : " turns."), true);
    } else if (record) {
      setNote("Swipe a row to turn it. Drag off the cube to look around.");
    }
  };

  document.getElementById("cube-keys").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-move]");
    if (btn) doMove(btn.dataset.move, clockwise, true);
  });

  dirBtn.addEventListener("click", () => {
    clockwise = !clockwise;
    dirBtn.setAttribute("aria-pressed", String(!clockwise));
    dirBtn.textContent = clockwise ? "Turning ↻ this way" : "Turning ↺ that way";
  });

  document.getElementById("cube-scramble").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    setNote("Mixing it up…");
    const names = Object.keys(MOVES);
    let last = "";
    for (let i = 0; i < 20; i++) {
      let name = names[Math.floor(Math.random() * names.length)];
      while (name === last) name = names[Math.floor(Math.random() * names.length)];
      last = name;
      const forward = Math.random() < 0.5;
      await turn(name, forward, i > 14);
      history.push(moveSpin(name, forward));
    }
    turns = 0;
    turnsEl.textContent = "0";
    busy = false;
    setNote("Your turn. Swipe a row to turn it.");
  });

  document.getElementById("cube-solve").addEventListener("click", async () => {
    if (busy || !history.length) return;
    busy = true;
    setNote("Winding it back…");
    while (history.length) {
      const step = history.pop();
      await spin(step.axis, step.layer, -step.deg, true);
    }
    turns = 0;
    turnsEl.textContent = "0";
    busy = false;
    setNote("Solved. Scramble it again?", true);
  });

  // ── dragging ──────────────────────────────────────────────────────────
  //
  // Land on a sticker and you turn that layer; land anywhere else and you
  // swing the whole cube round to look at it.

  const DEPTH = 900;                      // must match .cube-stage's perspective
  const radians = (d) => (d * Math.PI) / 180;
  const rotXf = (d) => [[1, 0, 0], [0, Math.cos(radians(d)), -Math.sin(radians(d))],
                        [0, Math.sin(radians(d)), Math.cos(radians(d))]];
  const rotYf = (d) => [[Math.cos(radians(d)), 0, Math.sin(radians(d))], [0, 1, 0],
                        [-Math.sin(radians(d)), 0, Math.cos(radians(d))]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
                           a[2] * b[0] - a[0] * b[2],
                           a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const transpose = (m) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => m[j][i]));

  /// Which sticker is under a touch, worked out rather than asked for.
  ///
  /// elementFromPoint cannot be trusted through a preserve-3d hierarchy — on a
  /// phone it mostly came back with nothing, so every swipe fell through to
  /// "spin the view" and the cube appeared to ignore you. This projects the
  /// touch back into the cube instead: the set of points that land on that spot
  /// of screen is a straight line, so it is just a ray against a box.
  const stickerUnder = (clientX, clientY) => {
    const rect = stage.getBoundingClientRect();
    const sx = clientX - (rect.left + rect.width / 2);
    const sy = clientY - (rect.top + rect.height / 2);
    const half = 1.5 * unit;

    // A point at depth t projects to this spot when its x and y are
    // scaled by (DEPTH - t) / DEPTH, which is linear in t.
    const back = transpose(mul(rotXf(view.x), rotYf(view.y)));
    const start = apply(back, [sx, sy, 0]);
    const along = apply(back, [-sx / DEPTH, -sy / DEPTH, 1]);

    let near = -Infinity, far = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(along[i]) < 1e-9) {
        if (Math.abs(start[i]) > half) return null;
        continue;
      }
      let lo = (-half - start[i]) / along[i];
      let hi = (half - start[i]) / along[i];
      if (lo > hi) { const swap = lo; lo = hi; hi = swap; }
      near = Math.max(near, lo);
      far = Math.min(far, hi);
    }
    if (near > far) return null;

    // Larger t is nearer the eye, so the far end of the span is the face you
    // can actually see.
    const hit = [0, 1, 2].map((i) => start[i] + far * along[i]);
    const faceAxis = [0, 1, 2].reduce((a, b) => (Math.abs(hit[b]) > Math.abs(hit[a]) ? b : a), 0);

    const normal = [0, 0, 0];
    normal[faceAxis] = hit[faceAxis] > 0 ? 1 : -1;
    const position = hit.map((v) => Math.max(-1, Math.min(1, Math.round(v / unit))));
    position[faceAxis] = normal[faceAxis];
    return { normal, position };
  };

  /// Work out which layer a swipe across a face means.
  ///
  /// Not "which turn moves this sticker most like my finger" — with the cube
  /// tilted, every turn looks diagonal on screen and that picks the wrong one.
  /// Instead: decide which way the finger is travelling *across the face*, then
  /// turn the layer at right angles to it, which is what a hand expects.
  const swipeToTurn = (normal, position, dx, dy) => {
    const view3 = mul(rotXf(view.x), rotYf(view.y));
    const faceAxis = [0, 1, 2].reduce((a, b) =>
      Math.abs(normal[b]) > Math.abs(normal[a]) ? b : a, 0);
    const inPlane = [0, 1, 2].filter((i) => i !== faceAxis);

    const length = Math.hypot(dx, dy) || 1;
    const finger = [dx / length, dy / length];

    let along = null;
    for (const i of inPlane) {
      const unitAxis = [0, 0, 0];
      unitAxis[i] = 1;
      const onScreen = apply(view3, unitAxis);
      const size = Math.hypot(onScreen[0], onScreen[1]) || 1e-9;
      const alignment = (finger[0] * onScreen[0] + finger[1] * onScreen[1]) / size;
      if (!along || Math.abs(alignment) > Math.abs(along.alignment)) {
        along = { alignment, axis: i };
      }
    }
    if (!along) return null;

    const travel = [0, 0, 0];
    travel[along.axis] = along.alignment > 0 ? 1 : -1;
    const axis = inPlane.find((i) => i !== along.axis);
    const spinUnit = [0, 0, 0];
    spinUnit[axis] = 1;

    return {
      axis,
      layer: position[axis],
      deg: dot(cross(spinUnit, position), travel) > 0 ? 90 : -90,
    };
  };

  let gesture = null;
  const THRESHOLD = 16;

  stage.addEventListener("pointerdown", (e) => {
    gesture = {
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      face: stickerUnder(e.clientX, e.clientY),
      done: false,
    };
    if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener("pointermove", (e) => {
    if (!gesture) return;

    if (gesture.face) {
      if (gesture.done || busy) return;
      const dx = e.clientX - gesture.x0;
      const dy = e.clientY - gesture.y0;
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      gesture.done = true;
      const move = swipeToTurn(gesture.face.normal, gesture.face.position, dx, dy);
      if (move) {
        busy = true;
        spin(move.axis, move.layer, move.deg, true).then(() => {
          history.push(move);
          turns += 1;
          turnsEl.textContent = turns;
          busy = false;
          if (isSolved()) {
            setNote("Solved! " + turns + (turns === 1 ? " turn." : " turns."), true);
          }
        });
      }
      return;
    }

    view.y += (e.clientX - gesture.x) * 0.55;
    view.x -= (e.clientY - gesture.y) * 0.55;
    view.x = Math.max(-85, Math.min(85, view.x));
    gesture.x = e.clientX;
    gesture.y = e.clientY;
    applyView();
  });

  const endGesture = () => { gesture = null; };
  stage.addEventListener("pointerup", endGesture);
  stage.addEventListener("pointercancel", endGesture);

  const open = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    box.classList.add("open");
    document.body.style.overflow = "hidden";
    build();
    setNote("Swipe a row to turn it. Drag off the cube to look around.");
  };
  const close = () => {
    box.classList.remove("open");
    document.body.style.overflow = "";
  };

  // Listen on the document in the capture phase. The chip sits inside the row's
  // link, so this has to run before the anchor does anything about the tap —
  // otherwise the phone just opens noobcube.robbo-online.uk in a new tab. Using
  // closest() also catches taps that land on a child of the chip.
  const isOpener = (e) =>
    e.target && e.target.closest && e.target.closest("#open-cubebox, .t-noob .mark");

  document.addEventListener("click", (e) => {
    if (isOpener(e)) open(e);
  }, true);
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && isOpener(e)) open(e);
  }, true);

  document.getElementById("cubebox-close").addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && box.classList.contains("open")) close();
  });
  window.addEventListener("resize", () => {
    if (box.classList.contains("open")) build();
  });
})();
