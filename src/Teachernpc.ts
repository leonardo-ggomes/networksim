/**
 * TeacherNPC.ts — NPC Professor de C
 *
 * Estados (máquina de estado):
 *   IDLE      → parado no ponto de espera, disponível para interação
 *   WALKING   → andando em direção ao palco (ou de volta)
 *   TEACHING  → no palco, exibindo slides de aula
 *   RETURNING → voltando ao ponto de espera após a aula
 *
 * Fluxo:
 *   1. Jogador se aproxima pela primeira vez → obtém o notebook
 *   2. Admin chama teacher.startLesson(lessonId) → NPC sobe ao palco
 *   3. NPC exibe slides com temporizador automático
 *   4. Ao terminar → NPC volta para o ponto de espera
 *
 * Integração com SlideController:
 *   O NPC emite "teacher:slide" via eventEmitter com { index, content }
 *   O SlideController existente pode escutar esse evento para exibir os slides.
 *
 * Uso em Experience.ts:
 *   this.teacher = new TeacherNPC(scene, loading, eventEmitter)
 *   this.teacher.update(delta)   // no loop
 *   // Para iniciar aula:
 *   this.teacher.startLesson('intro-c')
 */

import { AnimationMixer, Scene, Vector3, Object3D, Mesh, PerspectiveCamera } from "three";
import Loading from "./Loading";
import { eventEmitter, showInstruction } from "./Actions";
import { infoPlayer } from "./InfoPlayer";

// ── Lições pré-programadas ────────────────────────────────────────────────────
// Cada slide é um objeto { title, content (markdown-like) }
// O SlideController lê esses dados via evento "teacher:slide"

export type Slide = {
    title:   string;
    content: string;   // texto com \n para quebras
    code?:   string;   // bloco de código C opcional
};

export type Lesson = {
    id:     string;
    title:  string;
    slides: Slide[];
};

export const LESSONS: Lesson[] = [

    // ── Aula 1: Introdução a C ────────────────────────────────────────────────
    {
        id:    'intro-c',
        title: 'Introdução à Linguagem C',
        slides: [
            {
                title:   'O que é C?',
                content: 'C é uma linguagem de programação de propósito geral criada em 1972.\n\nÉ a base de sistemas operacionais, drivers e sistemas embarcados.\n\nRápida, próxima ao hardware e ainda amplamente usada.',
            },
            {
                title:   'Estrutura básica',
                content: 'Todo programa C precisa de uma função main().\n\nO código é executado de cima para baixo.\n\nCada instrução termina com ponto e vírgula (;)',
                code:    '#include <stdio.h>\n\nint main() {\n    printf("Olá, Mundo!\\n");\n    return 0;\n}',
            },
            {
                title:   'Variáveis',
                content: 'Variáveis armazenam dados na memória.\n\nVocê precisa declarar o tipo antes de usar.\n\nTipos básicos: int, float, char',
                code:    'int idade = 20;\nfloat altura = 1.75;\nchar letra = \'A\';\n\nprintf("%d %f %c\\n", idade, altura, letra);',
            },
            {
                title:   'printf e scanf',
                content: 'printf() exibe dados na tela.\nscarf() lê entrada do usuário.\n\nFormatos: %d inteiro  %f float  %c char  %s string',
                code:    'int x;\nprintf("Digite um numero: ");\nscanf("%d", &x);\nprintf("Voce digitou: %d\\n", x);',
            },
        ],
    },

    // ── Aula 2: Condicionais ──────────────────────────────────────────────────
    {
        id:    'conditionals',
        title: 'Condicionais em C',
        slides: [
            {
                title:   'Tomando decisões',
                content: 'O if permite executar código apenas se uma condição for verdadeira.\n\nCondição verdadeira = qualquer valor diferente de zero.',
                code:    'int x = 10;\nif (x > 5) {\n    printf("x é maior que 5\\n");\n}',
            },
            {
                title:   'if / else',
                content: 'O else executa quando a condição do if é falsa.\n\nPodemos encadear com else if para múltiplas condições.',
                code:    'int nota = 7;\nif (nota >= 7) {\n    printf("Aprovado\\n");\n} else {\n    printf("Reprovado\\n");\n}',
            },
            {
                title:   'Operadores de comparação',
                content: '==  igual a\n!=  diferente de\n>   maior que\n<   menor que\n>=  maior ou igual\n<=  menor ou igual',
                code:    'int a = 5, b = 3;\nif (a != b) {\n    printf("a e b sao diferentes\\n");\n}',
            },
            {
                title:   'Operadores lógicos',
                content: '&&  E lógico (ambos verdadeiros)\n||  OU lógico (um ou outro)\n!   NÃO lógico (inverte)',
                code:    'int idade = 20;\nint temCarteira = 1;\nif (idade >= 18 && temCarteira) {\n    printf("Pode dirigir\\n");\n}',
            },
        ],
    },

    // ── Aula 3: Loops ─────────────────────────────────────────────────────────
    {
        id:    'loops',
        title: 'Loops em C',
        slides: [
            {
                title:   'Repetição com while',
                content: 'O while repete um bloco enquanto a condição for verdadeira.\n\nCuidado: se a condição nunca ficar falsa, loop infinito!',
                code:    'int i = 0;\nwhile (i < 5) {\n    printf("%d\\n", i);\n    i++;\n}',
            },
            {
                title:   'O loop for',
                content: 'O for é ideal quando sabemos quantas repetições queremos.\n\nEstrutura: for(inicio; condição; incremento)',
                code:    'for (int i = 0; i < 10; i++) {\n    printf("i = %d\\n", i);\n}',
            },
            {
                title:   'break e continue',
                content: 'break   → sai do loop imediatamente\ncontinue → pula para a próxima iteração',
                code:    'for (int i = 0; i < 10; i++) {\n    if (i == 5) break;\n    if (i % 2 == 0) continue;\n    printf("%d\\n", i);\n}',
            },
            {
                title:   'Loops aninhados',
                content: 'Podemos colocar um loop dentro de outro.\n\nÚtil para trabalhar com matrizes e tabelas.',
                code:    'for (int i = 1; i <= 3; i++) {\n    for (int j = 1; j <= 3; j++) {\n        printf("%d ", i * j);\n    }\n    printf("\\n");\n}',
            },
        ],
    },
];

// ── Estados do NPC ────────────────────────────────────────────────────────────
type NPCState = 'IDLE' | 'WALKING_TO_STAGE' | 'TEACHING' | 'RETURNING';

// ── TeacherNPC ────────────────────────────────────────────────────────────────
export default class TeacherNPC {

    private scene:   Scene;
    private loading: Loading;
    private model:   Object3D | null = null;
    private mixer:   AnimationMixer | null = null;

    // Posições chave (ajuste conforme o mapa)
    private idlePos  = new Vector3(-5, 0, 25);   // ponto de espera
    private stagePos = new Vector3(0,  0, -5);   // centro do palco

    private state: NPCState = 'IDLE';
    private currentLesson?: Lesson;
    private currentSlide  = 0;
    private slideTimer    = 0;
    private slideDuration = 15;   // segundos por slide

    // Flag: se o jogador já coletou o notebook neste NPC
    private notebookGiven = false;
    private interactRadius = 3.5;

    // Referência para avançar slides manualmente (se admin quiser)
    private onSlideChange?: (slide: Slide, index: number, total: number) => void;

    constructor(scene: Scene, loading: Loading) {
        this.scene   = scene;
        this.loading = loading;
        this.loadModel();
    }

    // ── Carrega o modelo GLB do professor ─────────────────────────────────────
    private async loadModel() {
        try {
            const gltf = await this.loading.loader.loadAsync('models/asian_male_animated@base.glb');
            this.model = gltf.scene;
            this.model.position.copy(this.idlePos);
            this.model.scale.set(1, 1, 1);
            this.scene.add(this.model);

            this.mixer = new AnimationMixer(this.model);

            // Label flutuante "Prof. Chico"
            this.addLabel();

            console.log('[TeacherNPC] Modelo carregado.');
        } catch (e) {
            console.warn('[TeacherNPC] Modelo não encontrado, usando placeholder.', e);
        }
    }

    // ── Label com nome acima do NPC ───────────────────────────────────────────
    private addLabel() {
        // Usa o mesmo sistema de Guest names já existente
        const label = document.createElement('div');
        Object.assign(label.style, {
            position:   'fixed',
            pointerEvents: 'none',
            zIndex:     '50',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize:   '12px',
            fontWeight: '700',
            color:      '#f0b90b',
            textShadow: '0 0 8px rgba(240,185,11,0.5)',
            background: 'rgba(0,0,0,0.55)',
            padding:    '2px 8px',
            borderRadius:'3px',
            display:    'none',   // posicionado pelo update() via worldToScreen
        });
        label.id = '__teacher-label';
        label.textContent = '🎓 Prof. Chico';
        document.body.appendChild(label);
    }

    // ── Update (chamado a cada frame) ─────────────────────────────────────────
    update(delta: number, camera: PerspectiveCamera) {
        if (!this.model) return;
        this.mixer?.update(delta);

        switch (this.state) {
            case 'IDLE':
                this.checkPlayerProximity();
                break;
            case 'WALKING_TO_STAGE':
                this.walkTowards(this.stagePos, delta, () => this.beginTeaching());
                break;
            case 'TEACHING':
                this.tickSlide(delta);
                break;
            case 'RETURNING':
                this.walkTowards(this.idlePos, delta, () => {
                    this.state = 'IDLE';
                    window.HUD?.notify('🎓 Prof. Chico voltou ao ponto de espera.', 'info');
                });
                break;
        }

        this.updateLabel(camera);
    }

    // ── Verifica se jogador está perto para obter notebook ────────────────────
    private checkPlayerProximity() {
        if (!this.model) return;
        const playerPos = new Vector3(
             0,
            0,
            0
        );
        const dist = this.model.position.distanceTo(playerPos);

        if (dist < this.interactRadius && !this.notebookGiven) {
            this.giveNotebook();
        }
    }

    // ── Entrega o notebook ao jogador ─────────────────────────────────────────
    private giveNotebook() {
        this.notebookGiven   = true;
        infoPlayer.hasTerminal = true;

        showInstruction(
            '🎓 Prof. Chico',
            'Aqui está seu notebook! Use o terminal para praticar C.'
        );
        window.HUD?.notify('💻 Notebook recebido! Pressione T para abrir.', 'success');

        eventEmitter.dispatchEvent(new CustomEvent('notebook:received', {
            detail: { playerId: infoPlayer.id }
        }));
    }

    // ── Inicia aula — chamado por admin ou MissionManager ────────────────────
    startLesson(lessonId: string) {
        const lesson = LESSONS.find(l => l.id === lessonId);
        if (!lesson) { console.warn(`[TeacherNPC] Aula '${lessonId}' não encontrada.`); return; }

        this.currentLesson = lesson;
        this.currentSlide  = 0;
        this.state         = 'WALKING_TO_STAGE';

        window.HUD?.notify(`🎓 Aula começando: ${lesson.title}`, 'info');
        showInstruction('📚 Aula', `Prof. Chico vai ensinar: ${lesson.title}`);
    }

    // ── NPC começa a ensinar ──────────────────────────────────────────────────
    private beginTeaching() {
        this.state      = 'TEACHING';
        this.slideTimer = 0;
        this.emitSlide();

        window.HUD?.notify(`📖 ${this.currentLesson?.title} — começando`, 'success');
    }

    // ── Tick de slides ────────────────────────────────────────────────────────
    private tickSlide(delta: number) {
        this.slideTimer += delta;
        if (this.slideTimer >= this.slideDuration) {
            this.slideTimer = 0;
            this.nextSlide();
        }
    }

    nextSlide() {
        if (!this.currentLesson) return;
        this.currentSlide++;
        if (this.currentSlide >= this.currentLesson.slides.length) {
            this.endLesson();
        } else {
            this.emitSlide();
        }
    }

    prevSlide() {
        if (!this.currentLesson) return;
        this.currentSlide = Math.max(0, this.currentSlide - 1);
        this.emitSlide();
    }

    private emitSlide() {
        if (!this.currentLesson) return;
        const slide = this.currentLesson.slides[this.currentSlide];
        const total = this.currentLesson.slides.length;

        // Emite para o SlideController / tela de projeção
        eventEmitter.dispatchEvent(new CustomEvent('teacher:slide', {
            detail: { slide, index: this.currentSlide, total, lesson: this.currentLesson }
        }));

        this.onSlideChange?.(slide, this.currentSlide, total);
    }

    // ── Fim da aula ───────────────────────────────────────────────────────────
    private endLesson() {
        this.state = 'RETURNING';

        // Emite evento de fim para MissionManager desbloquear missão seguinte
        eventEmitter.dispatchEvent(new CustomEvent('lesson:complete', {
            detail: { lessonId: this.currentLesson?.id }
        }));

        window.HUD?.notify(`✅ Aula encerrada! Agora pratique no terminal.`, 'success');
        showInstruction('✅ Aula concluída', 'Abra o terminal e resolva o desafio de C.');
    }

    // ── Movimentação simples para um alvo ─────────────────────────────────────
    private walkTowards(target: Vector3, delta: number, onArrived: () => void) {
        if (!this.model) return;
        const speed    = 3.5;
        const dir      = target.clone().sub(this.model.position);
        const dist     = dir.length();

        if (dist < 0.2) {
            this.model.position.copy(target);
            onArrived();
            return;
        }

        dir.normalize();
        this.model.position.addScaledVector(dir, speed * delta);

        // Rotaciona o NPC em direção ao alvo
        const angle = Math.atan2(dir.x, dir.z);
        this.model.rotation.y = angle;
    }

    // ── Atualiza posição do label 2D na tela ──────────────────────────────────
    private updateLabel(camera: any) {
        const label = document.getElementById('__teacher-label');
        if (!label || !this.model) return;

        // Projeta posição 3D na tela
        const pos  = this.model.position.clone();
        pos.y += 2.2;
        pos.project(camera);

        const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;

        if (pos.z < 1) {
            label.style.display = 'block';
            label.style.left    = `${x - label.offsetWidth / 2}px`;
            label.style.top     = `${y}px`;
        } else {
            label.style.display = 'none';
        }
    }

    // ── Getters de estado ─────────────────────────────────────────────────────
    get isTeaching()    { return this.state === 'TEACHING'; }
    get isIdle()        { return this.state === 'IDLE'; }
    get lessonProgress(){ return this.currentLesson ? `${this.currentSlide + 1}/${this.currentLesson.slides.length}` : '0/0'; }

    // ── Define callback de mudança de slide (opcional) ────────────────────────
    onSlideChanged(cb: (s: Slide, i: number, t: number) => void) { this.onSlideChange = cb; }

    // ── Configura as posições conforme o mapa ─────────────────────────────────
    setPositions(idle: Vector3, stage: Vector3) {
        this.idlePos  = idle;
        this.stagePos = stage;
        if (this.model && this.state === 'IDLE') this.model.position.copy(idle);
    }

    // ── Configura tempo por slide ─────────────────────────────────────────────
    setSlideDuration(seconds: number) { this.slideDuration = seconds; }

    dispose() {
        if (this.model) this.scene.remove(this.model);
        document.getElementById('__teacher-label')?.remove();
    }
}