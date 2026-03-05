/**
 * MissionManager.ts
 *
 * Centraliza toda a lógica de missões do jogo.
 * Cada missão é declarada como um objeto MissionDef — sem necessidade de
 * subclasses ou arquivos separados.
 *
 * Recompensas / penalidades configuráveis por missão:
 *   money   → adiciona dinheiro ao infoPlayer
 *   health  → restaura vida
 *   energy  → restaura energia (bateria)
 *   penalty → desconta energia ao falhar / timeout
 *
 * Uso:
 *   const mm = new MissionManager(scene, loading, eventEmitter)
 *   mm.start()           // inicia sequência
 *   mm.currentDef        // missão ativa
 */

import { Scene, Vector3 } from "three";
import Mission from "./Mission";
import Loading from "./Loading";
import { infoPlayer } from "./InfoPlayer";
import { eventEmitter, showInstruction } from "./Actions";
import elementos from "./Actions";

declare global { interface Window { HUD?: any } }

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type Reward = {
    money?:   number;   // $ ganho ao completar
    health?:  number;   // vida restaurada
    energy?:  number;   // energia restaurada
};

export type Penalty = {
    energy?: number;    // energia descontada ao falhar / timeout
};

export type MissionDef = {
    id:          string;
    title:       string;
    instruction: string; // texto exibido no showInstruction
    position:    Vector3;
    radius?:     number; // raio da zona (default 2)
    reward:      Reward;
    penalty?:    Penalty;
    helper?:     boolean; // exibe pin no mapa (default true)
    // Lógica de conclusão: chamada a cada frame enquanto o player está na zona
    // Retorna true quando a missão deve ser concluída
    check?:      (event: CustomEvent) => boolean;
    // Evento do eventEmitter que esta missão escuta (além de "collided")
    listenTo?:   string;
    // Setup executado ao iniciar a missão (ex: injetar processo, arquivo)
    onStart?:    () => void;
    // Callback extra ao completar
    onComplete?: () => void;
};

// ── Missões do jogo ───────────────────────────────────────────────────────────
// Edite aqui para adicionar / remover / reordenar missões.

function buildMissions(): MissionDef[] {
    return [

        // ── Missão 1: Encontrar o dispositivo ──────────────────────────────
        {
            id:    'find-device',
            title: '🖥️ Encontre o dispositivo',
            instruction: 'Você precisa de um computador para realizar as atividades do evento.',
            position: new Vector3(11.4, 1.15, 30),
            radius:   2.5,
            reward:   { money: 200, energy: 10 },
            helper:   true,
            listenTo: 'collided',
            check: (e) => (e.detail as any).collided === true,
            onComplete: () => {
                infoPlayer.hasTerminal = true;
                showInstruction('Dispositivo habilitado', 'Pressione T para usar o terminal.');
            }
        },

        // ── Missão 2: Eliminar o malware ───────────────────────────────────
        {
            id:    'kill-malware',
            title: '🦠 Elimine o Malware',
            instruction: 'Um processo suspeito foi detectado. Abra o terminal e encerre o PID 7777.',
            position: new Vector3(-11.4, 1.15, 30),
            radius:   2.5,
            reward:   { money: 500, health: 15, energy: 5 },
            penalty:  { energy: -10 },
            helper:   true,
            listenTo: 'remove_pid',
            onStart: () => {
                elementos.setProcesses('anomimo', 7777, 849.90, 47);
                setTimeout(() => showInstruction(
                    'Elimine o Malware',
                    'Há suspeita que o hacker executou um programa malicioso antes do blackout.'
                ), 15000);
            },
            check: (e) => {
                const { processes, isCollided } = e.detail as any;
                return isCollided && (processes as any[]).findIndex(p => p.pid === 7777) === -1;
            },
            onComplete: () => {
                showInstruction('Progresso', 'A energia parece que está voltando.');
                (window as any).__experienceAmbientLight &&
                    ((window as any).__experienceAmbientLight.intensity = 0.7);
            }
        },

        // ── Missão 3: Corrigir o bug no código ────────────────────────────
        {
            id:    'fix-bug',
            title: '🐛 Corrija o bug',
            instruction: 'O hacker implantou uma falha no código. Corrija o mais rápido possível.',
            position: new Vector3(10, 0.5, 30),
            radius:   2.5,
            reward:   { money: 750, health: 10 },
            helper:   true,
            listenTo: 'new_code',
            onStart: () => {
                elementos.setFilesInMission('/', 'app.js',
                    `1 #Código\n` +
                    `2 function guardarCarro(vaga = 1){\n` +
                    `3\n` +
                    `4   while(pos <= 20){\n` +
                    `5       if(vaga == pos){\n` +
                    `6            console.log("Vaga reservada: "+pos)\n` +
                    `7        }\n` +
                    `8        pos++\n` +
                    `9   }\n` +
                    `10 }`
                );
                setTimeout(() => showInstruction(
                    'Sistema parado',
                    'O hacker implantou uma falha no código, corrija o mais rápido possível.'
                ), 15000);
            },
            check: (e) => {
                const { line, code, isCollided } = e.detail as any;
                return isCollided &&
                       line === 3 &&
                       String(code).includes('let pos = 0');
            }
        },

        // ── Missão 4: Participar da apresentação ──────────────────────────
        {
            id:    'attend-talk',
            title: '🎤 Assista à apresentação',
            instruction: 'Sente-se em uma cadeira e assista à apresentação para ganhar pontos.',
            position: new Vector3(0, 0, 10),
            radius:   15, // zona ampla — qualquer cadeira
            reward:   { money: 300 },
            helper:   false,
            listenTo: 'collided',
            check: (e) => (e.detail as any).collided === true,
        },
    ];
}

// ── MissionManager ────────────────────────────────────────────────────────────

export default class MissionManager {

    private scene:    Scene;
    private loading:  Loading;
    private defs:     MissionDef[];
    private index     = 0;
    private active?:  Mission;

    currentDef?: MissionDef;

    constructor(scene: Scene, loading: Loading) {
        this.scene   = scene;
        this.loading = loading;
        this.defs    = buildMissions();
    }

    // ── Inicia a sequência a partir da missão 0 ───────────────────────────────
    start() {
        this.index = 0;
        this.launchCurrent();
    }

    // ── Lança a missão no índice atual ────────────────────────────────────────
    private launchCurrent() {
        if (this.index >= this.defs.length) {
            this.onAllComplete();
            return;
        }

        const def = this.defs[this.index];
        this.currentDef = def;

        // Setup opcional
        def.onStart?.();

        // Cria o ponto de missão na cena
        const mission = new Mission(
            def.title,
            def.position,
            this.scene,
            eventEmitter,
            0,          // reward gerenciado aqui, não na Mission
            def.helper ?? true,
            this.loading
        );
        this.active = mission;

        // Registra missao no HUD (uma unica chamada)
        window.HUD?.setMission(def.id, def.title, def.instruction);

        // Escuta o evento de conclusão
        const eventName = def.listenTo ?? 'collided';
        mission.addGameListener(eventName, (e) => {
            if (!def.check) return;
            if (!def.check(e as CustomEvent)) return;

            this.completeCurrent(mission, def);
        }, false);
    }

    // ── Conclui a missão atual e aplica recompensas ───────────────────────────
    private completeCurrent(mission: Mission, def: MissionDef) {
        // Remove listeners PRIMEIRO para o callback nao disparar novamente
        mission.clearAllListeners();
        mission.finished();
        mission.removeMissionPoint(mission.missionPoint, this.scene);

        // Aplicar recompensas
        if (def.reward.money)  infoPlayer.money  += def.reward.money;
        if (def.reward.health) infoPlayer.health = Math.min(100, infoPlayer.health + def.reward.health);
        if (def.reward.energy) infoPlayer.energy = Math.min(100, infoPlayer.energy + def.reward.energy);

        // Feedback
        const parts: string[] = [];
        if (def.reward.money)  parts.push(`+$${def.reward.money}`);
        if (def.reward.health) parts.push(`+${def.reward.health} vida`);
        if (def.reward.energy) parts.push(`+${def.reward.energy} bateria`);
        elementos.showMsg(`✅ ${def.title} — ${parts.join('  ')}`);

        // Marca como concluída no HUD e remove da lista após 2s
        (window as any).HUD?.completeMission(def.id);

        def.onComplete?.();

        // Próxima missão
        this.index++;
        setTimeout(() => this.launchCurrent(), 2000);
    }

    private onAllComplete() {
        showInstruction('🏆 Parabéns!', 'Você completou todas as missões do evento.');
        elementos.showMsg('🏆 Todas as missões concluídas!');
    }

    // ── Acesso externo para o checkMissionZone no update() ───────────────────
    get missionPoint() { return this.active?.missionPoint; }
    get missionPosition() { return this.active?.missionPoint.position; }
    get missionRadius() { return this.currentDef?.radius ?? 2; }

    checkZone(playerPos: Vector3) {
        if (!this.active) return;
        this.active.checkMissionZone(
            playerPos,
            this.active.missionPoint.position,
            this.missionRadius
        );
    }
}