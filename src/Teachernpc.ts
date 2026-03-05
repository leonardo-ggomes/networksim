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
            "models/asian_male_animated@base.glb",
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

        // Rotação suave em direção ao alvo
        this.targetRot.position.copy(this.npcMesh.position);
        this.targetRot.lookAt(target);
        this.npcMesh.quaternion.slerp(this.targetRot.quaternion, delta * 9.0);

        // Lerp suave — sem saltos
        const pos = this.npcMesh.position.clone().lerp(target, delta * this.maxSpeed * 0.3);
        this.npcMesh.position.copy(pos);
        this.position.set(pos.x, pos.y, pos.z);
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
            window.HUD?.notify("🎓 Prof. Chico voltou ao ponto de espera.", "info");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SLIDE 3D — PlaneGeometry + CanvasTexture
    // ─────────────────────────────────────────────────────────────────────────
    private buildSlideTexture(slide: Slide): CanvasTexture {
        const W = 1920, H = 1080;
        const PAD = 80;
        const canvas = document.createElement("canvas");
        canvas.width  = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d")!;

        // Fundo degradê
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "#0d1a12");
        grad.addColorStop(1, "#070f0a");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Borda dupla
        ctx.strokeStyle = "#00ff9d";
        ctx.lineWidth = 8;
        ctx.strokeRect(8, 8, W - 16, H - 16);
        ctx.strokeStyle = "rgba(0,255,157,0.15)";
        ctx.lineWidth = 2;
        ctx.strokeRect(24, 24, W - 48, H - 48);

        // Header
        ctx.fillStyle = "rgba(0,255,157,0.06)";
        ctx.fillRect(0, 0, W, 120);
        ctx.font = "bold 28px 'Share Tech Mono', monospace";
        ctx.fillStyle = "#3a6b52";
        ctx.fillText("// HackOS — AULA DE PROGRAMACAO", PAD, 56);
        ctx.strokeStyle = "#00ff9d";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(PAD, 82); ctx.lineTo(W - PAD, 82); ctx.stroke();

        // Título
        ctx.font = "bold 96px Rajdhani, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(slide.title, PAD, 200);
        const tw = ctx.measureText(slide.title).width;
        ctx.fillStyle = "#00ff9d";
        ctx.fillRect(PAD, 212, Math.min(tw, W - PAD * 2), 5);

        // Linhas de conteúdo
        const lineH = 68;
        ctx.font = "42px 'Share Tech Mono', monospace";
        slide.lines.forEach((line, i) => {
            ctx.fillStyle = "#00ff9d";
            ctx.fillText(">", PAD, 306 + i * lineH);
            ctx.fillStyle = "#b0ffd8";
            ctx.fillText(line, PAD + 52, 306 + i * lineH);
        });

        // Bloco de código
        if (slide.code) {
            const codeLines = slide.code.split("\n");
            const codeLineH = 54;
            const codeTopY  = 306 + slide.lines.length * lineH + 40;
            const codeH     = codeLines.length * codeLineH + 50;
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(PAD - 12, codeTopY - 14, W - (PAD - 12) * 2, codeH);
            ctx.strokeStyle = "#0d2e1c";
            ctx.lineWidth = 2;
            ctx.strokeRect(PAD - 12, codeTopY - 14, W - (PAD - 12) * 2, codeH);
            ctx.font = "bold 24px 'Share Tech Mono', monospace";
            ctx.fillStyle = "#3a6b52";
            ctx.fillText("// codigo", PAD, codeTopY + 22);
            ctx.font = "38px 'Share Tech Mono', monospace";
            codeLines.forEach((line, i) => {
                ctx.fillStyle = "#3a6b52";
                ctx.fillText(String(i + 1).padStart(2, " "), PAD, codeTopY + 62 + i * codeLineH);
                ctx.fillStyle = "#f0b90b";
                ctx.fillText(line, PAD + 68, codeTopY + 62 + i * codeLineH);
            });
        }

        // Rodapé
        const total = this.lesson?.slides.length ?? 1;
        ctx.fillStyle = "rgba(0,255,157,0.06)";
        ctx.fillRect(0, H - 80, W, 80);
        ctx.strokeStyle = "#0d2e1c";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, H - 80); ctx.lineTo(W, H - 80); ctx.stroke();
        ctx.font = "30px 'Share Tech Mono', monospace";
        ctx.fillStyle = "#3a6b52";
        ctx.fillText(this.lesson?.title ?? "", PAD, H - 26);
        const pageText = `${this.slideIdx + 1} / ${total}`;
        ctx.fillStyle = "#00ff9d";
        ctx.fillText(pageText, W - PAD - ctx.measureText(pageText).width, H - 26);

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
        const geo  = new PlaneGeometry(10.0, 5.6);   // tela projetor grande
        const mat  = new MeshBasicMaterial({ map: tex, transparent: false });
        this.slideMesh = new Mesh(geo, mat);

        // Fundo do palco, elevado — visível de toda a plateia
        this.slideMesh.position.set(0, 4.5, -3.5);
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
            window.HUD?.notify("Prof. Chico já está ocupado.", "warn");
            return;
        }

        this.lesson = lesson;
        this.tState = "WALKING";
        this.isControlledLocally = true;  // este cliente passa a controlar o NPC

        // Caminho definido em Path.ts — ajuste sem tocar aqui
        this.buildNamedPath("teacher-to-stage");
        this.setAnimation(this.animationsAction["Walk"]);

        window.HUD?.notify(`🎓 Prof. Chico indo ao palco: ${lesson.title}`, "info");
        showInstruction("📚 Aula", `Prof. Chico vai ensinar: ${lesson.title}`);
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
        this.isControlledLocally = false;  // libera controle ao encerrar
        this.buildNamedPath("teacher-to-idle");
        this.setAnimation(this.animationsAction["Walk"]);

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
            showInstruction("🎓 Prof. Chico", "Aqui está seu notebook! Pressione T para abrir.");
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
        el.textContent = "🎓 Prof. Chico";
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
        const geo   = new PlaneGeometry(10.0, 5.6);
        const mat   = new MeshBasicMaterial({ map: tex, transparent: false });
        this.slideMesh = new Mesh(geo, mat);
        this.slideMesh.position.set(0, 4.5, -3.5);
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