(function() {
  // ── Canvas overlay ────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.id = 'ctOS-cursor-canvas';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  window.addEventListener('resize', () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  // ── Estado ────────────────────────────────────────────────────────────────
  let mx = -200, my = -200;         // posição atual do mouse
  let angle   = 0;                  // rotação contínua do crosshair
  let clickPulse = 0;               // 0..1, decai após click
  let clickX = 0, clickY = 0;       // posição do último click

  // Partículas de rastro
  const particles = [];
  const MAX_PART  = 48;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  document.addEventListener('mousedown', e => {
    clickPulse = 1;
    clickX = e.clientX;
    clickY = e.clientY;
    // Burst de partículas no click
    for (let i = 0; i < 10; i++) spawnParticle(mx, my, true);
  });

  function spawnParticle(x, y, burst = false) {
    const speed = burst ? (Math.random() * 3 + 1.5) : (Math.random() * 1.2 + 0.3);
    const angle = Math.random() * Math.PI * 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: burst ? (Math.random() * 0.06 + 0.04) : (Math.random() * 0.04 + 0.025),
      size: burst ? (Math.random() * 2.5 + 1) : (Math.random() * 1.8 + 0.6),
    });
  }

  // ── Loop de animação ──────────────────────────────────────────────────────
  let lastX = mx, lastY = my;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Spawn de rastro ao mover
    const dx = mx - lastX, dy = my - lastY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 4 && particles.length < MAX_PART) spawnParticle(mx, my);
    lastX = mx; lastY = my;

    // ── Partículas ────────────────────────────────────────────────────────
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x   += p.vx;
      p.y   += p.vy;
      p.vx  *= 0.92;
      p.vy  *= 0.92;
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = p.life * 0.7;
      ctx.shadowColor = '#00cfff';
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = `hsl(${190 + (1 - p.life) * 40}, 100%, ${55 + p.life * 20}%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Click pulse ring ──────────────────────────────────────────────────
    if (clickPulse > 0) {
      const r = (1 - clickPulse) * 28;
      ctx.save();
      ctx.globalAlpha = clickPulse * 0.7;
      ctx.strokeStyle = '#00cfff';
      ctx.shadowColor = '#00cfff';
      ctx.shadowBlur  = 12;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(clickX, clickY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      clickPulse -= 0.045;
    }

    // ── Crosshair ─────────────────────────────────────────────────────────
    angle += 0.018;   // rotação contínua lenta
    const SIZE   = 11; // metade do comprimento de cada segmento
    const GAP    = 5;  // espaço central vazio
    const THICK  = 1.5;
    const COLOR  = '#00cfff';
    const GLOW   = 10;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.strokeStyle = COLOR;
    ctx.shadowColor = COLOR;
    ctx.shadowBlur  = GLOW;
    ctx.lineWidth   = THICK;
    ctx.lineCap     = 'round';

    // 4 segmentos do crosshair (N S E W)
    const dirs = [0, Math.PI/2, Math.PI, Math.PI * 1.5];
    for (const d of dirs) {
      ctx.save();
      ctx.rotate(d);
      ctx.beginPath();
      ctx.moveTo(0, GAP);
      ctx.lineTo(0, GAP + SIZE);
      ctx.stroke();
      ctx.restore();
    }

    // Ponto central minúsculo
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = COLOR;
    ctx.shadowBlur = 6;
    ctx.fill();

    ctx.restore();

    // Corner brackets estáticos (não rotativos) — estética ctOS
    const B = 5; // tamanho do bracket
    const O = 9; // offset do centro
    ctx.save();
    ctx.translate(mx, my);
    ctx.strokeStyle = 'rgba(0,207,255,0.35)';
    ctx.shadowColor = 'rgba(0,207,255,0.5)';
    ctx.shadowBlur  = 4;
    ctx.lineWidth   = 1;
    ctx.lineCap     = 'square';
    const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
    for (const [sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(sx * O, sy * (O + B));
      ctx.lineTo(sx * O, sy * O);
      ctx.lineTo(sx * (O + B), sy * O);
      ctx.stroke();
    }
    ctx.restore();

    requestAnimationFrame(draw);
  }

  // Aguarda o DOM estar pronto antes de iniciar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', draw);
  } else {
    draw();
  }
})();