/**
 * TeacherNPC.ts
 *
 * Animações : idêntico ao PlayerModel — usa loading.globalAnimations
 * Movimento : idêntico ao NPC.ts      — followPath + slerp
 * Caminhos  : usa Path.ts (ajuste pathDefs sem tocar aqui)
 * Slides    : malha 3D (PlaneGeometry + CanvasTexture) acima do palco
 *
 * Acionamento (apenas admin):
 *   teach start intro-c | teach start conditionals | teach start loops
 *   teach next | teach prev | teach stop | teach list
 */

import {
    Object3D, Scene, AnimationMixer, AnimationAction,
    Mesh, PlaneGeometry, MeshBasicMaterial,
    CanvasTexture, Vector3
} from "three";
import * as YUKA from "yuka";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import Loading from "./Loading";
import { pathDefs } from "./Path";
import { eventEmitter, showInstruction } from "./Actions";
import { infoPlayer } from "./InfoPlayer";
import SocketManager from "./SocketManager";

// ── Slides e Lições ───────────────────────────────────────────────────────────

export type Slide  = { title: string; lines: string[]; code?: string };
export type Lesson = { id: string; title: string; slides: Slide[] };

export const LESSONS: Lesson[] = [
    {
        id: "intro-c", title: "Introdução à Linguagem C",
        slides: [
            {
                title: "O que é C?",
                lines: ["Linguagem criada em 1972.", "Base de SOs, drivers e embarcados.", "Rápida e próxima ao hardware."]
            },
            {
                title: "Estrutura básica",
                lines: ["Todo programa precisa de main().", "Execução de cima para baixo.", "Cada instrução termina com ;"],
                code: '#include <stdio.h>\nint main() {\n    printf("Ola!\\n");\n    return 0;\n}'
            },
            {
                title: "Variáveis",
                lines: ["Declara tipo antes de usar.", "Tipos: int, float, char"],
                code: "int x = 10;\nfloat pi = 3.14;\nchar c = 'A';"
            },
            {
                title: "printf / scanf",
                lines: ["printf() exibe na tela.", "scanf() lê entrada.", "%d int  %f float  %c char"],
                code: 'int n;\nscanf("%d",&n);\nprintf("%d\\n",n);'
            },
        ]
    },
    {
        id: "conditionals", title: "Condicionais em C",
        slides: [
            {
                title: "if",
                lines: ["Executa se condição for verdadeira.", "Verdadeiro = qualquer valor != 0."],
                code: 'if (x > 5) {\n    printf("maior\\n");\n}'
            },
            {
                title: "if / else",
                lines: ["else executa quando if é falso.", "else if para múltiplas condições."],
                code: 'if (nota>=7)\n    printf("Aprovado\\n");\nelse\n    printf("Reprovado\\n");'
            },
            {
                title: "Comparação",
                lines: ["==  igual    !=  diferente", ">   maior    <   menor", ">=  maior/igual  <=  menor/igual"],
                code: 'if (a != b)\n    printf("diferentes\\n");'
            },
            {
                title: "Lógicos",
                lines: ["&&  E lógico", "||  OU lógico", "!   NÃO lógico"],
                code: 'if (idade>=18 && carteira)\n    printf("Pode dirigir\\n");'
            },
        ]
    },
    {
        id: "loops", title: "Loops em C",
        slides: [
            {
                title: "while",
                lines: ["Repete enquanto condição for verdadeira.", "Cuidado com loop infinito!"],
                code: "int i=0;\nwhile(i<5){\n    printf(\"%d\\n\",i);\n    i++;\n}"
            },
            {
                title: "for",
                lines: ["Ideal para repetições fixas.", "for(inicio; condicao; incremento)"],
                code: "for(int i=0;i<10;i++)\n    printf(\"%d\\n\",i);"
            },
            {
                title: "break / continue",
                lines: ["break   → sai do loop", "continue → pula iteração"],
                code: "for(int i=0;i<10;i++){\n    if(i==5) break;\n    if(i%2==0) continue;\n    printf(\"%d\\n\",i);\n}"
            },
            {
                title: "Aninhados",
                lines: ["Loop dentro de loop.", "Útil para tabelas/matrizes."],
                code: "for(int i=1;i<=3;i++){\n  for(int j=1;j<=3;j++)\n    printf(\"%d \",i*j);\n  printf(\"\\n\");\n}"
            },
        ]
    },
];

// ── Estado ────────────────────────────────────────────────────────────────────
type TState = "IDLE" | "WALKING" | "TEACHING" | "RETURNING";

// ─────────────────────────────────────────────────────────────────────────────
// TeacherNPC
// ─────────────────────────────────────────────────────────────────────────────
export class TeacherNPC extends YUKA.Vehicle {

    // Three.js
    npcMesh?: Object3D;
    mixer?:   AnimationMixer;
    private animationsAction: Record<string, AnimationAction> = {};
    private activedClip?:     AnimationAction;

    // Cena/Loading
    scene:   Scene;
    loading: Loading;
    private playerModel?: Object3D;

    // Posições de referência (devem coincidir com Path.ts)
    private readonly IDLE_POS  = new YUKA.Vector3(-5, 0, 25);
    private readonly STAGE_POS = new YUKA.Vector3( 0, 0,  0);

    // Yuka path — igual NPC.ts
    private yukaPath  = new YUKA.Path();
    private paused    = false;
    private targetRot = new Object3D();

    // Estado do professor
    private tState: TState = "IDLE";

    // Slides
    private lesson?:      Lesson;
    private slideIdx      = 0;
    private slideTimer    = 0;
    private slideDuration = 20;   // segundos por slide (ajuste com setSlideDuration)
    private slideMesh?:   Mesh;

    // Flag: true quando ESTE cliente controla o NPC (admin que chamou startLesson)
    // Usado pelo SocketManager para ignorar npc:state recebido do servidor
    isControlledLocally = false;

    // Socket — throttle de emissão de posição (10 Hz)
    private lastNpcEmit    = 0;
    private lastNpcX       = 0;
    private lastNpcZ       = 0;
    private lastNpcClip    = "";

    // Notebook
    private notebookGiven        = false;
    private readonly NOTEBOOK_RADIUS = 3.5;

    constructor(scene: Scene, loading: Loading, playerModel?: Object3D) {
        super();
        this.scene       = scene;
        this.loading     = loading;
        this.playerModel = playerModel;
        this.maxSpeed    = 1.5;   // velocidade de caminhada — ajuste aqui
        this.position.set(this.IDLE_POS.x, this.IDLE_POS.y, this.IDLE_POS.z);
        this.loadModel();
        this.addLabel();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODELO + ANIMAÇÕES  (idêntico ao PlayerModel.loadModel)
    // ─────────────────────────────────────────────────────────────────────────
    private loadModel() {
        this.loading.loader.load(
            "models/teacher_npc.glb",
            (gltf) => {
                // SkeletonUtils.clone para não compartilhar bones com o player
                this.npcMesh = (SkeletonUtils as any).clone(gltf.scene);
                this.npcMesh!.position.set(this.IDLE_POS.x, this.IDLE_POS.y, this.IDLE_POS.z);
                this.npcMesh!.scale.set(1, 1, 1);
                this.scene.add(this.npcMesh!);

                // Mixer + clipActions a partir de globalAnimations (igual PlayerModel)
                this.mixer = new AnimationMixer(this.npcMesh!);
                for (const key in this.loading.globalAnimations) {
                    this.animationsAction[key] = this.mixer.clipAction(
                        this.loading.globalAnimations[key]
                    );
                }

                this.setAnimation(this.animationsAction["Idle"]);
                console.log("[TeacherNPC] Pronto.");
            },
            undefined,
            (err) => console.error("[TeacherNPC] Erro ao carregar modelo:", err)
        );
    }

    // Igual ao PlayerModel.setAnimation
    private setAnimation(action?: AnimationAction) {
        if (!action || action === this.activedClip) return;
        this.activedClip?.fadeOut(0.2);
        action.reset().fadeIn(0.1).play();
        this.activedClip = action;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MOVIMENTAÇÃO  (idêntico ao NPC.followPath)
    // ─────────────────────────────────────────────────────────────────────────
    private followPath(delta: number) {
        if (!this.npcMesh || this.paused) return;

        const cur = this.yukaPath.current();
        if (!cur) return;

        const target = new Vector3(cur.x, cur.y, cur.z);

        // Checa proximidade ANTES do lerp:
        // No 1º frame o current() é 'from' (posição atual do NPC) →
        // avança imediatamente sem mover o mesh, eliminando o teletransporte.
        if (this.npcMesh.position.distanceTo(target) < 0.4) {
            if (this.yukaPath.finished()) {
                this.npcMesh.position.copy(target);
                this.position.set(target.x, target.y, target.z);
                this.onArrived();
                return;
            }
            this.yukaPath.advance();
            return; // reavalia no próximo frame com o novo target
        }

        // Rotação suave — apenas eixo Y (horizontal)
        // flatTarget nivela o Y para evitar inclinação ao subir degraus/palco
        this.targetRot.position.copy(this.npcMesh.position);
        const flatTarget = target.clone();
        flatTarget.y = this.npcMesh.position.y;
        this.targetRot.lookAt(flatTarget);
        this.npcMesh.quaternion.slerp(this.targetRot.quaternion, delta * 8.0);

        // Velocidade CONSTANTE — sem aceleração/desaceleração
        // lerp causava "arrancada rápida e freada próximo do waypoint"
        const step = this.maxSpeed * delta;
        const dir  = target.clone().sub(this.npcMesh.position);
        const dist = dir.length();
        if (dist > step) {
            dir.normalize().multiplyScalar(step);
            this.npcMesh.position.add(dir);
        } else {
            this.npcMesh.position.copy(target);
        }
        this.position.set(
            this.npcMesh.position.x,
            this.npcMesh.position.y,
            this.npcMesh.position.z
        );
    }

    // Monta path a partir de um caminho nomeado do Path.ts.
    // Sempre começa da posição ATUAL do mesh para evitar teletransporte.
    private buildNamedPath(name: string) {
        const def = pathDefs[name];
        if (!def) {
            console.warn(`[TeacherNPC] Caminho "${name}" não encontrado em Path.ts`);
            return;
        }
        this.yukaPath = new YUKA.Path();
        // Primeiro ponto = posição real atual do NPC
        if (this.npcMesh) {
            this.yukaPath.add(new YUKA.Vector3(
                this.npcMesh.position.x,
                this.npcMesh.position.y,
                this.npcMesh.position.z
            ));
        }
        def.points.forEach(p => this.yukaPath.add(p.clone()));
        this.paused = false;
    }

    private onArrived() {
        this.paused = true;
        this.setAnimation(this.animationsAction["Idle"]);

        if (this.tState === "WALKING") {
            this.tState     = "TEACHING";
            this.slideTimer = 0;
            this.showSlide(0);
            window.HUD?.notify(`📖 ${this.lesson?.title} — começando`, "success");

        } else if (this.tState === "RETURNING") {
            this.tState = "IDLE";
            // Só libera o controle aqui, depois que o NPC chegou e o estado
            // final Idle já foi emitido com a posição correta ao servidor.
            this.isControlledLocally = false;
            window.HUD?.notify("🎓 Professor voltou ao ponto de espera.", "info");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SLIDE 3D — PlaneGeometry + CanvasTexture
    // ─────────────────────────────────────────────────────────────────────────
    private buildSlideTexture(slide: Slide): CanvasTexture {
        // ── Canvas: resolução alta para nitidez na textura 3D ─────────────────
        // Altura calculada dinamicamente para o código não ser cortado
        const W        = 1920;
        const PAD      = 72;
        const MONO     = "'Share Tech Mono', monospace";

        // ── Paleta cyber/neon moderna ─────────────────────────────────────────
        const C_BG0    = "#06090f";   // preto azulado
        const C_BG1    = "#0a1628";   // azul meia-noite
        const C_ACCENT = "#7df9e8";   // aqua neon — destaque principal
        const C_AMBER  = "#fbbf24";   // âmbar — labels / números
        const C_PURPLE = "#a78bfa";   // violeta — keywords do código
        const C_GREEN  = "#4ade80";   // verde — strings
        const C_WHITE  = "#e2f0ff";   // branco levemente azulado — corpo do texto
        const C_DIM    = "#334155";   // cinza azulado — elementos secundários

        // ── Medição prévia para calcular a altura total necessária ─────────────
        const HDR_H     = 100;
        const TITLE_H   = 110;
        const LINE_H    = 62;
        const CODE_LH   = 48;
        const CODE_HPAD = 72;   // padding top+bottom dentro do bloco de código
        const SEC_GAP   = 24;   // gap entre seções

        const codeLines = slide.code ? slide.code.split("\n") : [];
        const hasCode   = codeLines.length > 0;

        const contentH = slide.lines.length * LINE_H;
        const codeBlockH = hasCode
            ? CODE_HPAD + codeLines.length * CODE_LH + 20
            : 0;
        const FTR_H = 64;

        // Altura total: nunca menor que 900, nunca corta o código
        const H = Math.max(900, HDR_H + TITLE_H + contentH + SEC_GAP + codeBlockH + FTR_H + 40);

        const canvas = document.createElement("canvas");
        canvas.width  = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d")!;

        // ═════════════════════════════════════════════════════════════════════
        // 1. FUNDO
        // ═════════════════════════════════════════════════════════════════════

        // Base escura
        ctx.fillStyle = C_BG0;
        ctx.fillRect(0, 0, W, H);

        // Faixa diagonal — brilho sutil vindo do canto superior direito
        const diag = ctx.createLinearGradient(W, 0, W * 0.3, H * 0.6);
        diag.addColorStop(0,    "rgba(125,249,232,0.07)");
        diag.addColorStop(0.4,  "rgba(10, 22, 40, 0.15)");
        diag.addColorStop(1,    "rgba(6,  9, 15,  0)");
        ctx.fillStyle = diag;
        ctx.fillRect(0, 0, W, H);

        // Grade de pontos — textura tech
        ctx.fillStyle = "rgba(125,249,232,0.055)";
        for (let x = 52; x < W; x += 52)
            for (let y = 52; y < H; y += 52) {
                ctx.beginPath();
                ctx.arc(x, y, 1.2, 0, Math.PI * 2);
                ctx.fill();
            }

        // ═════════════════════════════════════════════════════════════════════
        // 2. HEADER
        // ═════════════════════════════════════════════════════════════════════

        // Faixa do header com gradiente
        const hg = ctx.createLinearGradient(0, 0, W, 0);
        hg.addColorStop(0,   "rgba(125,249,232,0.12)");
        hg.addColorStop(0.7, "rgba(125,249,232,0.04)");
        hg.addColorStop(1,   "rgba(125,249,232,0)");
        ctx.fillStyle = hg;
        ctx.fillRect(0, 0, W, HDR_H);

        // Label sistema — esquerda
        ctx.font      = `bold 24px ${MONO}`;
        ctx.fillStyle = C_ACCENT;
        ctx.globalAlpha = 0.6;
        ctx.fillText("◈  HACKOS EDU-SYS  /  MÓDULO ATIVO", PAD, 38);
        ctx.globalAlpha = 1;

        // Label lesson — direita
        const lessonLabel = (this.lesson?.title ?? "").toUpperCase();
        ctx.font      = `bold 22px ${MONO}`;
        ctx.fillStyle = C_AMBER;
        ctx.globalAlpha = 0.7;
        const llW = ctx.measureText(lessonLabel).width;
        ctx.fillText(lessonLabel, W - PAD - llW, 38);
        ctx.globalAlpha = 1;

        // Separador header — linha dupla
        ctx.strokeStyle = C_ACCENT;
        ctx.lineWidth   = 2.5;
        ctx.beginPath(); ctx.moveTo(PAD, HDR_H - 12); ctx.lineTo(W - PAD, HDR_H - 12); ctx.stroke();
        ctx.strokeStyle = "rgba(125,249,232,0.15)";
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(PAD, HDR_H - 6);  ctx.lineTo(W - PAD, HDR_H - 6);  ctx.stroke();

        // ═════════════════════════════════════════════════════════════════════
        // 3. TÍTULO
        // ═════════════════════════════════════════════════════════════════════

        const TITLE_Y = HDR_H + 82;

        // Pill de número do slide — tag âmbar antes do título
        const total    = this.lesson?.slides.length ?? 1;
        const slideTag = ` ${String(this.slideIdx + 1).padStart(2,"0")} / ${String(total).padStart(2,"0")} `;
        ctx.font = `bold 26px ${MONO}`;
        const tagW = ctx.measureText(slideTag).width + 24;
        ctx.fillStyle = C_AMBER;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.roundRect(PAD, TITLE_Y - 70, tagW, 38, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = C_AMBER;
        ctx.fillText(slideTag, PAD + 12, TITLE_Y - 42);

        // Título principal — branco nítido, grande
        ctx.font      = "bold 94px 'Rajdhani', sans-serif";
        ctx.fillStyle = C_WHITE;
        ctx.fillText(slide.title, PAD, TITLE_Y);

        // Sublinhado accent
        const titleW = Math.min(ctx.measureText(slide.title).width, W - PAD * 2);
        ctx.fillStyle = C_ACCENT;
        ctx.fillRect(PAD, TITLE_Y + 10, titleW, 4);
        ctx.fillStyle = "rgba(125,249,232,0.15)";
        ctx.fillRect(PAD, TITLE_Y + 17, titleW * 0.6, 2);

        // ═════════════════════════════════════════════════════════════════════
        // 4. CONTEÚDO — bullets
        // ═════════════════════════════════════════════════════════════════════

        const CONTENT_Y = TITLE_Y + 42;
        ctx.font = `46px ${MONO}`;

        slide.lines.forEach((line, i) => {
            const y = CONTENT_Y + (i + 1) * LINE_H;

            // Número sequencial em âmbar
            ctx.font      = `bold 22px ${MONO}`;
            ctx.fillStyle = C_AMBER;
            ctx.globalAlpha = 0.8;
            ctx.fillText(String(i + 1).padStart(2, "0"), PAD, y - 6);
            ctx.globalAlpha = 1;

            // Traço separador vertical
            ctx.fillStyle = "rgba(125,249,232,0.3)";
            ctx.fillRect(PAD + 56, y - 44, 2, 52);

            // Texto
            ctx.font      = `44px ${MONO}`;
            ctx.fillStyle = C_WHITE;
            ctx.fillText(line, PAD + 76, y);
        });

        // ═════════════════════════════════════════════════════════════════════
        // 5. BLOCO DE CÓDIGO — terminal com syntax highlight
        // ═════════════════════════════════════════════════════════════════════

        if (hasCode) {
            const CODE_X   = PAD - 4;
            const CODE_W   = W - CODE_X - PAD + 4;
            const CODE_Y   = CONTENT_Y + slide.lines.length * LINE_H + SEC_GAP + LINE_H;
            const FULL_H   = codeBlockH;  // altura calculada dinamicamente — sem corte
            const TITLE_BAR = 44;

            // Fundo do terminal
            ctx.fillStyle = "rgba(2, 6, 14, 0.92)";
            ctx.beginPath();
            ctx.roundRect(CODE_X, CODE_Y, CODE_W, FULL_H, 8);
            ctx.fill();

            // Borda esquerda accent
            ctx.fillStyle = C_PURPLE;
            ctx.fillRect(CODE_X, CODE_Y, 4, FULL_H);

            // Barra de título do terminal
            ctx.fillStyle = "rgba(167,139,250,0.10)";
            ctx.fillRect(CODE_X + 4, CODE_Y, CODE_W - 4, TITLE_BAR);

            // Bolinhas estilo macOS
            const dots: [string, number][] = [["#ff5f57",0], ["#febc2e",1], ["#28c840",2]];
            dots.forEach(([c, j]) => {
                ctx.beginPath();
                ctx.arc(CODE_X + 22 + j * 24, CODE_Y + TITLE_BAR / 2, 7, 0, Math.PI * 2);
                ctx.fillStyle = c;
                ctx.fill();
            });

            // Label do terminal
            ctx.font      = `bold 22px ${MONO}`;
            ctx.fillStyle = "rgba(167,139,250,0.65)";
            ctx.fillText("  ◉  terminal  —  C", CODE_X + 92, CODE_Y + 28);

            // Linhas de código com syntax highlight
            ctx.font = `38px ${MONO}`;
            codeLines.forEach((line, i) => {
                const cy = CODE_Y + TITLE_BAR + 20 + (i + 1) * CODE_LH;

                // Número da linha
                ctx.fillStyle = "rgba(125,249,232,0.22)";
                ctx.fillText(String(i + 1).padStart(2, " "), CODE_X + 14, cy);

                // Gutter separator
                ctx.fillStyle = "rgba(125,249,232,0.08)";
                ctx.fillRect(CODE_X + 64, CODE_Y + TITLE_BAR, 1, FULL_H - TITLE_BAR);

                // Tokenizador — keywords C, strings, diretivas, comentários, resto
                const kwReg = /((?:int|float|char|double|long|short|unsigned|void|return|if|else|while|for|do|switch|case|break|continue|printf|scanf|include|define|struct|typedef)|"[^"]*"|'[^']*'|\/\/.*$|#\w+)/g;
                let last = 0, xOff = CODE_X + 78;
                let m: RegExpExecArray | null;
                while ((m = kwReg.exec(line)) !== null) {
                    if (m.index > last) {
                        ctx.fillStyle = C_WHITE;
                        const t = line.slice(last, m.index);
                        ctx.fillText(t, xOff, cy);
                        xOff += ctx.measureText(t).width;
                    }
                    const tok = m[0];
                    if      (/^"/.test(tok) || /^'/.test(tok))  ctx.fillStyle = C_GREEN;
                    else if (/^\/\//.test(tok))                  ctx.fillStyle = C_DIM;
                    else if (/^#/.test(tok))                     ctx.fillStyle = C_AMBER;
                    else                                         ctx.fillStyle = C_PURPLE;
                    ctx.fillText(tok, xOff, cy);
                    xOff += ctx.measureText(tok).width;
                    last = m.index + tok.length;
                }
                if (last < line.length) {
                    ctx.fillStyle = C_WHITE;
                    ctx.fillText(line.slice(last), xOff, cy);
                }
            });
        }

        // ═════════════════════════════════════════════════════════════════════
        // 6. BORDA EXTERNA + CANTOS EM L
        // ═════════════════════════════════════════════════════════════════════

        // Borda principal fina
        ctx.strokeStyle = C_ACCENT;
        ctx.lineWidth   = 3;
        ctx.strokeRect(6, 6, W - 12, H - 12);
        ctx.strokeStyle = "rgba(125,249,232,0.12)";
        ctx.lineWidth   = 1;
        ctx.strokeRect(14, 14, W - 28, H - 28);

        // Cantos em L
        const CL = 80, CW = 6;
        ctx.fillStyle = C_ACCENT;
        [[6,6,1,1],[W-6,6,-1,1],[6,H-6,1,-1],[W-6,H-6,-1,-1]].forEach(([cx,cy,sx,sy]) => {
            ctx.fillRect(cx, cy,          sx * CL, sy * CW);
            ctx.fillRect(cx, cy,          sx * CW, sy * CL);
        });

        // ═════════════════════════════════════════════════════════════════════
        // 7. RODAPÉ
        // ═════════════════════════════════════════════════════════════════════

        const FY = H - FTR_H;
        ctx.strokeStyle = "rgba(125,249,232,0.25)";
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(PAD, FY); ctx.lineTo(W - PAD, FY); ctx.stroke();

        ctx.font      = `26px ${MONO}`;
        ctx.fillStyle = "rgba(125,249,232,0.40)";
        ctx.fillText(this.lesson?.title ?? "", PAD, FY + 40);

        const pgText = `SLIDE  ${this.slideIdx + 1} / ${total}`;
        ctx.fillStyle = C_ACCENT;
        ctx.globalAlpha = 0.7;
        ctx.fillText(pgText, W - PAD - ctx.measureText(pgText).width, FY + 40);
        ctx.globalAlpha = 1;

        return new CanvasTexture(canvas);
    }

    private showSlide(idx: number) {
        if (!this.lesson) return;
        this.slideIdx = idx;
        const slide   = this.lesson.slides[idx];

        // Remove slide anterior e libera memória
        if (this.slideMesh) {
            this.scene.remove(this.slideMesh);
            this.slideMesh.geometry.dispose();
            (this.slideMesh.material as MeshBasicMaterial).map?.dispose();
            (this.slideMesh.material as MeshBasicMaterial).dispose();
        }

        const tex  = this.buildSlideTexture(slide);
        const geo  = new PlaneGeometry(12.0, 6.2);   // proporcional ao canvas dinâmico
        const mat  = new MeshBasicMaterial({ map: tex, transparent: false });
        this.slideMesh = new Mesh(geo, mat);

        // Posição: elevado e recuado — visível de toda a plateia
        this.slideMesh.position.set(0, 4.8, -3.5);
        this.slideMesh.rotation.y = 0;
        this.scene.add(this.slideMesh);

        // Emite evento local — Editor C preenche o código automaticamente
        eventEmitter.dispatchEvent(new CustomEvent("teacher:slide", {
            detail: { slide, index: idx, total: this.lesson.slides.length, lesson: this.lesson }
        }));

        // Broadcast para todos os clientes — eles reconstroem o slide localmente
        SocketManager.io.emit("slide:npc", {
            lessonId:   this.lesson.id,
            slideIndex: idx,
        });

        window.HUD?.notify(
            `📄 Slide ${idx + 1}/${this.lesson.slides.length}: ${slide.title}`,
            "info"
        );
    }

    private removeSlide() {
        if (!this.slideMesh) return;
        this.scene.remove(this.slideMesh);
        this.slideMesh.geometry.dispose();
        (this.slideMesh.material as MeshBasicMaterial).map?.dispose();
        (this.slideMesh.material as MeshBasicMaterial).dispose();
        this.slideMesh = undefined;
        // Avisa todos que a aula terminou — remove slide na tela de cada cliente
        SocketManager.io.emit("slide:npc:end", {});
    }

    // ─────────────────────────────────────────────────────────────────────────
    // API PÚBLICA
    // ─────────────────────────────────────────────────────────────────────────

    startLesson(lessonId: string) {
        const lesson = LESSONS.find(l => l.id === lessonId);
        if (!lesson) {
            window.HUD?.notify(`Aula '${lessonId}' não existe. Use: teach list`, "error");
            return;
        }
        if (this.tState !== "IDLE") {
            window.HUD?.notify("Professor já está ocupado.", "warn");
            return;
        }

        this.lesson = lesson;
        this.tState = "WALKING";
        this.isControlledLocally = true;  // este cliente passa a controlar o NPC

        // Caminho definido em Path.ts — ajuste sem tocar aqui
        this.buildNamedPath("teacher-to-stage");
        this.setAnimation(this.animationsAction["Walk"]);

        window.HUD?.notify(`🎓 Professor indo ao palco: ${lesson.title}`, "info");
        showInstruction("📚 Aula", `Professor vai ensinar: ${lesson.title}`);
    }

    nextSlide() {
        if (this.tState !== "TEACHING" || !this.lesson) return;
        const next = this.slideIdx + 1;
        if (next >= this.lesson.slides.length) {
            this.endLesson();
        } else {
            this.slideTimer = 0;
            this.showSlide(next);
        }
    }

    prevSlide() {
        if (this.tState !== "TEACHING" || !this.lesson) return;
        this.slideTimer = 0;
        this.showSlide(Math.max(0, this.slideIdx - 1));
    }

    endLessonNow() {
        if (this.tState === "TEACHING") this.endLesson();
    }

    private endLesson() {
        this.removeSlide();
        this.tState = "RETURNING";
        // Mantém isControlledLocally=true durante todo o RETURNING.
        // O admin continua emitindo posição/animação até chegar ao destino.
        // isControlledLocally só vai a false em onArrived(), depois que o
        // estado final Idle já foi emitido com a posição correta.
        this.isControlledLocally = true;
        this.buildNamedPath("teacher-to-idle");
        this.setAnimation(this.animationsAction["Walk"]);
        // Zera o throttle para forçar emissão imediata do clip=Walk,
        // sem esperar os 100ms — garante que o segundo player receba
        // o estado correto antes que o servidor entregue um estado stale.
        this.lastNpcEmit = 0;
        this.lastNpcClip = "";

        eventEmitter.dispatchEvent(new CustomEvent("lesson:complete", {
            detail: { lessonId: this.lesson?.id }
        }));
        window.HUD?.notify("✅ Aula encerrada! Pratique no terminal.", "success");
        showInstruction("✅ Aula concluída", "Abra o terminal e resolva o desafio de C.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NOTEBOOK — entrega ao player próximo (estado IDLE)
    // ─────────────────────────────────────────────────────────────────────────
    private checkNotebook() {
        if (!this.npcMesh || !this.playerModel || this.notebookGiven) return;
        if (this.npcMesh.position.distanceTo(this.playerModel.position) < this.NOTEBOOK_RADIUS) {
            this.notebookGiven     = true;
            infoPlayer.hasTerminal = true;
            showInstruction("🎓 Professor", "Aqui está seu notebook! Pressione T para abrir.");
            window.HUD?.notify("💻 Notebook recebido!", "success");
            eventEmitter.dispatchEvent(new CustomEvent("notebook:received", {
                detail: { playerId: infoPlayer.id }
            }));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LABEL 2D flutuante sobre a cabeça do NPC
    // ─────────────────────────────────────────────────────────────────────────
    private addLabel() {
        if (document.getElementById("__teacher-label")) return;
        const el = document.createElement("div");
        el.id = "__teacher-label";
        Object.assign(el.style, {
            position:   "fixed",
            pointerEvents: "none",
            zIndex:     "50",
            fontFamily: "'Rajdhani',sans-serif",
            fontSize:   "12px",
            fontWeight: "700",
            color:      "#f0b90b",
            textShadow: "0 0 8px rgba(240,185,11,0.5)",
            background: "rgba(0,0,0,0.55)",
            padding:    "2px 8px",
            borderRadius: "3px",
            display:    "none",
        });
        el.textContent = "🎓 Professor";
        document.body.appendChild(el);
    }

    private updateLabel(camera: any) {
        const el = document.getElementById("__teacher-label");
        if (!el || !this.npcMesh) return;
        const pos = this.npcMesh.position.clone();
        pos.y += 2.4;
        pos.project(camera);
        const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
        if (pos.z < 1) {
            el.style.display = "block";
            el.style.left    = `${x - el.offsetWidth / 2}px`;
            el.style.top     = `${y}px`;
        } else {
            el.style.display = "none";
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UPDATE — chamado pelo entityManager do Yuka (igual NPC.ts)
    // ─────────────────────────────────────────────────────────────────────────
    override update(delta: number): this {
        super.update(delta);
        this.mixer?.update(delta);

        // Corrige root motion (igual PlayerModel.update)
        const hips = this.npcMesh?.getObjectByName("Hips");
        if (hips) hips.position.set(0, hips.position.y, 0);

        switch (this.tState) {
            case "IDLE":
                this.checkNotebook();
                break;
            case "WALKING":
            case "RETURNING":
                this.followPath(delta);
                break;
            case "TEACHING":
                this.slideTimer += delta;
                if (this.slideTimer >= this.slideDuration) {
                    this.slideTimer = 0;
                    this.nextSlide();
                }
                break;
        }
        return this;
    }

    // Chamado no loop do Experience — atualiza label 2D e PathDebugger
    tick(camera: any) {
        this.updateLabel(camera);
        this.emitNpcState();
    }

    // Emite posição/estado do NPC via socket (10 Hz, apenas se mudou)
    private emitNpcState() {
        if (!this.npcMesh) return;
        const now = Date.now();
        if (now - this.lastNpcEmit < 100) return;  // 10 Hz

        const p    = this.npcMesh.position;
        const q    = this.npcMesh.quaternion;
        const clip = this.tState === "WALKING" || this.tState === "RETURNING" ? "Walk" : "Idle";

        // Só emite se algo mudou de fato
        const moved = Math.abs(p.x - this.lastNpcX) > 0.01 || Math.abs(p.z - this.lastNpcZ) > 0.01;
        const clipChanged = clip !== this.lastNpcClip;
        if (!moved && !clipChanged) return;

        SocketManager.io.emit("npc:update", {
            x:      +p.x.toFixed(3),
            y:      +p.y.toFixed(3),
            z:      +p.z.toFixed(3),
            qx:     +q.x.toFixed(3),
            qy:     +q.y.toFixed(3),
            qz:     +q.z.toFixed(3),
            qw:     +q.w.toFixed(3),
            clip,
            tState: this.tState,
        });

        this.lastNpcEmit = now;
        this.lastNpcX    = p.x;
        this.lastNpcZ    = p.z;
        this.lastNpcClip = clip;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GETTERS / CONFIG
    // ─────────────────────────────────────────────────────────────────────────
    get isIdle()          { return this.tState === "IDLE"; }
    get isTeaching()      { return this.tState === "TEACHING"; }
    get lessonProgress()  {
        return this.lesson
            ? `${this.slideIdx + 1}/${this.lesson.slides.length}`
            : "0/0";
    }

    setPlayerModel(m: Object3D)  { this.playerModel  = m; }

    /**
     * Chamado pelo SocketManager quando recebe slide:npc de outro cliente.
     * Reconstrói o slide localmente sem reemitir via socket.
     */
    renderRemoteSlide(lessonId: string, slideIndex: number) {
        const lesson = LESSONS.find(l => l.id === lessonId);
        if (!lesson) return;
        this.lesson   = lesson;
        this.slideIdx = slideIndex;
        // Remove slide anterior
        if (this.slideMesh) {
            this.scene.remove(this.slideMesh);
            this.slideMesh.geometry.dispose();
            (this.slideMesh.material as MeshBasicMaterial).map?.dispose();
            (this.slideMesh.material as MeshBasicMaterial).dispose();
        }
        // Reconstrói localmente com os dados da aula
        const slide = lesson.slides[slideIndex];
        const tex   = this.buildSlideTexture(slide);
        const geo   = new PlaneGeometry(12.0, 6.2);
        const mat   = new MeshBasicMaterial({ map: tex, transparent: false });
        this.slideMesh = new Mesh(geo, mat);
        this.slideMesh.position.set(0, 4.8, -3.5);
        this.slideMesh.rotation.y = 0;
        this.scene.add(this.slideMesh);
        // Notifica o Editor C local
        eventEmitter.dispatchEvent(new CustomEvent("teacher:slide", {
            detail: { slide, index: slideIndex, total: lesson.slides.length, lesson }
        }));
        window.HUD?.notify(`📄 Slide ${slideIndex + 1}/${lesson.slides.length}: ${slide.title}`, "info");
    }

    /** Remove o slide da tela (chamado remotamente via slide:npc:end) */
    removeRemoteSlide() {
        if (!this.slideMesh) return;
        this.scene.remove(this.slideMesh);
        this.slideMesh.geometry.dispose();
        (this.slideMesh.material as MeshBasicMaterial).map?.dispose();
        (this.slideMesh.material as MeshBasicMaterial).dispose();
        this.slideMesh = undefined;
    }
    setSlideDuration(s: number)  { this.slideDuration = s; }

    /**
     * Fornece um caminho calculado externamente (ex: NavMeshSystem.findPath).
     * O NPC abandona o caminho atual e segue este imediatamente.
     */
    setCustomPath(points: Vector3[]) {
        this.yukaPath = new YUKA.Path();
        if (this.npcMesh) {
            this.yukaPath.add(new YUKA.Vector3(
                this.npcMesh.position.x,
                this.npcMesh.position.y,
                this.npcMesh.position.z
            ));
        }
        points.forEach(p => this.yukaPath.add(new YUKA.Vector3(p.x, p.y, p.z)));
        this.paused = false;
    }

    dispose() {
        this.removeSlide();
        if (this.npcMesh) this.scene.remove(this.npcMesh);
        document.getElementById("__teacher-label")?.remove();
    }
}

export default TeacherNPC;