/**
 * phone.js — ctOS Mobile Device
 *
 * API pública (window.Phone):
 *   Phone.toggle()                          — abre/fecha o smartphone (tecla P)
 *   Phone.open()  / Phone.close()
 *
 *   Phone.chat.receive(from, text, avatar?) — mensagem recebida de outro jogador
 *   Phone.chat.send(text)                   — mensagem enviada pelo player local
 *
 *   Phone.inbox.push({ id, title, body, type, time? })
 *     type: 'mission' | 'system' | 'alert' | 'info'
 *   Phone.inbox.complete(id)                — marca missão como concluída
 *   Phone.inbox.clear()
 *
 *   Phone.onSend = fn(text)                 — hook: chamado ao enviar mensagem
 *                                             (integre ao SocketManager aqui)
 */

(function () {
  'use strict';

  // ── Estilos ────────────────────────────────────────────────────────────────
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

    /* ── Botão flutuante (ícone do phone no HUD) ── */
    #ctos-phone-btn {
      position: fixed;
      bottom: 170px;
      left: 24px;
      width: 40px;
      height: 40px;
      z-index: 200;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,4,10,0.9);
      border: 1px solid rgba(0,207,255,0.35);
      clip-path: polygon(0 6px,6px 0,calc(100% - 6px) 0,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,6px 100%,0 calc(100% - 6px));
      transition: border-color .2s, box-shadow .2s;
      pointer-events: all;
    }
    #ctos-phone-btn:hover {
      border-color: rgba(0,207,255,0.8);
      box-shadow: 0 0 14px rgba(0,207,255,0.3);
    }
    #ctos-phone-btn svg { width:18px; height:18px; }
    #ctos-phone-btn .ctos-notif-badge {
      position: absolute;
      top: -4px; right: -4px;
      width: 14px; height: 14px;
      background: #ff3c00;
      border-radius: 50%;
      font-family: 'Share Tech Mono', monospace;
      font-size: 8px;
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 6px #ff3c00;
      display: none;
    }

    /* ── Overlay escuro ── */
    #ctos-phone-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0);
      z-index: 300;
      pointer-events: none;
      transition: background .3s;
    }
    #ctos-phone-overlay.open {
      background: rgba(0,0,0,0.45);
      pointer-events: all;
    }

    /* ── Corpo do smartphone ── */
    #ctos-phone {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%) translateY(110%);
      z-index: 301;
      width: 320px;
      height: 620px;
      pointer-events: all;
      transition: transform .38s cubic-bezier(0.16, 1, 0.3, 1);
      filter: drop-shadow(0 -8px 40px rgba(0,207,255,0.12));
    }
    #ctos-phone.open {
      transform: translateX(-50%) translateY(0%);
    }

    /* ── Moldura do telefone ── */
    #ctos-phone-shell {
      width: 100%;
      height: 100%;
      background: #04080f;
      border: 1px solid rgba(0,207,255,0.22);
      border-radius: 36px 36px 0 0;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
      box-shadow:
        inset 0 0 0 1px rgba(0,207,255,0.06),
        inset 0 40px 60px rgba(0,207,255,0.03);
    }

    /* Scanlines na moldura */
    #ctos-phone-shell::before {
      content: '';
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        0deg, transparent, transparent 2px,
        rgba(255,255,255,0.008) 2px, rgba(255,255,255,0.008) 4px
      );
      pointer-events: none;
      z-index: 10;
      border-radius: inherit;
    }

    /* Notch */
    #ctos-notch {
      position: absolute;
      top: 0; left: 50%;
      transform: translateX(-50%);
      width: 80px; height: 24px;
      background: #04080f;
      border-radius: 0 0 14px 14px;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    #ctos-notch-cam {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #0d1a2a;
      border: 1px solid rgba(0,207,255,0.2);
    }
    #ctos-notch-dot {
      width: 3px; height: 3px;
      border-radius: 50%;
      background: #00cfff;
      box-shadow: 0 0 4px #00cfff;
      animation: ctos-notch-blink 3s ease-in-out infinite;
    }
    @keyframes ctos-notch-blink {
      0%,90%,100% { opacity:1 } 95% { opacity:0.1 }
    }

    /* ── Status bar ── */
    #ctos-statusbar {
      height: 36px;
      padding: 18px 20px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      position: relative;
      z-index: 5;
    }
    #ctos-statusbar .ctos-time {
      font-family: 'Share Tech Mono', monospace;
      font-size: 10px;
      color: rgba(255,255,255,0.5);
      letter-spacing: .1em;
    }
    #ctos-statusbar .ctos-sys {
      font-family: 'Share Tech Mono', monospace;
      font-size: 8px;
      color: rgba(0,207,255,0.45);
      letter-spacing: .2em;
    }

    /* ── Tela interna do phone ── */
    #ctos-screen {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    /* ── App bar (tabs) ── */
    #ctos-appbar {
      display: flex;
      border-bottom: 1px solid rgba(0,207,255,0.1);
      flex-shrink: 0;
      position: relative;
    }
    .ctos-tab {
      flex: 1;
      height: 44px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      cursor: pointer;
      background: none;
      border: none;
      position: relative;
      transition: background .15s;
    }
    .ctos-tab:hover { background: rgba(0,207,255,0.04); }
    .ctos-tab.active { background: rgba(0,207,255,0.07); }
    .ctos-tab.active::after {
      content: '';
      position: absolute;
      bottom: 0; left: 20%; right: 20%;
      height: 2px;
      background: #00cfff;
      box-shadow: 0 0 6px #00cfff;
      border-radius: 2px 2px 0 0;
    }
    .ctos-tab svg { width:16px; height:16px; opacity:0.5; transition:opacity .15s; }
    .ctos-tab.active svg { opacity:1; }
    .ctos-tab-label {
      font-family: 'Share Tech Mono', monospace;
      font-size: 7px;
      letter-spacing: .2em;
      color: rgba(255,255,255,0.3);
      text-transform: uppercase;
    }
    .ctos-tab.active .ctos-tab-label { color: rgba(0,207,255,0.8); }
    .ctos-tab-badge {
      position: absolute;
      top: 6px; right: calc(50% - 14px);
      width: 12px; height: 12px;
      background: #ff3c00;
      border-radius: 50%;
      font-family: 'Share Tech Mono', monospace;
      font-size: 7px;
      color: #fff;
      display: none;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 4px #ff3c00;
    }

    /* ── Páginas ── */
    .ctos-page {
      display: none;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }
    .ctos-page.active { display: flex; }

    /* ──────── CHAT PAGE ──────── */
    #ctos-chat-header {
      padding: 10px 16px 8px;
      border-bottom: 1px solid rgba(0,207,255,0.08);
      flex-shrink: 0;
    }
    #ctos-chat-header .ctos-ch-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .18em;
      color: #00cfff;
      text-transform: uppercase;
    }
    #ctos-chat-header .ctos-ch-sub {
      font-family: 'Share Tech Mono', monospace;
      font-size: 8px;
      letter-spacing: .14em;
      color: rgba(255,255,255,0.2);
      margin-top: 1px;
    }
    #ctos-online-dots {
      display: flex; gap: 4px; margin-top: 5px; align-items: center;
    }
    .ctos-online-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: rgba(0,207,255,0.3);
    }
    .ctos-online-dot.you { background: #00cfff; box-shadow: 0 0 4px #00cfff; }
    #ctos-online-label {
      font-family: 'Share Tech Mono', monospace;
      font-size: 8px;
      color: rgba(255,255,255,0.2);
      letter-spacing: .1em;
      margin-left: 4px;
    }

    #ctos-messages {
      flex: 1;
      overflow-y: auto;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      scrollbar-width: thin;
      scrollbar-color: rgba(0,207,255,0.1) transparent;
    }
    #ctos-messages::-webkit-scrollbar { width:3px; }
    #ctos-messages::-webkit-scrollbar-thumb { background: rgba(0,207,255,0.15); border-radius:2px; }

    .ctos-msg {
      display: flex;
      flex-direction: column;
      max-width: 82%;
      animation: ctos-msg-in .2s cubic-bezier(0.2,0,0.4,1) both;
    }
    @keyframes ctos-msg-in {
      from { opacity:0; transform:translateY(8px); }
      to   { opacity:1; transform:translateY(0); }
    }
    .ctos-msg.sent { align-self: flex-end; align-items: flex-end; }
    .ctos-msg.recv { align-self: flex-start; align-items: flex-start; }

    .ctos-msg-from {
      font-family: 'Share Tech Mono', monospace;
      font-size: 8px;
      letter-spacing: .12em;
      color: rgba(0,207,255,0.5);
      margin-bottom: 2px;
      text-transform: uppercase;
    }
    .ctos-msg.sent .ctos-msg-from { color: rgba(240,185,11,0.5); }

    .ctos-msg-bubble {
      padding: 7px 11px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      line-height: 1.5;
      color: rgba(255,255,255,0.85);
      position: relative;
      word-break: break-word;
    }
    .ctos-msg.recv .ctos-msg-bubble {
      background: rgba(0,207,255,0.07);
      border: 1px solid rgba(0,207,255,0.18);
      border-radius: 2px 10px 10px 2px;
    }
    .ctos-msg.sent .ctos-msg-bubble {
      background: rgba(240,185,11,0.08);
      border: 1px solid rgba(240,185,11,0.22);
      border-radius: 10px 2px 2px 10px;
      color: rgba(255,255,255,0.9);
    }
    .ctos-msg-time {
      font-family: 'Share Tech Mono', monospace;
      font-size: 7px;
      color: rgba(255,255,255,0.15);
      margin-top: 2px;
      letter-spacing: .08em;
    }

    /* Separador de data */
    .ctos-date-sep {
      align-self: center;
      font-family: 'Share Tech Mono', monospace;
      font-size: 8px;
      letter-spacing: .2em;
      color: rgba(255,255,255,0.12);
      padding: 4px 10px;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      text-transform: uppercase;
    }

    /* Input de chat */
    #ctos-chat-input-row {
      display: flex;
      gap: 6px;
      padding: 8px 12px 16px;
      border-top: 1px solid rgba(0,207,255,0.08);
      flex-shrink: 0;
      align-items: flex-end;
    }
    #ctos-chat-input {
      flex: 1;
      background: rgba(0,207,255,0.05);
      border: 1px solid rgba(0,207,255,0.18);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      color: #fff;
      outline: none;
      resize: none;
      min-height: 34px;
      max-height: 80px;
      line-height: 1.4;
      caret-color: #00cfff;
      transition: border-color .15s;
    }
    #ctos-chat-input::placeholder { color: rgba(255,255,255,0.15); }
    #ctos-chat-input:focus { border-color: rgba(0,207,255,0.45); }

    #ctos-send-btn {
      width: 34px; height: 34px;
      background: rgba(0,207,255,0.12);
      border: 1px solid rgba(0,207,255,0.35);
      border-radius: 6px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: background .15s, box-shadow .15s;
      pointer-events: all;
    }
    #ctos-send-btn:hover {
      background: rgba(0,207,255,0.22);
      box-shadow: 0 0 10px rgba(0,207,255,0.2);
    }
    #ctos-send-btn svg { width:15px; height:15px; }

    /* ──────── INBOX PAGE ──────── */
    #ctos-inbox-header {
      padding: 10px 16px 8px;
      border-bottom: 1px solid rgba(0,207,255,0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    #ctos-inbox-header .ctos-ib-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .18em;
      color: #00cfff;
    }
    #ctos-inbox-clear {
      font-family: 'Share Tech Mono', monospace;
      font-size: 8px;
      letter-spacing: .15em;
      color: rgba(255,60,0,0.5);
      cursor: pointer;
      background: none; border: none;
      text-transform: uppercase;
      pointer-events: all;
      transition: color .15s;
    }
    #ctos-inbox-clear:hover { color: rgba(255,60,0,0.9); }

    #ctos-inbox-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
      scrollbar-width: thin;
      scrollbar-color: rgba(0,207,255,0.1) transparent;
    }
    #ctos-inbox-list::-webkit-scrollbar { width:3px; }
    #ctos-inbox-list::-webkit-scrollbar-thumb { background:rgba(0,207,255,0.15); }

    #ctos-inbox-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 8px;
      opacity: 0.3;
    }
    #ctos-inbox-empty svg { width:32px; height:32px; opacity:0.5; }
    #ctos-inbox-empty span {
      font-family: 'Share Tech Mono', monospace;
      font-size: 9px;
      letter-spacing: .2em;
      color: rgba(255,255,255,0.4);
      text-transform: uppercase;
    }

    .ctos-inbox-item {
      padding: 10px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      cursor: pointer;
      transition: background .15s;
      position: relative;
      animation: ctos-msg-in .2s cubic-bezier(0.2,0,0.4,1) both;
    }
    .ctos-inbox-item:hover { background: rgba(0,207,255,0.04); }
    .ctos-inbox-item.unread::before {
      content: '';
      position: absolute;
      left: 6px; top: 50%;
      transform: translateY(-50%);
      width: 3px; height: 3px;
      border-radius: 50%;
      background: #00cfff;
      box-shadow: 0 0 4px #00cfff;
    }
    .ctos-inbox-item.done { opacity: 0.35; }
    .ctos-inbox-item.done .ctos-ib-title-text {
      text-decoration: line-through;
    }

    .ctos-ib-row1 {
      display: flex; align-items: center; gap: 6px; margin-bottom: 3px;
    }
    .ctos-ib-type-badge {
      font-family: 'Share Tech Mono', monospace;
      font-size: 7px;
      letter-spacing: .18em;
      padding: 1px 5px;
      border-radius: 2px;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .ctos-ib-type-badge.mission { background:rgba(240,185,11,0.12); color:#f0b90b; border:1px solid rgba(240,185,11,0.25); }
    .ctos-ib-type-badge.system  { background:rgba(0,207,255,0.10); color:#00cfff; border:1px solid rgba(0,207,255,0.2);  }
    .ctos-ib-type-badge.alert   { background:rgba(255,60,0,0.10);  color:#ff3c00; border:1px solid rgba(255,60,0,0.2);   }
    .ctos-ib-type-badge.info    { background:rgba(0,255,157,0.08); color:#00ff9d; border:1px solid rgba(0,255,157,0.18); }

    .ctos-ib-title-text {
      font-family: 'Orbitron', sans-serif;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .1em;
      color: rgba(255,255,255,0.85);
      flex: 1;
    }
    .ctos-ib-time {
      font-family: 'Share Tech Mono', monospace;
      font-size: 8px;
      color: rgba(255,255,255,0.15);
      flex-shrink: 0;
    }
    .ctos-ib-body {
      font-family: 'Share Tech Mono', monospace;
      font-size: 10px;
      color: rgba(255,255,255,0.4);
      line-height: 1.45;
      margin-left: 1px;
    }

    /* Expanded item */
    .ctos-ib-expanded {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(255,255,255,0.06);
      display: none;
    }
    .ctos-inbox-item.expanded .ctos-ib-expanded { display: block; }
    .ctos-ib-full-body {
      font-family: 'Share Tech Mono', monospace;
      font-size: 10px;
      color: rgba(255,255,255,0.55);
      line-height: 1.6;
      white-space: pre-wrap;
    }

    /* ── Home bar ── */
    #ctos-homebar {
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    #ctos-homebar-pill {
      width: 80px; height: 3px;
      background: rgba(255,255,255,0.12);
      border-radius: 2px;
      cursor: pointer;
      transition: background .15s;
    }
    #ctos-homebar-pill:hover { background: rgba(255,255,255,0.25); }

    /* ── Animação de abertura ── */
    @keyframes ctos-boot {
      from { opacity:0; }
      to   { opacity:1; }
    }
  `;

  // ── SVG icons ──────────────────────────────────────────────────────────────
  const SVG = {
    phone: `<svg viewBox="0 0 24 24" fill="none" stroke="#00cfff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.4 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="#00cfff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    empty: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12H16L14 15H10L8 12H2"/><path d="M5.45 5.11L2 12V18A2 2 0 004 20H20A2 2 0 0022 18V12L18.55 5.11A2 2 0 0016.76 4H7.24A2 2 0 005.45 5.11Z"/></svg>`,
  };

  // ── Injetar CSS ────────────────────────────────────────────────────────────
  if (!document.getElementById('__ctos_phone_css')) {
    const st = document.createElement('style');
    st.id = '__ctos_phone_css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function el(tag, id, cls) {
    const e = document.createElement(tag);
    if (id)  e.id = id;
    if (cls) e.className = cls;
    return e;
  }
  function now() {
    const d = new Date();
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  }
  function shortTime() { return now(); }

  // ── Build DOM ──────────────────────────────────────────────────────────────
  function build() {

    // Botão flutuante
    const btn = el('div','ctos-phone-btn');
    btn.innerHTML = SVG.phone + '<div class="ctos-notif-badge" id="ctos-float-badge">0</div>';
    document.body.appendChild(btn);

    // Overlay
    const overlay = el('div','ctos-phone-overlay');
    document.body.appendChild(overlay);

    // Corpo principal
    const phone = el('div','ctos-phone');
    phone.innerHTML = `
      <div id="ctos-phone-shell">
        <div id="ctos-notch">
          <div id="ctos-notch-cam"></div>
          <div id="ctos-notch-dot"></div>
        </div>

        <div id="ctos-statusbar">
          <span class="ctos-time" id="ctos-clock">${now()}</span>
          <span class="ctos-sys">ctOS · v2.4</span>
        </div>

        <div id="ctos-screen">
          <!-- App bar -->
          <div id="ctos-appbar">
            <button class="ctos-tab active" data-tab="chat">
              <span class="ctos-tab-badge" id="ctos-chat-badge"></span>
              ${SVG.chat}
              <span class="ctos-tab-label">Chat</span>
            </button>
            <button class="ctos-tab" data-tab="inbox">
              <span class="ctos-tab-badge" id="ctos-inbox-badge"></span>
              ${SVG.inbox}
              <span class="ctos-tab-label">Mensagens</span>
            </button>
          </div>

          <!-- Chat page -->
          <div class="ctos-page active" id="ctos-page-chat">
            <div id="ctos-chat-header">
              <div class="ctos-ch-title">Canal Geral</div>
              <div class="ctos-ch-sub">ENCRYPTED · CHANNEL_01</div>
              <div id="ctos-online-dots">
                <div class="ctos-online-dot you"></div>
                <span id="ctos-online-label">Apenas você online</span>
              </div>
            </div>
            <div id="ctos-messages">
              <div class="ctos-date-sep">Hoje</div>
            </div>
            <div id="ctos-chat-input-row">
              <textarea id="ctos-chat-input" rows="1" placeholder="Mensagem..."></textarea>
              <button id="ctos-send-btn">${SVG.send}</button>
            </div>
          </div>

          <!-- Inbox page -->
          <div class="ctos-page" id="ctos-page-inbox">
            <div id="ctos-inbox-header">
              <span class="ctos-ib-title">Mensagens</span>
              <button id="ctos-inbox-clear">Limpar</button>
            </div>
            <div id="ctos-inbox-list">
              <div id="ctos-inbox-empty">
                ${SVG.empty}
                <span>Sem mensagens</span>
              </div>
            </div>
          </div>
        </div>

        <div id="ctos-homebar">
          <div id="ctos-homebar-pill"></div>
        </div>
      </div>
    `;
    document.body.appendChild(phone);

    return { btn, overlay, phone };
  }

  const DOM = build();

  // ── Relógio ────────────────────────────────────────────────────────────────
  setInterval(() => {
    const c = document.getElementById('ctos-clock');
    if (c) c.textContent = now();
  }, 10000);

  // ── Estado ────────────────────────────────────────────────────────────────
  let _open = false;
  let _unreadChat  = 0;
  let _unreadInbox = 0;
  let _activeTab   = 'chat';
  const _inboxItems = new Map(); // id → { el, data }

  function updateBadges() {
    const floatBadge = document.getElementById('ctos-float-badge');
    const total = _unreadChat + _unreadInbox;
    if (floatBadge) {
      floatBadge.style.display = total > 0 ? 'flex' : 'none';
      floatBadge.textContent   = total > 9 ? '9+' : total;
    }

    const cb = document.getElementById('ctos-chat-badge');
    if (cb) {
      cb.style.display = _unreadChat > 0 ? 'flex' : 'none';
      cb.textContent   = _unreadChat > 9 ? '9+' : _unreadChat;
    }

    const ib = document.getElementById('ctos-inbox-badge');
    if (ib) {
      ib.style.display = _unreadInbox > 0 ? 'flex' : 'none';
      ib.textContent   = _unreadInbox > 9 ? '9+' : _unreadInbox;
    }
  }

  // ── Abrir / fechar ─────────────────────────────────────────────────────────
  function openPhone() {
    _open = true;
    DOM.phone.classList.add('open');
    DOM.overlay.classList.add('open');
    if (_activeTab === 'chat') {
      _unreadChat = 0;
      updateBadges();
      setTimeout(scrollToBottom, 80);
    }
    if (_activeTab === 'inbox') {
      _unreadInbox = 0;
      updateBadges();
    }
  }
  function closePhone() {
    _open = false;
    DOM.phone.classList.remove('open');
    DOM.overlay.classList.remove('open');
  }

  // ── Tab switch ─────────────────────────────────────────────────────────────
  document.getElementById('ctos-appbar').addEventListener('click', (e) => {
    const tab = e.target.closest('.ctos-tab');
    if (!tab) return;
    const id = tab.dataset.tab;
    _activeTab = id;

    document.querySelectorAll('.ctos-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    document.querySelectorAll('.ctos-page').forEach(p => p.classList.remove('active'));
    document.getElementById(`ctos-page-${id}`)?.classList.add('active');

    if (id === 'chat')  { _unreadChat  = 0; setTimeout(scrollToBottom, 30); }
    if (id === 'inbox') { _unreadInbox = 0; markAllInboxRead(); }
    updateBadges();
  });

  // ── Fechar via overlay / home bar / tecla P ────────────────────────────────
  DOM.overlay.addEventListener('click', closePhone);
  document.getElementById('ctos-homebar-pill')?.addEventListener('click', closePhone);
  DOM.btn.addEventListener('click', () => _open ? closePhone() : openPhone());

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && !e.repeat) {
      e.preventDefault();
      _open ? closePhone() : openPhone();
    }
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  const msgs = document.getElementById('ctos-messages');

  function scrollToBottom() {
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  function appendMessage(from, text, type) {
    const wrap = el('div', null, `ctos-msg ${type}`);
    const fromEl = el('div', null, 'ctos-msg-from');
    fromEl.textContent = type === 'sent' ? 'Você' : from.toUpperCase();
    const bubble = el('div', null, 'ctos-msg-bubble');
    bubble.textContent = text;
    const time = el('div', null, 'ctos-msg-time');
    time.textContent = shortTime();
    wrap.append(fromEl, bubble, time);
    msgs.appendChild(wrap);
    scrollToBottom();
  }

  // Envia mensagem
  function sendMessage() {
    const input = document.getElementById('ctos-chat-input');
    const text  = input.value.trim();
    if (!text) return;
    appendMessage('Você', text, 'sent');
    input.value = '';
    input.style.height = 'auto';
    if (typeof window.Phone?.onSend === 'function') window.Phone.onSend(text);
  }

  document.getElementById('ctos-send-btn')?.addEventListener('click', sendMessage);
  document.getElementById('ctos-chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize do textarea
  document.getElementById('ctos-chat-input')?.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(80, this.scrollHeight) + 'px';
  });

  // Online dots
  let _onlineCount = 1;
  function updateOnlineDots() {
    const wrap = document.getElementById('ctos-online-dots');
    const label = document.getElementById('ctos-online-label');
    if (!wrap || !label) return;
    // Remove dots antigos (exceto o "you")
    Array.from(wrap.querySelectorAll('.ctos-online-dot:not(.you)')).forEach(d => d.remove());
    for (let i = 1; i < Math.min(_onlineCount, 6); i++) {
      const d = el('div', null, 'ctos-online-dot');
      wrap.insertBefore(d, label);
    }
    label.textContent = _onlineCount <= 1
      ? 'Apenas você online'
      : `${_onlineCount} online`;
  }

  // ── Inbox ─────────────────────────────────────────────────────────────────
  function markAllInboxRead() {
    document.querySelectorAll('.ctos-inbox-item.unread').forEach(item => {
      item.classList.remove('unread');
    });
  }

  function renderInboxEmpty() {
    const empty = document.getElementById('ctos-inbox-empty');
    if (!empty) return;
    empty.style.display = _inboxItems.size === 0 ? 'flex' : 'none';
  }

  function pushInboxItem(data) {
    const { id, title, body, type = 'info', time } = data;
    const list = document.getElementById('ctos-inbox-list');
    if (!list) return;

    // Remove item existente com mesmo id (atualização)
    if (_inboxItems.has(id)) {
      _inboxItems.get(id).el.remove();
    }

    const item = el('div', null, 'ctos-inbox-item unread');
    item.innerHTML = `
      <div class="ctos-ib-row1">
        <span class="ctos-ib-type-badge ${type}">${type}</span>
        <span class="ctos-ib-title-text">${title}</span>
        <span class="ctos-ib-time">${time || shortTime()}</span>
      </div>
      <div class="ctos-ib-body">${body.length > 60 ? body.substring(0,60) + '…' : body}</div>
      <div class="ctos-ib-expanded">
        <div class="ctos-ib-full-body">${body}</div>
      </div>
    `;

    // Toggle expand ao clicar
    item.addEventListener('click', () => {
      item.classList.toggle('expanded');
      item.classList.remove('unread');
    });

    list.insertBefore(item, list.firstChild);
    _inboxItems.set(id, { el: item, data });

    if (document.getElementById('ctos-inbox-empty')) {
      document.getElementById('ctos-inbox-empty').style.display = 'none';
    }

    // Incrementa badge se inbox não está visível
    if (!_open || _activeTab !== 'inbox') {
      _unreadInbox++;
      updateBadges();
    }
  }

  document.getElementById('ctos-inbox-clear')?.addEventListener('click', () => {
    _inboxItems.forEach(({ el }) => el.remove());
    _inboxItems.clear();
    _unreadInbox = 0;
    updateBadges();
    renderInboxEmpty();
  });

  // ── API pública ───────────────────────────────────────────────────────────
  window.Phone = {

    onSend: null, // hook: fn(text) → integrar ao SocketManager

    toggle() { _open ? closePhone() : openPhone(); },
    open()   { openPhone(); },
    close()  { closePhone(); },

    // Atualiza quantos jogadores estão online (dots no header do chat)
    setOnline(count) {
      _onlineCount = count;
      updateOnlineDots();
    },

    chat: {
      // Mensagem recebida de outro jogador
      receive(from, text) {
        appendMessage(from, text, 'recv');
        if (!_open || _activeTab !== 'chat') {
          _unreadChat++;
          updateBadges();
        }
      },
      // Mensagem local (quando enviada via código, não pelo input)
      send(text) {
        appendMessage('Você', text, 'sent');
      },
    },

    inbox: {
      // Push de nova mensagem/missão
      push(data) {
        pushInboxItem(data);
      },
      // Marca item como concluído (ex: missão completa)
      complete(id) {
        const entry = _inboxItems.get(id);
        if (!entry) return;
        entry.el.classList.add('done');
        entry.el.classList.remove('unread');
      },
      // Remove item específico
      remove(id) {
        const entry = _inboxItems.get(id);
        if (!entry) return;
        entry.el.remove();
        _inboxItems.delete(id);
        renderInboxEmpty();
      },
      // Limpa tudo
      clear() {
        _inboxItems.forEach(({ el }) => el.remove());
        _inboxItems.clear();
        _unreadInbox = 0;
        updateBadges();
        renderInboxEmpty();
      },
    },
  };

})();