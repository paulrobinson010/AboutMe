/* The cubes drifting behind the NoobCube row.

   Lifted from noobcube.robbo-online.uk, which runs the same thing behind its
   whole page. They are not a loop of pictures: each one is a real 3x3 carrying
   the same orientation-matrix model the app itself uses, so what you are
   watching is an actual scramble being made and then genuinely unwound, move
   by move. The colours and the pose come from the app's design tokens, so the
   cubes here and the cubes in the app are the same cube.

   Drawn on a canvas rather than in the DOM — a few hundred little quads a frame
   is nothing for a canvas, and would be a lot of elements otherwise.

   Two things differ from the version on the app's own site. It sizes itself to
   one row rather than the viewport, and it stops dead whenever that row is off
   screen: this page is long, and a page that quietly burns a core animating
   something nobody can see is a worse page than one with no cubes at all. */
(() => {
  "use strict";

  const canvas = document.getElementById("noob-cubes");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");

  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Same space as the app: x right, y down, z towards you.
  /* BEGIN generated from Design/tokens.json */
  const COLOUR = [
    [243, 243, 243],    // white
    [255, 216, 4],      // yellow
    [253, 27, 21],      // red
    [254, 136, 4],      // orange
    [9, 214, 71],       // green
    [5, 112, 253],      // blue
  ];
  const PLASTIC = [11, 16, 24];   // the black body the stickers sit on
  const STICKER = 0.84;   // how much of a face the sticker covers
  const POSE = { pitch: -0.42, yaw: -0.62 };
  /* END generated */
  const FACES = [
    { n: [0, -1, 0], c: 0 },   // up     white
    { n: [0, 1, 0], c: 1 },    // down   yellow
    { n: [1, 0, 0], c: 2 },    // right  red
    { n: [-1, 0, 0], c: 3 },   // left   orange
    { n: [0, 0, 1], c: 4 },    // front  green
    { n: [0, 0, -1], c: 5 },   // back   blue
  ];

  const mul = (a, b) => a.map((row) =>
    [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
  const apply = (m, v) => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);
  const I = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  /// A quarter turn, exact in whole numbers so orientations never drift.
  const quarter = (axis, deg) => {
    const s = deg > 0 ? 1 : -1;
    if (axis === 0) return [[1, 0, 0], [0, 0, -s], [0, s, 0]];
    if (axis === 1) return [[0, 0, s], [0, 1, 0], [-s, 0, 0]];
    return [[0, -s, 0], [s, 0, 0], [0, 0, 1]];
  };

  /// A partial turn, for the moment a layer is halfway round.
  const partial = (axis, radians) => {
    const c = Math.cos(radians), s = Math.sin(radians);
    if (axis === 0) return [[1, 0, 0], [0, c, -s], [0, s, c]];
    if (axis === 1) return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  };

  const view = mul(partial(0, POSE.pitch), partial(1, POSE.yaw));   // the pose the app uses too

  class Cube {
    constructor() {
      this.cubies = [];
      for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -1; z <= 1; z++) {
            if (!x && !y && !z) continue;
            this.cubies.push({ home: [x, y, z], m: I() });
          }
        }
      }
      this.queue = [];
      this.done = [];
      this.turning = null;
      this.wait = Math.random() * 2.5;
      this.mode = "idle";
      this.spin = Math.random() * Math.PI * 2;
    }

    plan() {
      if (this.mode === "idle") {
        // Shuffle it up.
        const count = 8 + Math.floor(Math.random() * 6);
        let last = -1;
        for (let i = 0; i < count; i++) {
          let axis = Math.floor(Math.random() * 3);
          while (axis === last) axis = Math.floor(Math.random() * 3);
          last = axis;
          const layer = Math.random() < 0.5 ? -1 : 1;
          this.queue.push({ axis, layer, deg: Math.random() < 0.5 ? 90 : -90, pace: 0.26 });
        }
        this.mode = "scrambling";
      } else if (this.mode === "scrambling") {
        // And put it back, slower, so you can see it being solved.
        this.queue = this.done.slice().reverse()
          .map((t) => ({ axis: t.axis, layer: t.layer, deg: -t.deg, pace: 0.42 }));
        this.done = [];
        this.mode = "solving";
      } else {
        this.done = [];
        this.mode = "idle";
        this.wait = 1.4 + Math.random() * 2.4;
      }
    }

    step(dt) {
      this.spin += dt * 0.12;

      if (this.turning) {
        this.turning.t += dt / this.turning.pace;
        if (this.turning.t >= 1) {
          const { axis, layer, deg } = this.turning;
          const R = quarter(axis, deg);
          for (const c of this.cubies) {
            if (Math.round(apply(c.m, c.home)[axis]) === layer) c.m = mul(R, c.m);
          }
          if (this.mode === "scrambling") this.done.push({ axis, layer, deg });
          this.turning = null;
        }
        return;
      }

      if (this.wait > 0) { this.wait -= dt; return; }
      if (!this.queue.length) { this.plan(); return; }
      this.turning = Object.assign({ t: 0 }, this.queue.shift());
    }

    /// Every outward-facing sticker, as a quad in view space.
    quads() {
      const out = [];
      const live = this.turning
        ? partial(this.turning.axis,
                  (this.turning.deg * Math.PI / 180) * Math.min(1, this.turning.t))
        : null;
      const lookRound = mul(view, partial(1, this.spin));

      for (const c of this.cubies) {
        const moving = live && Math.round(apply(c.m, c.home)[this.turning.axis]) === this.turning.layer;
        const orient = moving ? mul(live, c.m) : c.m;
        const world = mul(lookRound, orient);

        for (const f of FACES) {
          if (f.n[0] * c.home[0] + f.n[1] * c.home[1] + f.n[2] * c.home[2] !== 1) continue;

          const facing = apply(world, f.n);
          if (facing[2] <= 0.05) continue;              // pointing away from us

          // The face's four corners, in the cubie's own frame.
          const axis = f.n[0] ? 0 : f.n[1] ? 1 : 2;
          const [u, v] = [0, 1, 2].filter((i) => i !== axis);
          const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
            const p = [0, 0, 0];
            p[axis] = f.n[axis] * 0.5;
            p[u] = su * 0.5 * STICKER;
            p[v] = sv * 0.5 * STICKER;
            return apply(world, [c.home[0] + p[0], c.home[1] + p[1], c.home[2] + p[2]]);
          });

          // The same face at full width: these tile into the cube's black body.
          const plate = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
            const p = [0, 0, 0];
            p[axis] = f.n[axis] * 0.5;
            p[u] = su * 0.5;
            p[v] = sv * 0.5;
            return apply(world, [c.home[0] + p[0], c.home[1] + p[1], c.home[2] + p[2]]);
          });

          const depth = corners.reduce((a, p) => a + p[2], 0) / 4;
          out.push({ corners, plate, depth, colour: COLOUR[f.c], shade: 0.6 + 0.4 * facing[2] });
        }
      }
      out.sort((a, b) => a.depth - b.depth);            // painter's algorithm
      return out;
    }
  }

  // Where the cubes sit, as fractions of the canvas, with their size.
  //
  // Spread along the row rather than scattered over a page, and kept faint and
  // off to the sides: the row has words across the middle of it and they have
  // to stay the easiest thing to read.
  const SPOTS = [
    { x: 0.06, y: 0.28, r: 30, a: 0.34 },
    { x: 0.16, y: 0.76, r: 20, a: 0.24 },
    { x: 0.30, y: 0.18, r: 15, a: 0.16 },
    { x: 0.62, y: 0.82, r: 17, a: 0.16 },
    { x: 0.74, y: 0.24, r: 22, a: 0.22 },
    { x: 0.95, y: 0.66, r: 28, a: 0.30 },
  ];

  const rgb = (c, shade) =>
    `rgb(${Math.round(c[0] * shade)},${Math.round(c[1] * shade)},${Math.round(c[2] * shade)})`;

  let cubes = [], spots = [], width = 0, height = 0, ratio = 1;

  const resize = () => {
    ratio = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Fewer, smaller cubes on a narrow screen.
    const many = width < 620 ? 2 : SPOTS.length;
    spots = SPOTS.slice(0, many);
    if (cubes.length !== spots.length) {
      cubes = spots.map(() => new Cube());
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < cubes.length; i++) {
      const spot = spots[i];
      const scale = spot.r * (width < 620 ? 0.8 : 1);
      const cx = spot.x * width;
      const cy = spot.y * height;
      // A gentle perspective, so the near face reads as nearer.
      const trace = (points) => {
        ctx.beginPath();
        points.forEach((p, n) => {
          const k = 6 / (6 - p[2]);
          const x = cx + p[0] * scale * k;
          const y = cy + p[1] * scale * k;
          if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
      };

      ctx.globalAlpha = spot.a;
      for (const q of cubes[i].quads()) {
        // The black body first, then the sticker sitting on it. Shading is done
        // by darkening the colour, not by fading it, so the cube keeps its
        // colour whichever way the face is turned.
        const s = q.shade;
        trace(q.plate);
        ctx.fillStyle = rgb(PLASTIC, s);
        ctx.fill();
        trace(q.corners);
        ctx.fillStyle = rgb(q.colour, s);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  let last = 0, running = false, handle = 0;
  const frame = (now) => {
    // `last` is reset on waking, so a cube never leaps forward by however long
    // the row spent scrolled away.
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    for (const cube of cubes) cube.step(dt);
    draw();
    handle = requestAnimationFrame(frame);
  };

  const wake = () => {
    if (running) return;
    running = true;
    last = 0;
    handle = requestAnimationFrame(frame);
  };

  const sleep = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(handle);
  };

  window.addEventListener("resize", resize);
  resize();

  if (still) {
    // Hold them mid-scramble rather than animating.
    cubes.forEach((cube) => {
      for (let i = 0; i < 9; i++) {
        const axis = Math.floor(Math.random() * 3);
        const R = quarter(axis, Math.random() < 0.5 ? 90 : -90);
        const layer = Math.random() < 0.5 ? -1 : 1;
        for (const c of cube.cubies) {
          if (Math.round(apply(c.m, c.home)[axis]) === layer) c.m = mul(R, c.m);
        }
      }
    });
    draw();
  } else if (!("IntersectionObserver" in window)) {
    wake();
  } else {
    new IntersectionObserver((entries) => {
      entries[0].isIntersecting ? wake() : sleep();
    }, { rootMargin: "120px" }).observe(canvas);
    // Nothing is running yet, so draw one frame: a row scrolled past quickly
    // should still have cubes in it rather than a blank patch.
    draw();
    document.addEventListener("visibilitychange", () => {
      document.hidden ? sleep() : (canvas.getBoundingClientRect().top < innerHeight && wake());
    });
  }
})();
