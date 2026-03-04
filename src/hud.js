/**
 * hud.js — HUD estilo GTA V
 *
 * API pública:
 *   HUD.setPlayer(name, avatarUrl, role?)
 *   HUD.setHealth(0–100)
 *   HUD.setEnergy(0–100)
 *   HUD.setMission(title, text)
 *   HUD.clearMission()
 *   HUD.notify(text, type)          — type: 'info' | 'warn' | 'success' | 'error'
 *   HUD.minimap.setPlayerPos(x, z)  — posição do jogador local (coords Three.js)
 *   HUD.minimap.setWorldSize(n)     — tamanho do mundo em unidades (default 200)
 *   HUD.minimap.addOther(id, x, z)  — adiciona outro jogador
 *   HUD.minimap.updateOther(id,x,z) — atualiza posição
 *   HUD.minimap.removeOther(id)     — remove jogador
 */

(function () {
  'use strict';

  // ── Ícones Boxicons injetados inline ────────────────────────────────────────
  const ICONS = {
    health: `<i class='bx bxs-heart'    style="color:#ff5c5c"></i>`,
    energy: `<i class='bx bxs-bolt'     style="color:#f0b90b"></i>`,
    warn:   `<i class='bx bxs-error'    class="hud-toast-icon"></i>`,
    info:   `<i class='bx bx-info-circle' class="hud-toast-icon"></i>`,
    success:`<i class='bx bxs-check-circle' class="hud-toast-icon"></i>`,
    error:  `<i class='bx bxs-x-circle' class="hud-toast-icon"></i>`,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // DOM — cria todos os elementos do HUD
  // ══════════════════════════════════════════════════════════════════════════

  function buildHUD() {

    // ── Canto inferior direito: avatar + barras ──────────────────────────────
    const root = el('div', 'hud-root');

    // Avatar + nome
    const player = el('div', 'hud-player');
    const avatar = document.createElement('img');
    avatar.id  = 'hud-avatar';
    avatar.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="18" cy="18" r="18" fill="%23222"/><text x="18" y="23" text-anchor="middle" font-size="16" fill="%23888">?</text></svg>';
    avatar.alt = 'avatar';

    const info = el('div', 'hud-player-info');
    const name = el('div', 'hud-player-name'); name.textContent = 'Jogador';
    const role = el('div', 'hud-player-role'); role.textContent = 'Ouvinte';
    info.append(name, role);
    player.append(avatar, info);

    // Barras
    const bars = el('div', 'hud-bars');
    bars.appendChild(makeBar('health', ICONS.health, '#ff5c5c'));
    bars.appendChild(makeBar('energy', ICONS.energy, '#f0b90b'));

    root.append(player, bars);
    document.body.appendChild(root);

    // ── Canto inferior esquerdo: minimapa ────────────────────────────────────
    const mmWrap  = el('div', 'hud-minimap-wrap');
    const north   = el('div', 'hud-minimap-north'); north.textContent = 'N';
    const frame   = el('div', 'hud-minimap-frame');
    const ring    = el('div', 'hud-minimap-ring');
    const canvas  = document.createElement('canvas');
    canvas.id     = 'hud-minimap-canvas';
    canvas.width  = 160; canvas.height = 160;

    // Dot do jogador local (sempre no centro)
    const localDot = el('div', 'mm-dot-local');

    const coords  = el('div', 'hud-minimap-coords');
    coords.id     = 'hud-minimap-coords';
    coords.textContent = '0, 0';

    frame.append(canvas, ring, localDot);
    mmWrap.append(north, frame, coords);
    document.body.appendChild(mmWrap);

    // ── Canto superior esquerdo: missão ──────────────────────────────────────
    const mission = el('div', 'hud-mission');
    mission.style.display = 'none';
    const mInner  = el('div', 'hud-mission-inner');
    const mLabel  = el('div', 'hud-mission-label'); mLabel.textContent = 'MISSÃO ATIVA';
    const mTitle  = el('div', 'hud-mission-title');
    const mText   = el('div', 'hud-mission-text');
    mInner.append(mLabel, mTitle, mText);
    mission.appendChild(mInner);
    document.body.appendChild(mission);

    // ── Canto superior direito: toasts ───────────────────────────────────────
    const toasts = el('div', 'hud-toasts');
    document.body.appendChild(toasts);

    return { root, avatar, name, role, bars, canvas, coords, mission, mTitle, mText, toasts };
  }

  function el(tag, id) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    return e;
  }

  function makeBar(id, iconHTML, color) {
    const row   = document.createElement('div');
    row.className = 'hud-bar-row';

    const icon  = document.createElement('span');
    icon.className = 'hud-bar-icon';
    icon.innerHTML = iconHTML;

    const track = document.createElement('div');
    track.className = 'hud-bar-track';

    const fill  = document.createElement('div');
    fill.className = 'hud-bar-fill';
    fill.id = `hud-${id}-fill`;
    fill.style.width = '100%';
    track.appendChild(fill);

    const val   = document.createElement('span');
    val.className = 'hud-bar-val';
    val.id = `hud-${id}-val`;
    val.textContent = '100';

    row.append(icon, track, val);
    return row;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Minimapa — canvas 2D com grid e dots
  // ══════════════════════════════════════════════════════════════════════════

  const minimapState = {
    worldSize: 200,       // tamanho do mundo em unidades Three.js
    playerX: 0, playerZ: 0,
    others: new Map(),    // id → { x, z, dot }
  };

  function drawMinimapGrid(ctx, size) {
    ctx.clearRect(0, 0, size, size);

    // Fundo
    ctx.fillStyle = 'rgba(8,15,10,0)';
    ctx.fillRect(0, 0, size, size);

    // Grade sutil
    ctx.strokeStyle = 'rgba(0,255,157,0.06)';
    ctx.lineWidth = 1;
    const step = size / 8;
    for (let i = step; i < size; i += step) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }

    // Cruz central
    ctx.strokeStyle = 'rgba(0,255,157,0.12)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(size/2, 0); ctx.lineTo(size/2, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, size/2); ctx.lineTo(size, size/2); ctx.stroke();
    ctx.setLineDash([]);
  }

  function worldToMM(wx, wz, canvasSize) {
    const half = minimapState.worldSize / 2;
    // Relativo ao jogador local
    const relX = wx - minimapState.playerX;
    const relZ = wz - minimapState.playerZ;
    const scale = canvasSize / minimapState.worldSize;
    return {
      x: canvasSize / 2 + relX * scale,
      y: canvasSize / 2 + relZ * scale,
    };
  }

  function refreshMinimap(coords) {
    const canvas = document.getElementById('hud-minimap-canvas');
    if (!canvas) return;
    const ctx    = canvas.getContext('2d');
    const size   = canvas.width;
    drawMinimapGrid(ctx, size);

    // Outros jogadores
    minimapState.others.forEach(({ x, z }) => {
      const pos = worldToMM(x, z, size);
      if (pos.x < 0 || pos.x > size || pos.y < 0 || pos.y > size) return;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#00cfff';
      ctx.shadowColor = '#00cfff';
      ctx.shadowBlur = 5;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Jogador local — sempre no centro, indicado pelo dot HTML
    // Atualiza coords display
    if (coords) {
      coords.textContent = `${Math.round(minimapState.playerX)}, ${Math.round(minimapState.playerZ)}`;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API pública
  // ══════════════════════════════════════════════════════════════════════════

  const DOM = buildHUD();
  // Desenha grid inicial
  const mmCanvas = document.getElementById('hud-minimap-canvas');
  if (mmCanvas) {
    drawMinimapGrid(mmCanvas.getContext('2d'), mmCanvas.width);
  }

  window.HUD = {

    // ── Jogador ──────────────────────────────────────────────────────────────
    setPlayer(name, avatarUrl, role) {
      const displayName = (name || 'Jogador').toUpperCase();
      DOM.name.textContent = displayName;

      // Traduz role para PT-BR
      const roleMap = {
        player:    'Ouvinte',
        presenter: 'Apresentador',
        moderator: 'Moderador',
        admin:     'Admin',
      };
      DOM.role.textContent = roleMap[role] || role || 'Ouvinte';

      // Modelos GLB não são imagens — gera avatar com a inicial do nome via Canvas
      if (avatarUrl && !avatarUrl.endsWith('.glb')) {
        DOM.avatar.src = avatarUrl;
        DOM.avatar.onerror = () => generateInitialAvatar(displayName);
      } else {
        generateInitialAvatar(displayName);
      }

      function generateInitialAvatar(n) {
        const c   = document.createElement('canvas');
        c.width   = c.height = 72;
        const ctx = c.getContext('2d');
        // Fundo escuro
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 72, 72);
        // Borda amarela
        ctx.strokeStyle = '#f0b90b';
        ctx.lineWidth   = 3;
        ctx.strokeRect(1.5, 1.5, 69, 69);
        // Inicial
        ctx.fillStyle    = '#f0b90b';
        ctx.font         = 'bold 34px "Rajdhani", Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((n || '?')[0], 36, 38);
        DOM.avatar.src = c.toDataURL();
      }
    },

    // ── Vida ─────────────────────────────────────────────────────────────────
    setHealth(v) {
      const val  = Math.max(0, Math.min(100, v));
      const fill = document.getElementById('hud-health-fill');
      const txt  = document.getElementById('hud-health-val');
      if (fill) fill.style.width = val + '%';
      if (txt)  txt.textContent  = val;

      // Avatar pulsa em vermelho se vida < 30
      if (val < 30) DOM.avatar.classList.add('danger');
      else          DOM.avatar.classList.remove('danger');

      // Barra fica vermelha puro abaixo de 25
      if (fill) {
        if (val <= 25)
          fill.style.background = 'linear-gradient(90deg,#8b0000,#ff3c3c)';
        else if (val <= 50)
          fill.style.background = 'linear-gradient(90deg,#c0392b,#e74c3c)';
        else
          fill.style.background = 'linear-gradient(90deg,#e03030,#ff5c5c)';
      }
    },

    // ── Energia ──────────────────────────────────────────────────────────────
    setEnergy(v) {
      const val  = Math.max(0, Math.min(100, v));
      const fill = document.getElementById('hud-energy-fill');
      const txt  = document.getElementById('hud-energy-val');
      if (fill) fill.style.width = val + '%';
      if (txt)  txt.textContent  = val;
    },

    // ── Missão ───────────────────────────────────────────────────────────────
    setMission(title, text) {
      DOM.mTitle.textContent = title || '';
      DOM.mText.textContent  = text  || '';
      DOM.mission.style.display = 'block';
    },

    clearMission() {
      DOM.mission.style.display = 'none';
    },

    // ── Toast rápido ─────────────────────────────────────────────────────────
    notify(text, type = 'info') {
      const iconMap = {
        warn:    `<i class='bx bxs-error'         style="color:#f0b90b;font-size:16px"></i>`,
        success: `<i class='bx bxs-check-circle'  style="color:#00ff9d;font-size:16px"></i>`,
        error:   `<i class='bx bxs-x-circle'      style="color:#ff3c3c;font-size:16px"></i>`,
        info:    `<i class='bx bx-info-circle'     style="color:#00cfff;font-size:16px"></i>`,
      };

      const toast = document.createElement('div');
      toast.className = `hud-toast ${type}`;
      toast.innerHTML = `${iconMap[type] || iconMap.info}<span>${text}</span>`;
      DOM.toasts.appendChild(toast);

      // Remove após 3.5s com animação
      setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => toast.remove());
      }, 3500);
    },

    // ── Minimapa ─────────────────────────────────────────────────────────────
    minimap: {
      // Define tamanho do mundo (raio de visão no mapa)
      setWorldSize(n) {
        minimapState.worldSize = n;
      },

      // Atualiza posição do jogador local (chame a cada frame)
      setPlayerPos(x, z) {
        minimapState.playerX = x;
        minimapState.playerZ = z;
        refreshMinimap(DOM.coords);
      },

      // Adiciona/atualiza outro jogador
      addOther(id, x, z) {
        minimapState.others.set(id, { x, z });
        refreshMinimap(DOM.coords);
      },
      updateOther(id, x, z) {
        if (minimapState.others.has(id)) {
          minimapState.others.set(id, { x, z });
          refreshMinimap(DOM.coords);
        }
      },
      removeOther(id) {
        minimapState.others.delete(id);
        refreshMinimap(DOM.coords);
      },
    },
  };

})();