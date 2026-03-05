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

    // ── Overlay de cooldown ───────────────────────────────────────────────────
    private buildCooldownOverlay() {
        if (document.getElementById('__vital-cooldown')) {
            this.cooldownEl = document.getElementById('__vital-cooldown');
            return;
        }
        const el = document.createElement('div');
        el.id = '__vital-cooldown';
        Object.assign(el.style, {
            position:       'fixed',
            top:            '50%',
            left:           '50%',
            transform:      'translate(-50%,-50%)',
            zIndex:         '1500',
            display:        'none',
            flexDirection:  'column',
            alignItems:     'center',
            gap:            '10px',
            background:     'rgba(0,0,0,0.85)',
            border:         '1px solid rgba(240,185,11,0.35)',
            borderRadius:   '8px',
            padding:        '24px 40px',
            fontFamily:     "'Share Tech Mono', monospace",
            color:          '#fff',
            pointerEvents:  'none',
            backdropFilter: 'blur(8px)',
        });
        el.innerHTML = `
            <span style="font-size:36px">🔋</span>
            <span style="font-size:11px;color:#888;letter-spacing:.15em;text-transform:uppercase">Bateria esgotada</span>
            <span id="__vital-cd-timer" style="font-size:44px;font-weight:700;color:#f0b90b;
                  text-shadow:0 0 18px rgba(240,185,11,0.55)">30s</span>
            <span style="font-size:10px;color:#555">Sente-se para recarregar mais rápido</span>
        `;
        document.body.appendChild(el);
        this.cooldownEl = el;
    }

    private showCooldown(seconds: number) {
        if (!this.cooldownEl) return;
        this.cooldownEl.style.display = 'flex';
        this.updateCooldownDisplay(seconds);
    }

    private updateCooldownDisplay(seconds: number) {
        const t = document.getElementById('__vital-cd-timer');
        if (t) t.textContent = `${Math.ceil(seconds)}s`;
    }

    private hideCooldown() {
        if (this.cooldownEl) this.cooldownEl.style.display = 'none';
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