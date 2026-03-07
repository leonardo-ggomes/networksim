/**
 * VitalSystem.ts
 *
 * Regras de drain / recarga:
 *
 *  ENERGIA (bateria do notebook):
 *    • Drena APENAS enquanto o terminal estiver aberto (actions["terminal"] === true)
 *    • Recarrega apenas quando sentado
 *    • Se chegar a 0: terminal bloqueado + contador de cooldown na tela
 *
 *  VIDA:
 *    • Drena enquanto o jogador estiver ANDANDO (clips de movimento)
 *    • Recarrega apenas quando sentado
 *    • Se chegar a 0: penalidade e ressurge com 30%
 *
 *  SENTADO: recarrega energia E vida simultaneamente
 */

import { infoPlayer } from "./InfoPlayer";
import { showInstruction } from "./Actions";

// ── Configuração — ajuste aqui sem tocar na lógica ────────────────────────────
const CFG = {
    // Energia
    energyDrainRate:    1.5,   // % por segundo (terminal aberto)
    energyRechargeRate: 8.0,   // % por segundo (sentado)
    terminalCooldown:   30,    // segundos bloqueado após energia = 0

    // Vida
    healthDrainRate:    0.8,   // % por segundo (andando)
    healthRechargeRate: 5.0,   // % por segundo (sentado)
    healthDangerZone:   25,    // % abaixo do qual dispara aviso

    // Penalidade ao desmaiar
    deathMoneyPenalty:  200,
    deathHealthReset:   30,
};

// Clips que indicam movimento (andar / correr)
const WALKING_CLIPS = new Set([
    'Walk', 'Running', 'WalkLeft', 'WalkRight',
    'Backward', 'CrouchRun', 'CrouchLeft', 'CrouchRight',
]);

export default class VitalSystem {

    private pc: any;                   // PlayerController
    private cooldownRemaining = 0;
    private cooldownEl: HTMLElement | null = null;

    // Flags para avisos únicos por ciclo (evita spam de notificações)
    private warnedEnergy = false;
    private warnedHealth = false;

    constructor(playerController: any) {
        this.pc = playerController;
        this.buildCooldownOverlay();
    }

    // ── Chamado a cada frame via Experience.update(delta) ─────────────────────
    update(delta: number) {
        const sitting        = this.pc.isSitting         as boolean;
        const terminalOpen   = this.pc.actions?.["terminal"] as boolean;
        const walking        = WALKING_CLIPS.has(this.pc.clipName as string);

        if (sitting) {
            this.recharge(delta);
        } else {
            if (terminalOpen) this.drainEnergy(delta);
            if (walking)      this.drainHealth(delta);
        }

        this.tickCooldown(delta);
    }

    // ── Recarga (só sentado) ──────────────────────────────────────────────────
    private recharge(delta: number) {
        infoPlayer.energy = Math.min(100, infoPlayer.energy + CFG.energyRechargeRate * delta);
        infoPlayer.health = Math.min(100, infoPlayer.health + CFG.healthRechargeRate * delta);

        // Se cooldown ativo, cancelar ao sentar (recarga física > espera)
        if (this.cooldownRemaining > 0) {
            this.cooldownRemaining = 0;
            this.hideCooldown();
            infoPlayer.hasTerminal = true;
            window.HUD?.notify('🔋 Dispositivo recarregado!', 'success');
        }

        // Reset flags de aviso quando recupera
        if (infoPlayer.energy > 20) this.warnedEnergy = false;
        if (infoPlayer.health > CFG.healthDangerZone) this.warnedHealth = false;
    }

    // ── Drain de energia (terminal aberto) ───────────────────────────────────
    private drainEnergy(delta: number) {
        infoPlayer.energy = Math.max(0, infoPlayer.energy - CFG.energyDrainRate * delta);

        if (infoPlayer.energy <= 20 && !this.warnedEnergy) {
            this.warnedEnergy = true;
            window.HUD?.notify('🔋 Bateria baixa — sente-se para recarregar!', 'warn');
        }

        if (infoPlayer.energy <= 0) {
            infoPlayer.hasTerminal = false;
            if (this.cooldownRemaining <= 0) {
                this.cooldownRemaining = CFG.terminalCooldown;
                this.showCooldown(this.cooldownRemaining);
                showInstruction('🔋 Bateria esgotada', 'Sente-se para recarregar o dispositivo.');
                window.HUD?.notify('🔋 Terminal bloqueado! Sente-se para recarregar.', 'error');
            }
        }
    }

    // ── Drain de vida (andando) ───────────────────────────────────────────────
    private drainHealth(delta: number) {
        infoPlayer.health = Math.max(0, infoPlayer.health - CFG.healthDrainRate * delta);

        if (infoPlayer.health <= CFG.healthDangerZone && !this.warnedHealth) {
            this.warnedHealth = true;
            window.HUD?.notify('❤️ Vida crítica — sente-se para recuperar!', 'error');
            showInstruction('❤️ Saúde baixa', 'Sente-se em uma cadeira para recuperar.');
        }

        if (infoPlayer.health <= 0) this.onDeath();
    }

    // ── Contador de cooldown do terminal ─────────────────────────────────────
    private tickCooldown(delta: number) {
        if (this.cooldownRemaining <= 0) return;

        this.cooldownRemaining = Math.max(0, this.cooldownRemaining - delta);
        this.updateCooldownDisplay(this.cooldownRemaining);

        if (this.cooldownRemaining <= 0) {
            infoPlayer.hasTerminal = true;
            infoPlayer.energy = 15;
            this.hideCooldown();
            this.warnedEnergy = false;
            window.HUD?.notify('🔋 Dispositivo recarregado — terminal disponível.', 'success');
        }
    }

    // ── Morte / vida zerada ───────────────────────────────────────────────────
    private onDeath() {
        infoPlayer.health = CFG.deathHealthReset;
        infoPlayer.money  = Math.max(0, infoPlayer.money - CFG.deathMoneyPenalty);
        this.warnedHealth = false;
        window.HUD?.notify(`💀 Você desmaiou! -$${CFG.deathMoneyPenalty} e vida restaurada a ${CFG.deathHealthReset}%.`, 'error');
        showInstruction('💀 Desmaiou', `Você perdeu $${CFG.deathMoneyPenalty}. Sente-se para recuperar.`);
    }

    // ── Overlay de cooldown — estética Watch Dogs / ctOS ─────────────────────
    private buildCooldownOverlay() {
        if (document.getElementById('__vital-cooldown')) {
            this.cooldownEl = document.getElementById('__vital-cooldown');
            return;
        }

        // ── Injeção de estilos e keyframes ────────────────────────────────
        if (!document.getElementById('__vital-styles')) {
            const style = document.createElement('style');
            style.id = '__vital-styles';
            style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

                #__vital-cooldown {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 1500;
                    display: none;
                    flex-direction: column;
                    align-items: center;
                    pointer-events: none;
                    width: 340px;
                }

                /* Painel principal */
                #__vital-panel {
                    width: 100%;
                    background: rgba(0, 4, 10, 0.96);
                    border: 1px solid rgba(255, 60, 0, 0.5);
                    box-shadow:
                        0 0 0 1px rgba(255, 60, 0, 0.1),
                        0 0 30px rgba(255, 60, 0, 0.15),
                        inset 0 0 40px rgba(255, 30, 0, 0.04);
                    padding: 0;
                    position: relative;
                    overflow: hidden;
                    clip-path: polygon(
                        0 12px, 12px 0,
                        calc(100% - 12px) 0, 100% 12px,
                        100% calc(100% - 12px), calc(100% - 12px) 100%,
                        12px 100%, 0 calc(100% - 12px)
                    );
                }

                /* Scanlines */
                #__vital-panel::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 2px,
                        rgba(255, 255, 255, 0.012) 2px,
                        rgba(255, 255, 255, 0.012) 4px
                    );
                    pointer-events: none;
                    z-index: 1;
                }

                /* Linha de varredura animada */
                #__vital-panel::after {
                    content: '';
                    position: absolute;
                    left: 0; right: 0;
                    height: 2px;
                    background: linear-gradient(90deg, transparent, rgba(255, 60, 0, 0.6), transparent);
                    animation: __vital-scan 2.4s linear infinite;
                    z-index: 2;
                }

                @keyframes __vital-scan {
                    0%   { top: -2px; opacity: 0; }
                    5%   { opacity: 1; }
                    95%  { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }

                /* Header da panel */
                #__vital-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 14px 6px;
                    border-bottom: 1px solid rgba(255, 60, 0, 0.25);
                    background: rgba(255, 30, 0, 0.07);
                }

                #__vital-sys-tag {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    letter-spacing: .22em;
                    color: rgba(255, 60, 0, 0.7);
                    text-transform: uppercase;
                }

                #__vital-status-dot {
                    width: 6px; height: 6px;
                    border-radius: 50%;
                    background: #ff3c00;
                    box-shadow: 0 0 8px #ff3c00;
                    animation: __vital-blink 0.9s ease-in-out infinite;
                }

                @keyframes __vital-blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.15; }
                }

                /* Corpo central */
                #__vital-body {
                    padding: 20px 20px 16px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 14px;
                    position: relative;
                    z-index: 3;
                }

                /* Ícone de bateria SVG com glitch */
                #__vital-icon-wrap {
                    position: relative;
                    width: 56px; height: 56px;
                    display: flex; align-items: center; justify-content: center;
                }

                #__vital-icon-ring {
                    position: absolute;
                    inset: 0;
                    border: 1px solid rgba(255, 60, 0, 0.4);
                    border-radius: 50%;
                    animation: __vital-ring-pulse 2s ease-in-out infinite;
                }

                #__vital-icon-ring2 {
                    position: absolute;
                    inset: -6px;
                    border: 1px solid rgba(255, 60, 0, 0.15);
                    border-radius: 50%;
                    animation: __vital-ring-pulse 2s ease-in-out infinite 0.4s;
                }

                @keyframes __vital-ring-pulse {
                    0%, 100% { transform: scale(1);   opacity: 0.6; }
                    50%       { transform: scale(1.08); opacity: 0.2; }
                }

                #__vital-batt-icon {
                    font-size: 28px;
                    animation: __vital-glitch 4s infinite;
                    filter: drop-shadow(0 0 6px rgba(255,60,0,0.8));
                }

                @keyframes __vital-glitch {
                    0%, 88%, 100% { transform: none; filter: drop-shadow(0 0 6px rgba(255,60,0,0.8)); }
                    90% { transform: translateX(-2px) skewX(-4deg); filter: drop-shadow(2px 0 0 #0ff) drop-shadow(-2px 0 0 #f0f); }
                    92% { transform: translateX(2px);  filter: drop-shadow(0 0 6px rgba(255,60,0,0.8)); }
                    94% { transform: translateX(-1px) skewX(2deg); filter: drop-shadow(1px 0 0 #0ff); }
                    96% { transform: none; }
                }

                /* Título da falha */
                #__vital-title {
                    text-align: center;
                }

                #__vital-title-main {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 13px;
                    font-weight: 700;
                    letter-spacing: .18em;
                    color: #ff3c00;
                    text-transform: uppercase;
                    text-shadow: 0 0 16px rgba(255, 60, 0, 0.6);
                    display: block;
                    margin-bottom: 4px;
                }

                #__vital-title-sub {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    letter-spacing: .2em;
                    color: rgba(255, 120, 60, 0.5);
                    text-transform: uppercase;
                }

                /* Timer de cooldown */
                #__vital-timer-wrap {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 3px;
                    width: 100%;
                }

                #__vital-timer-label {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    letter-spacing: .3em;
                    color: rgba(255,255,255,0.2);
                    text-transform: uppercase;
                }

                #__vital-cd-timer {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 52px;
                    font-weight: 900;
                    letter-spacing: .05em;
                    color: #ff3c00;
                    text-shadow:
                        0 0 20px rgba(255, 60, 0, 0.9),
                        0 0 60px rgba(255, 60, 0, 0.3);
                    line-height: 1;
                    animation: __vital-timer-flicker 3.5s infinite;
                }

                @keyframes __vital-timer-flicker {
                    0%, 97%, 100% { opacity: 1; }
                    98% { opacity: 0.4; }
                    99% { opacity: 1; }
                }

                /* Barra de progresso */
                #__vital-bar-wrap {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }

                #__vital-bar-track {
                    width: 100%;
                    height: 3px;
                    background: rgba(255,255,255,0.06);
                    position: relative;
                    overflow: hidden;
                }

                #__vital-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #ff3c00, #ff8c00);
                    box-shadow: 0 0 8px rgba(255,60,0,0.8);
                    transition: width 1s linear;
                    width: 100%;
                }

                /* Hex noise de fundo */
                #__vital-hex-bg {
                    position: absolute;
                    inset: 0;
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 8px;
                    color: rgba(255, 60, 0, 0.04);
                    overflow: hidden;
                    line-height: 1.4;
                    letter-spacing: .1em;
                    padding: 4px;
                    z-index: 0;
                    pointer-events: none;
                    word-break: break-all;
                }

                /* Footer */
                #__vital-footer {
                    padding: 6px 14px 9px;
                    border-top: 1px solid rgba(255,60,0,0.12);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    position: relative;
                    z-index: 3;
                }

                #__vital-hint {
                    font-family: 'Share Tech Mono', monospace;
                    font-size: 9px;
                    letter-spacing: .15em;
                    color: rgba(255,255,255,0.2);
                    text-transform: uppercase;
                }

                #__vital-hint strong {
                    color: rgba(255, 140, 0, 0.7);
                    font-weight: normal;
                }

                /* Cantos decorativos */
                .vital-corner {
                    position: absolute;
                    width: 8px; height: 8px;
                    border-color: rgba(255,60,0,0.5);
                    border-style: solid;
                }
                .vital-corner.tl { top: 3px; left: 3px;  border-width: 1px 0 0 1px; }
                .vital-corner.tr { top: 3px; right: 3px; border-width: 1px 1px 0 0; }
                .vital-corner.bl { bottom: 3px; left: 3px;  border-width: 0 0 1px 1px; }
                .vital-corner.br { bottom: 3px; right: 3px; border-width: 0 1px 1px 0; }

                /* Entrada / saída */
                @keyframes __vital-in {
                    from { opacity: 0; transform: translate(-50%,-50%) scale(0.92) skewX(-1deg); }
                    to   { opacity: 1; transform: translate(-50%,-50%) scale(1)    skewX(0deg); }
                }
                @keyframes __vital-out {
                    from { opacity: 1; transform: translate(-50%,-50%) scale(1); }
                    to   { opacity: 0; transform: translate(-50%,-50%) scale(0.95) skewX(2deg); }
                }
                #__vital-cooldown.entering {
                    animation: __vital-in 0.25s cubic-bezier(0.2, 0, 0.4, 1) forwards;
                }
                #__vital-cooldown.leaving {
                    animation: __vital-out 0.2s ease-in forwards;
                }
            `;
            document.head.appendChild(style);
        }

        // ── Markup do overlay ──────────────────────────────────────────────
        const el = document.createElement('div');
        el.id = '__vital-cooldown';
        el.innerHTML = `
            <div id="__vital-panel">
                <div id="__vital-hex-bg"></div>

                <div class="vital-corner tl"></div>
                <div class="vital-corner tr"></div>
                <div class="vital-corner bl"></div>
                <div class="vital-corner br"></div>

                <div id="__vital-header">
                    <span id="__vital-sys-tag">ctOS · POWER_FAILURE</span>
                    <div id="__vital-status-dot"></div>
                </div>

                <div id="__vital-body">
                    <div id="__vital-icon-wrap">
                        <div id="__vital-icon-ring"></div>
                        <div id="__vital-icon-ring2"></div>
                        <span id="__vital-batt-icon">🪫</span>
                    </div>

                    <div id="__vital-title">
                        <span id="__vital-title-main">Dispositivo Offline</span>
                        <span id="__vital-title-sub">ERR_BATTERY_DEPLETED · SYS_LOCKED</span>
                    </div>

                    <div id="__vital-timer-wrap">
                        <span id="__vital-timer-label">Reboot em</span>
                        <span id="__vital-cd-timer">30s</span>
                    </div>

                    <div id="__vital-bar-wrap">
                        <div id="__vital-bar-track">
                            <div id="__vital-bar-fill"></div>
                        </div>
                    </div>
                </div>

                <div id="__vital-footer">
                    <span id="__vital-hint">
                        Pressione <strong>[F]</strong> perto de uma cadeira para recarregar
                    </span>
                </div>
            </div>
        `;
        document.body.appendChild(el);
        this.cooldownEl = el;

        // Preenche o fundo com ruído hexadecimal
        this.fillHexNoise();
    }

    private fillHexNoise() {
        const bg = document.getElementById('__vital-hex-bg');
        if (!bg) return;
        let txt = '';
        for (let i = 0; i < 300; i++) {
            txt += Math.floor(Math.random() * 0xff).toString(16).padStart(2, '0').toUpperCase() + ' ';
        }
        bg.textContent = txt;
    }

    private showCooldown(seconds: number) {
        if (!this.cooldownEl) return;
        this._cooldownTotal = seconds;
        this.cooldownEl.style.display = 'flex';
        this.cooldownEl.classList.remove('leaving');
        this.cooldownEl.classList.add('entering');
        this.updateCooldownDisplay(seconds);
    }

    private _cooldownTotal = CFG.terminalCooldown;

    private updateCooldownDisplay(seconds: number) {
        const t = document.getElementById('__vital-cd-timer');
        if (t) t.textContent = `${Math.ceil(seconds)}s`;

        const bar = document.getElementById('__vital-bar-fill') as HTMLElement | null;
        if (bar) {
            const pct = (seconds / this._cooldownTotal) * 100;
            bar.style.width = `${pct}%`;
        }
    }

    private hideCooldown() {
        if (!this.cooldownEl) return;
        this.cooldownEl.classList.remove('entering');
        this.cooldownEl.classList.add('leaving');
        setTimeout(() => {
            if (this.cooldownEl) this.cooldownEl.style.display = 'none';
            this.cooldownEl?.classList.remove('leaving');
        }, 210);
    }

    // ── API pública ───────────────────────────────────────────────────────────
    penalizeEnergy(amount: number) {
        infoPlayer.energy = Math.max(0, infoPlayer.energy - Math.abs(amount));
        window.HUD?.notify(`⚡ -${amount}% bateria`, 'warn');
    }
    penalizeHealth(amount: number) {
        infoPlayer.health = Math.max(0, infoPlayer.health - Math.abs(amount));
        window.HUD?.notify(`❤️ -${amount}% vida`, 'error');
    }
}