(() => {
  "use strict";

  const root = document.documentElement;
  const cursorLight = document.getElementById("cursorLight");
  const canvas = document.getElementById("embers");
  const dots = Array.from(document.querySelectorAll(".hexdot"));
  const slides = Array.from(document.querySelectorAll(".slide"));

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  /* ---------------------------------------------------------------- */
  /*  Background rotation                                             */
  /* ---------------------------------------------------------------- */

  const SLIDE_MS = 9000;
  let current = 0;
  let rotateTimer = 0;
  let paused = false;

  function syncSlide() {
    slides.forEach((slide, i) => slide.classList.toggle("is-live", i === current));
    dots.forEach((dot, i) => {
      const live = i === current;
      dot.classList.toggle("is-live", live);
      dot.setAttribute("aria-pressed", String(live));
    });
  }

  function schedule() {
    window.clearInterval(rotateTimer);
    if (reduceMotion || paused) return;
    rotateTimer = window.setInterval(() => {
      current = (current + 1) % slides.length;
      syncSlide();
    }, SLIDE_MS);
  }

  function goTo(index) {
    current = ((index % slides.length) + slides.length) % slides.length;
    syncSlide();
    schedule();
  }

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      goTo(Number(dot.dataset.go) || 0);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(current + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(current - 1);
    }
  });

  document.addEventListener("visibilitychange", () => {
    paused = document.hidden;
    if (paused) {
      window.clearInterval(rotateTimer);
    } else {
      schedule();
    }

    if (canvas && !reduceMotion) {
      active = !document.hidden;
      if (active) {
        lastTime = 0;
        rafId = window.requestAnimationFrame(loopEmbers);
      } else {
        window.cancelAnimationFrame(rafId);
      }
    }
  });

  syncSlide();
  schedule();

  ["bg-city", "bg-practice", "bg-wildfire"].forEach((name) => {
    const img = new Image();
    img.src = `assets/${name}.webp`;
  });

  /* ---------------------------------------------------------------- */
  /*  Pointer parallax + warm cursor light                            */
  /* ---------------------------------------------------------------- */

  function applyPointer(x, y) {
    const nx = x / Math.max(window.innerWidth, 1) - 0.5;
    const ny = y / Math.max(window.innerHeight, 1) - 0.5;
    root.style.setProperty("--mx", (nx * 2).toFixed(3));
    root.style.setProperty("--my", (ny * 2).toFixed(3));
    if (cursorLight) {
      cursorLight.style.setProperty("--cx", `${x.toFixed(1)}px`);
      cursorLight.style.setProperty("--cy", `${y.toFixed(1)}px`);
    }
  }

  if (finePointer && !reduceMotion) {
    window.addEventListener(
      "pointermove",
      (event) => {
        document.body.classList.add("has-pointer");
        applyPointer(event.clientX, event.clientY);
      },
      { passive: true }
    );
  }

  window.addEventListener(
    "pointerdown",
    (event) => {
      burst(event.clientX, event.clientY, 24);
    },
    { passive: true }
  );

  /* ---------------------------------------------------------------- */
  /*  Ember field                                                     */
  /* ---------------------------------------------------------------- */

  let ctx = null;
  let emberWidth = 0;
  let emberHeight = 0;
  let dpr = 1;
  let particles = [];
  let rafId = 0;
  let lastTime = 0;
  let active = !reduceMotion;
  const sprites = [];

  function makeSprite(size, core, glow) {
    const c = document.createElement("canvas");
    const s = Math.max(8, Math.round(size));
    c.width = s;
    c.height = s;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, core);
    grad.addColorStop(0.28, glow);
    grad.addColorStop(1, "rgba(255,70,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return c;
  }

  function initSprites() {
    if (sprites.length) return;
    sprites.push(makeSprite(18, "rgba(255,246,214,1)", "rgba(255,169,67,0.8)"));
    sprites.push(makeSprite(30, "rgba(255,214,138,0.95)", "rgba(255,108,20,0.55)"));
    sprites.push(makeSprite(48, "rgba(255,176,86,0.55)", "rgba(255,66,0,0.32)"));
    sprites.push(makeSprite(12, "rgba(255,255,240,1)", "rgba(255,193,100,0.7)"));
  }

  function particleCount() {
    const area = emberWidth * emberHeight;
    const base = Math.round(area / 13000);
    return Math.max(34, Math.min(finePointer ? 126 : 62, base));
  }

  function spawnParticle(atX, atY, burstMode) {
    const speed = burstMode ? 38 + Math.random() * 115 : 7 + Math.random() * 30;
    const angle = burstMode
      ? -Math.PI / 2 + (Math.random() - 0.5) * 1.3
      : -Math.PI / 2 + (Math.random() - 0.5) * 0.44;
    const sizeRoll = Math.random();
    const sprite = sizeRoll > 0.86 ? sprites[2] : sizeRoll > 0.58 ? sprites[1] : sizeRoll > 0.24 ? sprites[0] : sprites[3];
    const life = burstMode ? 0.7 + Math.random() * 0.75 : 2.8 + Math.random() * 5.2;
    return {
      x: atX,
      y: atY,
      vx: Math.cos(angle) * speed * (0.55 + Math.random() * 0.7),
      vy: Math.sin(angle) * speed,
      size: (burstMode ? 3.4 : 2) + Math.random() * (burstMode ? 6 : 5.4),
      life,
      maxLife: life,
      sprite,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.5 + Math.random() * 1.7,
      drift: (Math.random() - 0.5) * 9,
      glow: 0.5 + Math.random() * 0.46
    };
  }

  function seedParticles() {
    initSprites();
    particles = [];
    const count = particleCount();
    for (let i = 0; i < count; i += 1) {
      const p = spawnParticle(Math.random() * emberWidth, Math.random() * emberHeight, false);
      p.life = Math.random() * p.maxLife;
      p.y = emberHeight - Math.random() * emberHeight * 0.55;
      particles.push(p);
    }
  }

  function resizeEmbers() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    emberWidth = window.innerWidth;
    emberHeight = window.innerHeight;
    canvas.width = Math.round(emberWidth * dpr);
    canvas.height = Math.round(emberHeight * dpr);
    canvas.style.width = `${emberWidth}px`;
    canvas.style.height = `${emberHeight}px`;
    ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "lighter";
    }
    seedParticles();
  }

  function stepEmbers(dt, now) {
    if (!ctx) return;
    ctx.clearRect(0, 0, emberWidth, emberHeight);

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.life -= dt;
      p.wobble += p.wobbleSpeed * dt;
      p.x += (p.vx + Math.sin(p.wobble) * 9 + p.drift) * dt;
      p.y += p.vy * dt;
      p.vy += 7 * dt;
      p.vx *= 0.995;

      if (p.life <= 0 || p.y < -60 || p.x < -80 || p.x > emberWidth + 80) {
        particles[i] = spawnParticle(Math.random() * emberWidth, emberHeight + 30, false);
        continue;
      }

      const t = Math.max(0, Math.min(1, p.life / p.maxLife));
      const fade = Math.min(1, t * 2.4) * Math.min(1, (1 - t) * 2 + 0.18);
      const flicker = 0.7 + 0.3 * Math.sin(now * 0.009 + p.wobble * 2.6);
      const alpha = Math.max(0, fade * p.glow * flicker);
      const size = p.size * (0.72 + t * 0.42);
      ctx.globalAlpha = alpha;
      ctx.drawImage(p.sprite, p.x - size / 2, p.y - size / 2, size, size);
    }

    ctx.globalAlpha = 1;
    rafId = window.requestAnimationFrame(loopEmbers);
  }

  function loopEmbers(now) {
    if (!active) return;
    if (!lastTime) lastTime = now;
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    stepEmbers(dt, now);
  }

  function burst(x, y, count) {
    if (!ctx || reduceMotion) return;
    for (let i = 0; i < count; i += 1) {
      particles.push(spawnParticle(x, y, true));
    }
    if (particles.length > 190) {
      particles.splice(0, particles.length - 190);
    }
  }

  if (canvas && !reduceMotion) {
    resizeEmbers();
    window.addEventListener("resize", resizeEmbers, { passive: true });
    rafId = window.requestAnimationFrame(loopEmbers);
  } else if (canvas) {
    canvas.style.display = "none";
  }

  /* ---------------------------------------------------------------- */
  /*  Softly hint that the page is interactive                        */
  /* ---------------------------------------------------------------- */

  // Keep the cursor light near the pointer without paying for a tween in CSS.
  if (finePointer && !reduceMotion) {
    window.addEventListener("blur", () => {
      document.body.classList.remove("has-pointer");
    });
    document.addEventListener("pointerleave", () => {
      document.body.classList.remove("has-pointer");
    });
  }
})();
