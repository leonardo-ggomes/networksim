/**
 * phone.js — ctOS Mobile Device
 *
 * API pública (window.Phone):
 *   Phone.setSocket(socketInstance)           — conecta ao Socket.IO para chat em rede
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

  // ── Socket.IO — referência injetada via Phone.setSocket() ─────────────────
  let _socket = null;
  let _playerName = 'Você'; // nome local — atualizado via Phone.setPlayerName(name)

  // ── Estilos ────────────────────────────────────────────────────────────────
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Orbitron:wght@400;700;900&display=swap');

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
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: rgba(255,255,255,0.5);
      letter-spacing: .1em;
    }
    #ctos-statusbar .ctos-sys {
      font-family: 'JetBrains Mono', monospace;
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


    /* ──────── BROWSER PAGE ──────── */
    #ctos-browser-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 10px;
      border-bottom: 1px solid rgba(0,207,255,0.08);
      flex-shrink: 0;
    }
    #ctos-browser-url {
      flex: 1;
      background: rgba(0,207,255,0.05);
      border: 1px solid rgba(0,207,255,0.15);
      border-radius: 6px;
      padding: 4px 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      color: rgba(255,255,255,0.7);
      outline: none;
      letter-spacing: .05em;
    }
    #ctos-browser-url:focus { border-color: rgba(0,207,255,0.45); }
    #ctos-browser-go {
      background: rgba(0,207,255,0.12);
      border: 1px solid rgba(0,207,255,0.25);
      border-radius: 5px;
      color: #00cfff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      padding: 4px 9px;
      cursor: pointer;
      letter-spacing: .08em;
    }
    #ctos-browser-go:hover { background: rgba(0,207,255,0.22); }
    #ctos-browser-status {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      letter-spacing: .12em;
      padding: 3px 10px;
      flex-shrink: 0;
    }
    #ctos-browser-status.ok  { color: #00ff88; }
    #ctos-browser-status.err { color: #ff4444; }
    #ctos-browser-frame {
      flex: 1;
      min-height: 0;
      width: 100%;
      background: #fff;
      border: none;
      display: block;
    }
    #ctos-browser-splash {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 20px;
    }
    #ctos-browser-splash .ctos-br-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      color: rgba(0,207,255,0.6);
      letter-spacing: .2em;
    }
    #ctos-browser-splash .ctos-br-hint {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      color: rgba(255,255,255,0.2);
      letter-spacing: .08em;
      text-align: center;
      line-height: 1.8;
    }
    #ctos-browser-splash .ctos-br-steps {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      color: rgba(0,207,255,0.35);
      border: 1px solid rgba(0,207,255,0.1);
      border-radius: 6px;
      padding: 10px 14px;
      line-height: 2;
      margin-top: 4px;
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
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      letter-spacing: .12em;
      color: rgba(0,207,255,0.5);
      margin-bottom: 2px;
      text-transform: uppercase;
    }
    .ctos-msg.sent .ctos-msg-from { color: rgba(240,185,11,0.5); }

    .ctos-msg-bubble {
      padding: 7px 11px;
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
      font-size: 7px;
      color: rgba(255,255,255,0.15);
      margin-top: 2px;
      letter-spacing: .08em;
    }

    /* Separador de data */
    .ctos-date-sep {
      align-self: center;
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      color: rgba(255,255,255,0.15);
      flex-shrink: 0;
    }
    .ctos-ib-body {
      font-family: 'JetBrains Mono', monospace;
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
      font-family: 'JetBrains Mono', monospace;
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


    /* ──────── SHOP PAGE ──────── */
    #ctos-shop-header {
      padding: 10px 16px 8px;
      border-bottom: 1px solid rgba(0,207,255,0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    #ctos-shop-header .ctos-sh-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .18em;
      color: #00cfff;
      text-transform: uppercase;
    }
    #ctos-shop-balance {
      display: flex;
      align-items: center;
      gap: 5px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #f0b90b;
      text-shadow: 0 0 8px rgba(240,185,11,0.4);
    }
    #ctos-shop-balance svg { width: 14px; height: 14px; flex-shrink: 0; }

    #ctos-shop-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      scrollbar-width: thin;
      scrollbar-color: rgba(0,207,255,0.1) transparent;
    }
    #ctos-shop-list::-webkit-scrollbar { width: 3px; }
    #ctos-shop-list::-webkit-scrollbar-thumb { background: rgba(0,207,255,0.15); }

    .ctos-shop-card {
      background: rgba(0,207,255,0.04);
      border: 1px solid rgba(0,207,255,0.12);
      border-radius: 4px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: ctos-msg-in .2s cubic-bezier(0.2,0,0.4,1) both;
      position: relative;
      overflow: hidden;
      transition: border-color .2s, background .2s;
    }
    .ctos-shop-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0;
      width: 3px; height: 100%;
    }
    .ctos-shop-card.energy  { border-left: none; }
    .ctos-shop-card.energy::before  { background: linear-gradient(180deg, #00cfff, #0066ff); }
    .ctos-shop-card.health  { border-left: none; }
    .ctos-shop-card.health::before  { background: linear-gradient(180deg, #00ff9d, #00cc7a); }
    .ctos-shop-card.drone   { border-left: none; }
    .ctos-shop-card.drone::before   { background: linear-gradient(180deg, #a78bfa, #7c3aed); }
    .ctos-shop-card.ammo    { border-left: none; }
    .ctos-shop-card.ammo::before    { background: linear-gradient(180deg, #ff3c00, #ff6b00); }

    .ctos-shop-card:hover:not(.disabled) {
      border-color: rgba(0,207,255,0.3);
      background: rgba(0,207,255,0.07);
    }
    .ctos-shop-card.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .ctos-shop-icon {
      width: 36px; height: 36px;
      border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      font-size: 18px;
    }
    .ctos-shop-card.energy .ctos-shop-icon  { background: rgba(0,207,255,0.08); }
    .ctos-shop-card.health .ctos-shop-icon  { background: rgba(0,255,157,0.08); }
    .ctos-shop-card.drone  .ctos-shop-icon  { background: rgba(167,139,250,0.08); }
    .ctos-shop-card.ammo   .ctos-shop-icon  { background: rgba(255,60,0,0.08); }

    .ctos-shop-info { flex: 1; min-width: 0; }
    .ctos-shop-name {
      font-family: 'Orbitron', sans-serif;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .12em;
      color: rgba(255,255,255,0.9);
      margin-bottom: 2px;
      text-transform: uppercase;
    }
    .ctos-shop-desc {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      color: rgba(255,255,255,0.3);
      line-height: 1.4;
    }
    .ctos-shop-stat {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
    }
    .ctos-shop-stat-bar {
      flex: 1;
      height: 2px;
      background: rgba(255,255,255,0.06);
      border-radius: 1px;
      overflow: hidden;
      max-width: 80px;
    }
    .ctos-shop-stat-fill {
      height: 100%;
      border-radius: 1px;
      transition: width .4s ease;
    }
    .ctos-shop-card.energy .ctos-shop-stat-fill { background: #00cfff; }
    .ctos-shop-card.health .ctos-shop-stat-fill { background: #00ff9d; }
    .ctos-shop-card.drone  .ctos-shop-stat-fill { background: #a78bfa; }
    .ctos-shop-stat-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      color: rgba(255,255,255,0.25);
      flex-shrink: 0;
    }

    .ctos-shop-buy {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      flex-shrink: 0;
    }
    .ctos-shop-price {
      font-family: 'Orbitron', sans-serif;
      font-size: 10px;
      font-weight: 700;
      color: #f0b90b;
      letter-spacing: .06em;
    }
    .ctos-shop-price span {
      font-size: 7px;
      color: rgba(240,185,11,0.5);
      margin-right: 1px;
    }
    .ctos-shop-btn {
      padding: 4px 10px;
      background: rgba(0,207,255,0.1);
      border: 1px solid rgba(0,207,255,0.3);
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      letter-spacing: .1em;
      color: #00cfff;
      cursor: pointer;
      text-transform: uppercase;
      transition: background .15s, box-shadow .15s, transform .1s;
      pointer-events: all;
      white-space: nowrap;
    }
    .ctos-shop-btn:hover:not(:disabled) {
      background: rgba(0,207,255,0.2);
      box-shadow: 0 0 10px rgba(0,207,255,0.2);
    }
    .ctos-shop-btn:active:not(:disabled) { transform: scale(0.95); }
    .ctos-shop-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .ctos-shop-btn.drone-on {
      border-color: rgba(167,139,250,0.5);
      color: #a78bfa;
      background: rgba(167,139,250,0.12);
    }
    .ctos-shop-btn.drone-on:hover {
      background: rgba(167,139,250,0.22);
      box-shadow: 0 0 10px rgba(167,139,250,0.2);
    }

    /* Flash de feedback ao comprar */
    @keyframes ctos-shop-flash {
      0%   { opacity: 0.8; transform: scale(1.02); }
      100% { opacity: 1;   transform: scale(1); }
    }
    .ctos-shop-card.bought {
      animation: ctos-shop-flash .3s ease both;
    }

    /* Seção de título de categoria */
    .ctos-shop-section {
      font-family: 'JetBrains Mono', monospace;
      font-size: 7px;
      letter-spacing: .25em;
      color: rgba(255,255,255,0.12);
      text-transform: uppercase;
      padding: 2px 0 4px;
    }

    /* ── Animação de abertura ── */
    @keyframes ctos-boot {
      from { opacity:0; }
      to   { opacity:1; }
    }

    /* ══════════════════════════════════════════════════════════════════════
       CONQUISTAS — design minimalista ctOS
    ══════════════════════════════════════════════════════════════════════ */

    #ctos-page-badges {
      flex-direction: column;
      overflow-y: auto;
      padding: 0;
      gap: 0;
      background: #04080f;
    }

    /* Cabeçalho da página */
    .bdg-header {
      padding: 16px 16px 10px;
      border-bottom: 1px solid rgba(0,207,255,0.07);
      flex-shrink: 0;
    }
    .bdg-header-title {
      font-family: 'Orbitron', monospace;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.22em;
      color: rgba(0,207,255,0.9);
      text-transform: uppercase;
    }
    .bdg-header-sub {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      color: rgba(255,255,255,0.25);
      margin-top: 3px;
      letter-spacing: 0.05em;
    }
    /* Barra de progresso geral */
    .bdg-progress-bar {
      margin-top: 10px;
      height: 2px;
      background: rgba(255,255,255,0.07);
      border-radius: 2px;
      overflow: hidden;
    }
    .bdg-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #00cfff, #a78bfa);
      border-radius: 2px;
      transition: width .6s cubic-bezier(.4,0,.2,1);
    }
    .bdg-progress-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      color: rgba(255,255,255,0.3);
      margin-top: 4px;
      letter-spacing: 0.08em;
    }

    /* Seção de fase */
    .bdg-phase {
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .bdg-phase-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px 8px;
    }
    .bdg-phase-line {
      flex: 1;
      height: 1px;
      background: rgba(255,255,255,0.06);
    }
    .bdg-phase-label {
      font-family: 'Orbitron', monospace;
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      white-space: nowrap;
      color: var(--phase-color, rgba(255,255,255,0.25));
    }
    .bdg-phase-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--phase-color, rgba(255,255,255,0.2));
      flex-shrink: 0;
    }

    /* Grid de badges */
    .bdg-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      background: rgba(255,255,255,0.04);
      margin: 0 0 1px;
    }

    /* Card de badge individual */
    .bdg-card {
      background: #04080f;
      padding: 14px 8px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 7px;
      position: relative;
      overflow: hidden;
      transition: background .2s;
    }
    .bdg-card.locked {
      opacity: 1; /* não esmaece o card, só o conteúdo */
    }
    .bdg-card.unlocked {
      background: rgba(255,255,255,0.015);
    }
    .bdg-card.unlocked::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--badge-glow, #00cfff), transparent);
      opacity: 0.6;
    }
    .bdg-card.new-unlock {
      animation: bdg-pop .55s cubic-bezier(.17,.89,.32,1.27) both;
    }
    @keyframes bdg-pop {
      0%   { transform: scale(0.5); opacity: 0; }
      65%  { transform: scale(1.08); }
      100% { transform: scale(1); opacity: 1; }
    }

    /* Ícone hexagonal */
    .bdg-hex {
      width: 42px;
      height: 42px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .bdg-hex-bg {
      position: absolute;
      inset: 0;
      clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
      background: var(--badge-bg, rgba(255,255,255,0.04));
      transition: background .3s;
    }
    .bdg-card.unlocked .bdg-hex-bg {
      background: var(--badge-bg, rgba(0,207,255,0.08));
      box-shadow: 0 0 12px var(--badge-glow, #00cfff);
    }
    .bdg-hex-border {
      position: absolute;
      inset: 0;
      clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
      background: transparent;
      outline: 1px solid var(--badge-border, rgba(255,255,255,0.08));
    }
    .bdg-icon {
      font-size: 18px;
      position: relative;
      z-index: 1;
      filter: var(--badge-filter, grayscale(1) opacity(0.3));
      transition: filter .3s;
    }
    .bdg-card.unlocked .bdg-icon {
      filter: none;
      text-shadow: 0 0 10px var(--badge-glow, #00cfff);
    }

    /* Texto */
    .bdg-name {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.5px;
      font-weight: 500;
      text-align: center;
      line-height: 1.3;
      letter-spacing: 0.04em;
      color: rgba(255,255,255,0.2);
      transition: color .3s;
    }
    .bdg-card.unlocked .bdg-name {
      color: rgba(255,255,255,0.7);
    }
    .bdg-locked-bar {
      width: 20px;
      height: 1px;
      background: rgba(255,255,255,0.08);
      border-radius: 1px;
    }
    .bdg-card.unlocked .bdg-locked-bar { display: none; }

    /* ── Toast de conquista ───────────────────────────────────────────────── */
    #ctos-badge-toast {
      position: fixed;
      bottom: 88px;
      left: 50%;
      transform: translateX(-50%) translateY(12px);
      background: rgba(4,8,15,0.97);
      border: 1px solid var(--toast-color, #00cfff);
      box-shadow: 0 0 24px var(--toast-glow, rgba(0,207,255,0.25));
      border-radius: 10px;
      padding: 9px 14px;
      display: flex;
      align-items: center;
      gap: 11px;
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      transition: opacity .25s, transform .25s;
      min-width: 200px;
      max-width: 260px;
    }
    #ctos-badge-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    #ctos-badge-toast-icon {
      font-size: 24px;
      flex-shrink: 0;
      filter: drop-shadow(0 0 6px var(--toast-color, #00cfff));
    }
    #ctos-badge-toast-label {
      font-family: 'Orbitron', monospace;
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: var(--toast-color, #00cfff);
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    #ctos-badge-toast-name {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: rgba(255,255,255,0.85);
      font-weight: 500;
    }
    #ctos-badge-toast-desc {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      color: rgba(255,255,255,0.35);
      margin-top: 1px;
    }

    /* ══════════════════════════════════════════════════════════════════════
       SKIN GTA V — classe .gtav no #ctos-phone-shell
    ══════════════════════════════════════════════════════════════════════ */
    #ctos-phone-shell.gtav {
      background: #0a0a0a;
      border: 1.5px solid #f0b90b;
      box-shadow:
        0 0 0 1px rgba(240,185,11,0.15),
        0 0 30px rgba(240,185,11,0.20),
        0 0 60px rgba(240,185,11,0.08),
        inset 0 0 40px rgba(240,185,11,0.03);
    }
    #ctos-phone-shell.gtav #ctos-statusbar {
      background: #0a0a0a;
      border-bottom: 1px solid rgba(240,185,11,0.2);
    }
    #ctos-phone-shell.gtav #ctos-statusbar .ctos-time,
    #ctos-phone-shell.gtav #ctos-statusbar .ctos-sys {
      color: #f0b90b;
    }
    #ctos-phone-shell.gtav #ctos-appbar {
      background: #0d0d0d;
      border-top: 1px solid rgba(240,185,11,0.2);
    }
    #ctos-phone-shell.gtav .ctos-tab.active {
      background: rgba(240,185,11,0.08);
    }
    #ctos-phone-shell.gtav .ctos-tab.active::after {
      background: #f0b90b;
    }
    #ctos-phone-shell.gtav .ctos-tab.active .ctos-tab-label {
      color: #f0b90b;
    }
    #ctos-phone-shell.gtav .ctos-tab svg { stroke: rgba(240,185,11,0.5); }
    #ctos-phone-shell.gtav .ctos-tab.active svg { stroke: #f0b90b; opacity:1; }
    #ctos-phone-shell.gtav #ctos-notch-dot {
      background: #f0b90b;
      box-shadow: 0 0 6px #f0b90b;
    }
    #ctos-phone-shell.gtav #ctos-notch-cam { border-color: rgba(240,185,11,0.3); }
    #ctos-phone-shell.gtav::before {
      background: linear-gradient(to bottom, transparent 0%, rgba(240,185,11,0.03) 50%, transparent 100%);
    }
    #ctos-phone-shell.gtav::after {
      content: '';
      position: absolute;
      inset: 6px;
      border-radius: 18px;
      pointer-events: none;
      border: 1px solid rgba(240,185,11,0.08);
    }
    body.phone-gtav #ctos-phone-btn {
      border-color: rgba(240,185,11,0.5);
      box-shadow: 0 0 14px rgba(240,185,11,0.3);
    }
    body.phone-gtav #ctos-phone-btn svg { stroke: #f0b90b; }

  `;

  // ── SVG icons ──────────────────────────────────────────────────────────────
  const SVG = {
    browser: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <line x1="2" y1="9" x2="22" y2="9"/>
      <circle cx="6" cy="6.5" r="1"/><circle cx="10" cy="6.5" r="1"/>
      <rect x="14" y="5.5" width="6" height="2" rx="1"/>
    </svg>`,
    phone: `<svg viewBox="0 0 24 24" fill="none" stroke="#00cfff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.4 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="#00cfff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    empty: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12H16L14 15H10L8 12H2"/><path d="M5.45 5.11L2 12V18A2 2 0 004 20H20A2 2 0 0022 18V12L18.55 5.11A2 2 0 0016.76 4H7.24A2 2 0 005.45 5.11Z"/></svg>`,
    shop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`,
    coin: `<svg viewBox="0 0 24 24" fill="none" stroke="#f0b90b" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v2m0 8v2M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 3-5 3-5 6.5 0 1.4 1.1 2 2.5 2s2.5-.6 2.5-2"/></svg>`,
    badges: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
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
            <button class="ctos-tab" data-tab="shop">
              ${SVG.shop}
              <span class="ctos-tab-label">Loja</span>
            </button>
            <button class="ctos-tab" data-tab="badges">
              ${SVG.badges}
              <span class="ctos-tab-label">Conquistas</span>
            </button>
            <button class="ctos-tab" data-tab="browser">
              ${SVG.browser}
              <span class="ctos-tab-label">Browser</span>
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

          <!-- Shop page -->
          <div class="ctos-page" id="ctos-page-shop">
            <div id="ctos-shop-header">
              <span class="ctos-sh-title">ctOS Market</span>
              <div id="ctos-shop-balance">
                ${SVG.coin}
                <span id="ctos-shop-balance-val">0</span>
              </div>
            </div>
            <div id="ctos-shop-list">
              <!-- Preenchido por renderShop() -->
            </div>
          </div>

          <!-- Browser page -->
          <div class="ctos-page" id="ctos-page-badges"></div>

          <div class="ctos-page" id="ctos-page-browser">
            <div id="ctos-browser-bar">
              <input id="ctos-browser-url" type="text" placeholder="http://192.168.1.10" spellcheck="false"/>
              <button id="ctos-browser-go">IR</button>
            </div>
            <div id="ctos-browser-status" class="ok" style="display:none"></div>
            <div id="ctos-browser-splash">
              <div class="ctos-br-title">ctOS BROWSER</div>
              <div class="ctos-br-hint">Acesse um servidor HTTP virtual<br>configurado por você ou outro player.</div>
              <div class="ctos-br-steps">
                1. nano index.html "&lt;h1&gt;Meu Site&lt;/h1&gt;"<br>
                2. ip addr add 192.168.1.10/24 dev eth0<br>
                3. apache2 start<br>
                4. curl http://192.168.1.10
              </div>
            </div>
            <iframe id="ctos-browser-frame" style="visibility:hidden;flex:0" sandbox="allow-scripts"></iframe>
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

  // ══════════════════════════════════════════════════════════════════════════
  // SISTEMA DE BADGES / CONQUISTAS
  // ══════════════════════════════════════════════════════════════════════════

  const BADGE_DEFS = [
    // fase 1 — Fundamentos do Sistema
    { id:'boot',      phase:1, icon:'🟢', label:'Boot',       glow:'#00ff9d', desc:'Primeiro terminal ligado'        },
    { id:'navigator', phase:1, icon:'📂', label:'Navigator',  glow:'#00ff9d', desc:'Navegou pelo sistema de arquivos' },
    { id:'archivist', phase:1, icon:'📄', label:'Archivist',  glow:'#00ff9d', desc:'Leu o briefing secreto'           },

    // fase 2 — Controle do Sistema
    { id:'scribe',    phase:2, icon:'✏️', label:'Scribe',     glow:'#00cfff', desc:'Criou o diário de bordo'          },
    { id:'organizer', phase:2, icon:'📁', label:'Organizer',  glow:'#00cfff', desc:'Organizou diretórios'             },
    { id:'cleaner',   phase:2, icon:'🛡️', label:'Cleaner',   glow:'#00cfff', desc:'Eliminou o malware'               },

    // fase 3 — Redes & Código C
    { id:'recon',     phase:3, icon:'🌐', label:'Recon',      glow:'#a78bfa', desc:'Reconheceu a rede'                },
    { id:'coder',     phase:3, icon:'⚡', label:'Coder',      glow:'#a78bfa', desc:'Dominou C básico'                 },
    { id:'recursion', phase:3, icon:'🔁', label:'Recursion',  glow:'#a78bfa', desc:'Implementou Fibonacci em C'       },

    // fase 4 — Elite (desbloqueia skin GTA V)
    { id:'js-master', phase:4, icon:'🟡', label:'JS Master',  glow:'#f0b90b', desc:'Dominou JavaScript'               },
    { id:'hacker',    phase:4, icon:'💀', label:'Hacker',     glow:'#f0b90b', desc:'Completou todas as missões JS'    },
    { id:'elite',     phase:4, icon:'🏆', label:'Elite',      glow:'#f0b90b', desc:'Hacker Full-Stack — todas missões'},
  ];

  const PHASE_LABELS = {
    1: 'FASE 1 — FUNDAMENTOS',
    2: 'FASE 2 — CONTROLE',
    3: 'FASE 3 — REDE & C',
    4: 'FASE 4 — ELITE',
  };

  // Set de badges desbloqueados (persiste apenas em memória — reset ao recarregar)
  const _unlockedBadges = new Set();

  function renderBadges() {
    const page = document.getElementById('ctos-page-badges');
    if (!page) return;
    page.innerHTML = '';

    const total    = BADGE_DEFS.length;
    const unlocked = BADGE_DEFS.filter(b => _unlockedBadges.has(b.id)).length;
    const pct      = total > 0 ? Math.round((unlocked / total) * 100) : 0;

    // ── Cabeçalho com progresso geral ──────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'bdg-header';
    header.innerHTML = `
      <div class="bdg-header-title">Conquistas</div>
      <div class="bdg-header-sub">${unlocked} / ${total} desbloqueadas</div>
      <div class="bdg-progress-bar">
        <div class="bdg-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="bdg-progress-label">${pct}% completo</div>
    `;
    page.appendChild(header);

    // ── Agrupa por fase ────────────────────────────────────────────────────
    const phases = {};
    BADGE_DEFS.forEach(b => {
      if (!phases[b.phase]) phases[b.phase] = [];
      phases[b.phase].push(b);
    });

    // Cor por fase
    const phaseColors = { 1:'#00ff9d', 2:'#00cfff', 3:'#a78bfa', 4:'#f0b90b' };

    Object.entries(phases).forEach(([phase, badges]) => {
      const color = phaseColors[phase] || '#00cfff';

      const section = document.createElement('div');
      section.className = 'bdg-phase';

      // Separador de fase com label
      const phaseHeader = document.createElement('div');
      phaseHeader.className = 'bdg-phase-header';
      phaseHeader.style.setProperty('--phase-color', color);
      phaseHeader.innerHTML = `
        <div class="bdg-phase-dot"></div>
        <div class="bdg-phase-label">${PHASE_LABELS[phase] || 'FASE ' + phase}</div>
        <div class="bdg-phase-line"></div>
      `;
      section.appendChild(phaseHeader);

      // Grid 3 colunas
      const grid = document.createElement('div');
      grid.className = 'bdg-grid';

      badges.forEach(b => {
        const isUnlocked = _unlockedBadges.has(b.id);
        const card = document.createElement('div');
        card.className = 'bdg-card' + (isUnlocked ? ' unlocked' : ' locked');
        card.title = isUnlocked ? b.desc : 'Bloqueado';
        if (isUnlocked) {
          card.style.setProperty('--badge-glow',   b.glow);
          card.style.setProperty('--badge-bg',     b.glow + '14');
          card.style.setProperty('--badge-border', b.glow + '40');
          card.style.setProperty('--badge-filter', 'none');
        }

        card.innerHTML = `
          <div class="bdg-hex">
            <div class="bdg-hex-bg"></div>
            <div class="bdg-icon">${isUnlocked ? b.icon : '○'}</div>
          </div>
          <div class="bdg-name">${isUnlocked ? b.label : '—'}</div>
          <div class="bdg-locked-bar"></div>
        `;
        grid.appendChild(card);
      });

      section.appendChild(grid);
      page.appendChild(section);
    });
  }

  function unlockBadge(id) {
    if (_unlockedBadges.has(id)) return; // já desbloqueado
    _unlockedBadges.add(id);

    const def = BADGE_DEFS.find(b => b.id === id);
    if (!def) return;

    // Re-renderiza a aba se estiver aberta
    if (_activeTab === 'badges') renderBadges();

    // Aplica animação pop no card recém-desbloqueado
    setTimeout(() => {
      const page = document.getElementById('ctos-page-badges');
      if (!page) return;
      page.querySelectorAll('.bdg-card.unlocked').forEach(el => {
        if (el.querySelector('.bdg-name')?.textContent === def.label) {
          el.classList.add('new-unlock');
          setTimeout(() => el.classList.remove('new-unlock'), 600);
        }
      });
    }, 50);

    // Skin GTA V — ativa quando fase 4 começa (badge js-master)
    if (def.phase === 4) {
      const shell = document.getElementById('ctos-phone-shell');
      if (shell && !shell.classList.contains('gtav')) {
        shell.classList.add('gtav');
        document.body.classList.add('phone-gtav');
      }
    }

    // Toast de notificação
    showBadgeToast(def);
  }

  let _toastTimer = null;
  function showBadgeToast(def) {
    let toast = document.getElementById('ctos-badge-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ctos-badge-toast';
      toast.innerHTML = `
        <div id="ctos-badge-toast-icon"></div>
        <div>
          <div id="ctos-badge-toast-label">CONQUISTA DESBLOQUEADA</div>
          <div id="ctos-badge-toast-name"></div>
          <div id="ctos-badge-toast-desc"></div>
        </div>`;
      document.body.appendChild(toast);
    }
    toast.style.setProperty('--toast-color', def.glow);
    toast.style.setProperty('--toast-glow',  def.glow + '40');
    document.getElementById('ctos-badge-toast-icon').textContent = def.icon;
    document.getElementById('ctos-badge-toast-name').textContent = def.label;
    document.getElementById('ctos-badge-toast-desc').textContent = def.desc;
    toast.classList.add('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

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
    if (_activeTab === 'shop') {
      renderShop();
    }
    if (_activeTab === 'browser') {
      // nada a limpar
    }
    if (_activeTab === 'badges') { renderBadges(); }
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
    if (id === 'shop')  { renderShop(); }
    if (id === 'browser') { /* browser já gerencia estado interno */ }
    if (id === 'badges')  { renderBadges(); }
    updateBadges();
  });

  // ── Fechar via overlay / home bar / tecla P ────────────────────────────────
  DOM.overlay.addEventListener('click', closePhone);
  document.getElementById('ctos-homebar-pill')?.addEventListener('click', closePhone);
  DOM.btn.addEventListener('click', () => _open ? closePhone() : openPhone());

  // Retorna true se o foco está em input/textarea — bloqueia atalhos do jogo.
  function isTyping() {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && !e.repeat && !isTyping()) {
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
    appendMessage(_playerName, text, 'sent');
    input.value = '';
    input.style.height = 'auto';
    // Emite via Socket.IO se conectado
    if (_socket?.connected) {
      _socket.emit('chat:message', { text });
    }
    // Hook legado (compatibilidade)
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


  // ── SHOP ──────────────────────────────────────────────────────────────────

  // Catálogo de itens
  const SHOP_ITEMS = [
    {
      id: 'energy_sm',
      category: 'Vitais',
      type: 'energy',
      icon: '🔋',
      name: 'Recarga Parcial',
      desc: '+35% energia no dispositivo',
      price: 150,
      stat: 'energy',
      statGain: 35,
      action(info) {
        if (info.energy >= 100) return { ok: false, msg: 'Energia já está cheia.' };
        info.energy = Math.min(100, info.energy + 35);
        // Garante que o terminal volte a funcionar se estava bloqueado
        if (info.energy > 0) info.hasTerminal = true;
        return { ok: true, msg: '🔋 +35% energia restaurada.' };
      }
    },
    {
      id: 'energy_lg',
      category: 'Vitais',
      type: 'energy',
      icon: '⚡',
      name: 'Carga Completa',
      desc: 'Restaura 100% da bateria',
      price: 350,
      stat: 'energy',
      statGain: 100,
      action(info) {
        if (info.energy >= 100) return { ok: false, msg: 'Energia já está cheia.' };
        info.energy = 100;
        info.hasTerminal = true;
        return { ok: true, msg: '⚡ Bateria carregada ao máximo!' };
      }
    },
    {
      id: 'health_sm',
      category: 'Vitais',
      type: 'health',
      icon: '💊',
      name: 'Kit Básico',
      desc: '+30% de vida recuperada',
      price: 120,
      stat: 'health',
      statGain: 30,
      action(info) {
        if (info.health >= 100) return { ok: false, msg: 'Vida já está cheia.' };
        info.health = Math.min(100, info.health + 30);
        return { ok: true, msg: '💊 +30% vida restaurada.' };
      }
    },
    {
      id: 'health_lg',
      category: 'Vitais',
      type: 'health',
      icon: '❤️',
      name: 'Med-Pack Avançado',
      desc: 'Restaura 100% da vida',
      price: 300,
      stat: 'health',
      statGain: 100,
      action(info) {
        if (info.health >= 100) return { ok: false, msg: 'Vida já está cheia.' };
        info.health = 100;
        return { ok: true, msg: '❤️ Vida totalmente restaurada!' };
      }
    },
    {
      id: 'drone_toggle',
      category: 'Equipamentos',
      type: 'drone',
      icon: '🚁',
      name: 'Drone Holofote',
      desc: 'Liga / desliga o drone de vigilância',
      price: 0, // gratuito — apenas toggle
      stat: null,
      statGain: 0,
      action(_info) {
        const pc = window.PlayerController?.instance
          ?? (window).__playerController;
        if (!pc) return { ok: false, msg: 'PlayerController não encontrado.' };
        const pm = pc.playerModel;
        if (!pm) return { ok: false, msg: 'PlayerModel não encontrado.' };
        const next = !pm.IsDroneActive;
        pm.toggleDrone(next);
        // Força emissão de posição com novo estado do drone
        pc.lastEmitTime = 0;
        return { ok: true, msg: next ? '🚁 Drone ativado!' : '🚁 Drone desativado.' };
      }
    },
  ];

  // ── helpers de acesso ao infoPlayer ───────────────────────────────────────
  function getInfo() {
    return window.infoPlayer ?? window.__infoPlayer ?? null;
  }
  function getMoney() {
    const info = getInfo();
    return info ? (info.money ?? 0) : 0;
  }
  function getStat(key) {
    const info = getInfo();
    return info ? Math.round(info[key] ?? 0) : 0;
  }

  // ── Renderiza a loja ───────────────────────────────────────────────────────
  // Referências vivas dos elementos por item.id — criados UMA vez em buildShop()
  // e atualizados em-place por renderShop(). Nunca destrói o DOM na hot path.
  const _shopRefs = {}; // { [item.id]: { card, fill, statLbl, droneLbl, btn } }
  let   _shopBuilt = false;

  // Constrói o DOM da loja UMA única vez
  function buildShop() {
    const list = document.getElementById('ctos-shop-list');
    if (!list) return;
    list.innerHTML = '';
    _shopBuilt = true;

    const cats = {};
    SHOP_ITEMS.forEach(item => {
      if (!cats[item.category]) cats[item.category] = [];
      cats[item.category].push(item);
    });

    Object.entries(cats).forEach(([cat, items]) => {
      const sec = document.createElement('div');
      sec.className = 'ctos-shop-section';
      sec.textContent = cat;
      list.appendChild(sec);

      items.forEach(item => {
        const isDrone = item.id === 'drone_toggle';
        const card = document.createElement('div');
        card.className = 'ctos-shop-card ' + item.type;

        // Ícone
        const iconEl = document.createElement('div');
        iconEl.className = 'ctos-shop-icon';
        iconEl.textContent = item.icon;
        card.appendChild(iconEl);

        // Info
        const infoEl = document.createElement('div');
        infoEl.className = 'ctos-shop-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'ctos-shop-name';
        nameEl.textContent = item.name;
        infoEl.appendChild(nameEl);

        const descEl = document.createElement('div');
        descEl.className = 'ctos-shop-desc';
        descEl.textContent = item.desc;
        infoEl.appendChild(descEl);

        // Barra de stat (referência guardada para update em-place)
        let fill = null, statLbl = null;
        if (item.stat) {
          const statRow = document.createElement('div');
          statRow.className = 'ctos-shop-stat';
          const bar = document.createElement('div');
          bar.className = 'ctos-shop-stat-bar';
          fill = document.createElement('div');
          fill.className = 'ctos-shop-stat-fill';
          bar.appendChild(fill);
          statLbl = document.createElement('span');
          statLbl.className = 'ctos-shop-stat-label';
          statRow.appendChild(bar);
          statRow.appendChild(statLbl);
          infoEl.appendChild(statRow);
        }

        // Label de estado do drone (referência guardada)
        let droneLbl = null;
        if (isDrone) {
          droneLbl = document.createElement('div');
          droneLbl.className = 'ctos-shop-desc';
          droneLbl.style.marginTop = '3px';
          infoEl.appendChild(droneLbl);
        }

        card.appendChild(infoEl);

        // Botão + preço
        const buyCol = document.createElement('div');
        buyCol.className = 'ctos-shop-buy';

        const priceEl = document.createElement('div');
        priceEl.className = 'ctos-shop-price';
        if (item.price === 0) {
          priceEl.textContent = 'GRÁTIS';
          priceEl.style.color = 'rgba(255,255,255,0.3)';
          priceEl.style.fontSize = '8px';
        } else {
          priceEl.innerHTML = '<span>₢</span>' + item.price.toLocaleString('pt-BR');
        }
        buyCol.appendChild(priceEl);

        const btn = document.createElement('button');
        btn.className = 'ctos-shop-btn';
        btn.textContent = isDrone ? 'Ligar' : (item.price === 0 ? 'Usar' : 'Comprar');
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          executePurchase(item, card, btn);
        });
        buyCol.appendChild(btn);
        card.appendChild(buyCol);

        list.appendChild(card);

        // Guarda referências vivas para update em-place
        _shopRefs[item.id] = { card, fill, statLbl, droneLbl, btn };
      });
    });
  }

  // Atualiza apenas os valores dinâmicos — sem tocar no DOM estrutural
  function renderShop() {
    if (!_shopBuilt) buildShop();

    const balEl = document.getElementById('ctos-shop-balance-val');
    const money = getMoney();
    if (balEl) balEl.textContent = money.toLocaleString('pt-BR');

    SHOP_ITEMS.forEach(item => {
      const refs = _shopRefs[item.id];
      if (!refs) return;
      const { card, fill, statLbl, droneLbl, btn } = refs;
      const isDrone    = item.id === 'drone_toggle';
      const canAfford  = item.price === 0 || money >= item.price;

      // Card: disabled visual
      card.classList.toggle('disabled', !canAfford);

      // Barra de stat
      if (fill && statLbl && item.stat) {
        const cur = getStat(item.stat);
        fill.style.width   = cur + '%';
        statLbl.textContent = cur + '%';
      }

      // Drone: estado ON/OFF
      if (isDrone && droneLbl) {
        const pc  = window.PlayerController?.instance ?? window.__playerController;
        const isOn = pc?.playerModel?.IsDroneActive ?? false;
        droneLbl.textContent = 'Status: ' + (isOn ? '🟢 ATIVO' : '⚫ INATIVO');
        btn.textContent = isOn ? 'Desligar' : 'Ligar';
        btn.classList.toggle('drone-on', isOn);
      }

      btn.disabled = !canAfford;
    });
  }

  function executePurchase(item, card, btn) {
    const info = getInfo();
    if (!info) {
      window.Phone?.chat.receive('ctOS', '⚠ Sistema de vitais não disponível.');
      return;
    }

    const money = getMoney();
    if (item.price > 0 && money < item.price) {
      window.Phone?.chat.receive('ctOS', '⚠ Créditos insuficientes!');
      return;
    }

    const result = item.action(info);

    if (result.ok) {
      if (item.price > 0) info.money = money - item.price;

      // Feedback visual na card — só animação, sem reconstruir DOM
      card.classList.remove('bought');
      void card.offsetWidth;
      card.classList.add('bought');

      window.Phone?.chat.receive('ctOS', result.msg);

      // Atualiza em-place após a compra (sem flash)
      setTimeout(renderShop, 150);

    } else {
      // Falha (ex: já está cheio)
      window.Phone?.chat.receive('ctOS', '⚠ ' + result.msg);
      btn.style.borderColor = 'rgba(255,60,0,0.5)';
      btn.style.color = '#ff3c00';
      setTimeout(() => {
        btn.style.borderColor = '';
        btn.style.color = '';
      }, 800);
    }
  }


  // ── API pública ───────────────────────────────────────────────────────────

  // ── Browser — lógica interna ──────────────────────────────────────────────
  (function() {
    const urlInput  = document.getElementById('ctos-browser-url');
    const goBtn     = document.getElementById('ctos-browser-go');
    const statusEl  = document.getElementById('ctos-browser-status');
    const frame     = document.getElementById('ctos-browser-frame');
    const splash    = document.getElementById('ctos-browser-splash');

    function loadContent(html, statusCode, from) {
      splash.style.display = 'none';
      frame.style.visibility = 'visible';
      frame.style.flex = '1';
      statusEl.style.display = 'block';
      statusEl.className = statusCode === 200 ? 'ok' : 'err';
      statusEl.textContent = `HTTP ${statusCode}  ·  ${from || ''}`;
      // Força reset do srcdoc para garantir re-render mesmo com mesmo conteúdo
      frame.removeAttribute('srcdoc');
      requestAnimationFrame(() => { frame.srcdoc = html; });
    }

    function goToUrl() {
      const url = urlInput.value.trim();
      if (!url) return;
      // Delega ao motor de rede via evento — Actions.ts ouve
      const ev = new CustomEvent('browser:navigate', { detail: { url } });
      document.dispatchEvent(ev);
    }

    goBtn.addEventListener('click', goToUrl);
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.stopPropagation(); goToUrl(); }
      e.stopPropagation(); // evita ativar atalhos do jogo
    });
    urlInput.addEventListener('click', (e) => e.stopPropagation());

    // API pública para receber conteúdo (chamada por Actions.ts / socket)
  })();

  window.Phone = {

    onSend: null, // hook legado

    // ── Browser — abre site no iframe do Phone ────────────────────────────
    browser: {
      load(html, statusCode, from) {
        // Abre o Phone e muda para aba browser ANTES de escrever o srcdoc.
        // Se o iframe estiver em display:none quando srcdoc é atribuído,
        // alguns navegadores não renderizam o conteúdo.
        if (!_open) openPhone();
        const tab = document.querySelector('.ctos-tab[data-tab="browser"]');
        if (tab) tab.click();
        // Tick para garantir que o frame está visível antes do srcdoc
        const frame   = document.getElementById('ctos-browser-frame');
        const splash  = document.getElementById('ctos-browser-splash');
        const statusEl = document.getElementById('ctos-browser-status');
        setTimeout(() => {
          if (!frame) return;
          splash.style.display = 'none';
          frame.style.visibility = 'visible';
          frame.style.flex = '1';
          statusEl.style.display = 'block';
          statusEl.className = statusCode === 200 ? 'ok' : 'err';
          statusEl.textContent = `HTTP ${statusCode}  ·  ${from || ''}`;
          frame.removeAttribute('srcdoc');
          requestAnimationFrame(() => { frame.srcdoc = html; });
        }, 30);
      },
      setUrl(url) {
        const urlInput = document.getElementById('ctos-browser-url');
        if (urlInput) urlInput.value = url;
      }
    },

    // Conecta o Phone ao Socket.IO para chat em rede.
    // Deve ser chamado após Phone carregar:  Phone.setSocket(SocketManager.io)
    setPlayerName(name) {
      _playerName = name || 'Você';
    },
    setSocket(socket) {
      _socket = socket;

      // Recebe mensagem de outro jogador
      socket.on('chat:message', ({ from, text }) => {
        window.Phone.chat.receive(from, text);
      });

      // Sincroniza contagem de online com os players da sala
      socket.on('players:loaded', (players) => {
        // +1 para incluir o próprio jogador local
        window.Phone.setOnline(Object.keys(players).length + 1);
      });
      socket.on('joinInRoom', () => {
        _onlineCount++;
        updateOnlineDots();
      });
      socket.on('exitTheRoom', () => {
        _onlineCount = Math.max(1, _onlineCount - 1);
        updateOnlineDots();
      });
    },

    toggle() { _open ? closePhone() : openPhone(); },
    refreshShop() { renderShop(); }, // atualiza manualmente (ex: após money mudar)
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

    // ── Badges / Conquistas ────────────────────────────────────────────────
    badges: {
      /**
       * Desbloqueia um badge pelo id.
       * Chamado pelo MissionManager ao completar missões de fase.
       *
       * IDs disponíveis:
       *   fase 1: 'boot' | 'navigator' | 'archivist'
       *   fase 2: 'scribe' | 'organizer' | 'cleaner'
       *   fase 3: 'recon' | 'coder' | 'recursion'
       *   fase 4: 'js-master' | 'hacker' | 'elite'  ← ativa skin GTA V
       */
      unlock(id) { unlockBadge(id); },

      /** Verifica se um badge está desbloqueado */
      has(id) { return _unlockedBadges.has(id); },

      /** Lista todos os ids desbloqueados */
      list() { return [..._unlockedBadges]; },
    },
  };

})();