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

  const turn = (name, forward, animate) => new Promise((done) => {
    const move = MOVES[name];
    if (!move) return done();
    const deg = (forward ? 1 : -1) * 90 * move.layer;
    const R = rot(move.axis, deg);
    const moving = cubies.filter((c) => apply(c.m, c.home)[move.axis] === move.layer);

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

  const setNote = (text, win) => {
    note.textContent = text;
    note.classList.toggle("win", !!win);
  };

  const doMove = async (name, forward, record) => {
    if (busy) return;
    busy = true;
    await turn(name, forward, true);
    if (record) {
      history.push({ name, forward });
      turns += 1;
      turnsEl.textContent = turns;
    }
    busy = false;
    if (isSolved() && turns > 0) {
      setNote("Solved! " + turns + (turns === 1 ? " turn." : " turns."), true);
    } else if (record) {
      setNote("Drag to look around. Tap a letter to turn that side.");
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
      history.push({ name, forward });
    }
    turns = 0;
    turnsEl.textContent = "0";
    busy = false;
    setNote("Your turn. Tap a letter to turn that side.");
  });

  document.getElementById("cube-solve").addEventListener("click", async () => {
    if (busy || !history.length) return;
    busy = true;
    setNote("Winding it back…");
    while (history.length) {
      const step = history.pop();
      await turn(step.name, !step.forward, true);
    }
    turns = 0;
    turnsEl.textContent = "0";
    busy = false;
    setNote("Solved. Scramble it again?", true);
  });

  // Drag to look around.
  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    view.y += (e.clientX - drag.x) * 0.55;
    view.x -= (e.clientY - drag.y) * 0.55;
    view.x = Math.max(-85, Math.min(85, view.x));
    drag = { x: e.clientX, y: e.clientY };
    applyView();
  });
  const endDrag = () => { drag = null; };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  const open = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    box.classList.add("open");
    document.body.style.overflow = "hidden";
    build();
    setNote("Drag to look around. Tap a letter to turn that side.");
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
