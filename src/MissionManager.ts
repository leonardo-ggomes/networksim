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

// ── Helpers de validação de saída C ──────────────────────────────────────────

/** Remove espaços extras e normaliza quebras de linha da saída do compilador */
function normalizeOutput(s: string): string {
    return s.replace(/\r/g, '').trim().replace(/\s+/g, ' ');
}

/** Verifica se a saída contém todas as linhas esperadas (em ordem) */
function outputContainsLines(output: string, expected: string[]): boolean {
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    let ei = 0;
    for (const line of lines) {
        if (line === expected[ei]) ei++;
        if (ei === expected.length) return true;
    }
    return false;
}

// ── Definição das missões ─────────────────────────────────────────────────────

function buildMissions(): MissionDef[] {
    return [

        // ── Missão 1: Eliminar o malware (processo) ────────────────────────
        {
            id:    'kill-malware',
            title: '🦠 Elimine o Malware',
            instruction: 'Um processo suspeito foi detectado. Abra o terminal (T) e encerre o PID 7777 com: kill -9 7777',
            position: new Vector3(-11.4, 1.15, 30),
            radius:   2.5,
            reward:   { money: 400, health: 10, energy: 5 },
            helper:   true,
            listenTo: 'remove_pid',
            onStart: () => {
                elementos.setProcesses('anomimo', 7777, 849.90, 47);
                setTimeout(() => showInstruction(
                    '🦠 Elimine o Malware',
                    'Há suspeita que o hacker executou um programa malicioso. Use: kill -9 7777'
                ), 18000);
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

        // ── Missão 2: Olá Mundo em C ───────────────────────────────────────
        {
            id:    'c-hello',
            title: '👨‍💻 Olá Mundo em C',
            instruction: 'Abra o terminal (T) → aba "Editor C" e escreva um programa que imprima exatamente: Ola, Mundo!',
            position: new Vector3(0, 0, 10),
            radius:   15,
            reward:   { money: 300, energy: 10 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '👨‍💻 Desafio C #1',
                    'Escreva um programa C que imprima: Ola, Mundo!\nUse printf() e compile com o botão verde.'
                );
            },
            check: (e) => {
                const { output } = e.detail as any;
                return normalizeOutput(output) === 'Ola, Mundo!';
            },
            onComplete: () => {
                showInstruction('✅ Correto!', 'Seu primeiro programa C funcionou!');
            }
        },

        // ── Missão 3: Variáveis e aritmética ──────────────────────────────
        {
            id:    'c-arithmetic',
            title: '🔢 Variáveis e Aritmética',
            instruction: 'Declare duas variáveis int, some-as e imprima o resultado. Ex: a=7, b=3 → imprima 10',
            position: new Vector3(0, 0, 10),
            radius:   15,
            reward:   { money: 400, energy: 5 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '🔢 Desafio C #2 — Aritmética',
                    'Declare: int a = 7, b = 3;\nImprima a soma: printf("%d", a + b);\nResultado esperado: 10'
                );
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                const out = normalizeOutput(output);
                // Aceita qualquer soma correta onde resultado seja número inteiro
                const num = parseInt(out, 10);
                const hasVars = /int\s+\w+\s*=/.test(source);
                const hasSum  = /\+/.test(source);
                return !isNaN(num) && hasVars && hasSum;
            },
            onComplete: () => {
                showInstruction('✅ Correto!', 'Você dominou variáveis e aritmética em C!');
            }
        },

        // ── Missão 4: Condicional ─────────────────────────────────────────
        {
            id:    'c-conditional',
            title: '🔀 Use um if/else',
            instruction: 'Escreva um programa C que verifique se um número é positivo ou negativo e imprima "positivo" ou "negativo".',
            position: new Vector3(0, 0, 10),
            radius:   15,
            reward:   { money: 500, health: 10 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '🔀 Desafio C #3 — Condicional',
                    'Use if/else para verificar se um número é positivo ou negativo.\nImprima "positivo" ou "negativo".'
                );
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                const out  = output.toLowerCase();
                const hasIf = /\bif\b/.test(source) && /\belse\b/.test(source);
                const hasPrint = out.includes('positivo') || out.includes('negativo');
                return hasIf && hasPrint;
            },
            onComplete: () => {
                showInstruction('✅ Correto!', 'Você sabe usar condicionais em C!');
            }
        },

        // ── Missão 5: Loop for ────────────────────────────────────────────
        {
            id:    'c-loop',
            title: '🔁 Loop de 1 a 5',
            instruction: 'Escreva um programa C com um loop for que imprima os números de 1 a 5, um por linha.',
            position: new Vector3(0, 0, 10),
            radius:   15,
            reward:   { money: 600, health: 10, energy: 10 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '🔁 Desafio C #4 — Loop',
                    'Use for para imprimir 1, 2, 3, 4, 5 (cada número em uma linha).\nDica: for(int i=1; i<=5; i++)'
                );
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                const hasFor = /\bfor\b/.test(source);
                return hasFor && outputContainsLines(output, ['1','2','3','4','5']);
            },
            onComplete: () => {
                showInstruction('✅ Correto!', 'Loop for dominado! Você está evoluindo em C.');
            }
        },

        // ── Missão 6: Função customizada ──────────────────────────────────
        {
            id:    'c-function',
            title: '⚙️ Crie uma função',
            instruction: 'Crie uma função em C que receba dois inteiros e retorne a multiplicação. Imprima o resultado de mult(4, 5).',
            position: new Vector3(0, 0, 10),
            radius:   15,
            reward:   { money: 800, health: 15, energy: 15 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '⚙️ Desafio C #5 — Função',
                    'Crie: int mult(int a, int b){ return a * b; }\nChame em main: printf("%d", mult(4, 5));\nEsperado: 20'
                );
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                const out     = normalizeOutput(output);
                const hasFunc = /int\s+\w+\s*\(/.test(source) && /return/.test(source);
                const hasCall = /\w+\s*\(\s*\d+\s*,\s*\d+\s*\)/.test(source);
                return hasFunc && hasCall && out === '20';
            },
            onComplete: () => {
                showInstruction('🏆 Excelente!', 'Você sabe criar e chamar funções em C!');
            }
        },

        // ── Missão 7: Participar da apresentação ─────────────────────────
        {
            id:    'attend-talk',
            title: '🎤 Assista à apresentação',
            instruction: 'Sente-se em uma cadeira e assista à apresentação para ganhar pontos.',
            position: new Vector3(0, 0, 10),
            radius:   15,
            reward:   { money: 300 },
            helper:   false,
            listenTo: 'collided',
            check: (e) => (e.detail as any).collided === true,
        },
    ];
}

// ── MissionManager ────────────────────────────────────────────────────────────

export class MissionManagers {

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
        setTimeout(() => this.launchCurrent(), 6000);
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