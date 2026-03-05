/**
 * TeacherNPC.ts
 *
 * Animações : idêntico ao PlayerModel — usa loading.globalAnimations
 * Movimento : idêntico ao NPC.ts      — followPath + slerp
 * Slides    : malha 3D (PlaneGeometry + CanvasTexture) acima do palco
 *
 * Acionamento (apenas admin):
 *   teach intro-c | teach conditionals | teach loops
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
import { eventEmitter, showInstruction } from "./Actions";
import { infoPlayer } from "./InfoPlayer";

// ── Dados dos slides ──────────────────────────────────────────────────────────

export type Slide = { title: string; lines: string[]; code?: string };
export type Lesson = { id: string; title: string; slides: Slide[] };

export const LESSONS: Lesson[] = [
    {
        id: "intro-c", title: "Introdução à Linguagem C",
        slides: [
            { title: "O que é C?", lines: ["Linguagem criada em 1972.", "Base de SOs, drivers e embarcados.", "Rápida e próxima ao hardware."] },
            { title: "Estrutura básica", lines: ["Todo programa precisa de main().", "Execução de cima para baixo.", "Cada instrução termina com ;"], code: '#include <stdio.h>\nint main() {\n    printf("Ola!\\n");\n    return 0;\n}' },
            { title: "Variáveis", lines: ["Declara tipo antes de usar.", "Tipos: int, float, char"], code: "int x = 10;\nfloat pi = 3.14;\nchar c = 'A';" },
            { title: "printf / scanf", lines: ["printf() exibe na tela.", "scanf() lê entrada.", "%d int  %f float  %c char"], code: 'int n;\nscanf("%d",&n);\nprintf("%d\\n",n);' },
        ]
    },
    {
        id: "conditionals", title: "Condicionais em C",
        slides: [
            { title: "if", lines: ["Executa se condição for verdadeira.", "Verdadeiro = qualquer valor != 0."], code: "if (x > 5) {\n    printf(\"maior\\n\");\n}" },
            { title: "if / else", lines: ["else executa quando if é falso.", "else if para múltiplas condições."], code: 'if (nota>=7)\n    printf("Aprovado\\n");\nelse\n    printf("Reprovado\\n");' },
            { title: "Comparação", lines: ["==  igual    !=  diferente", ">   maior    <   menor", ">=  maior/igual  <=  menor/igual"], code: "if (a != b)\n    printf(\"diferentes\\n\");" },
            { title: "Lógicos", lines: ["&&  E lógico", "||  OU lógico", "!   NÃO lógico"], code: "if (idade>=18 && carteira)\n    printf(\"Pode dirigir\\n\");" },
        ]
    },
    {
        id: "loops", title: "Loops em C",
        slides: [
            { title: "while", lines: ["Repete enquanto condição for verdadeira.", "Cuidado com loop infinito!"], code: "int i=0;\nwhile(i<5){\n    printf(\"%d\\n\",i);\n    i++;\n}" },
            { title: "for", lines: ["Ideal para repetições fixas.", "for(inicio; condicao; incremento)"], code: "for(int i=0;i<10;i++)\n    printf(\"%d\\n\",i);" },
            { title: "break / continue", lines: ["break   → sai do loop", "continue → pula iteração"], code: "for(int i=0;i<10;i++){\n    if(i==5) break;\n    if(i%2==0) continue;\n    printf(\"%d\\n\",i);\n}" },
            { title: "Aninhados", lines: ["Loop dentro de loop.", "Útil para tabelas/matrizes."], code: "for(int i=1;i<=3;i++){\n  for(int j=1;j<=3;j++)\n    printf(\"%d \",i*j);\n  printf(\"\\n\");\n}" },
        ]
    },
];

// ── Tipo de estado ────────────────────────────────────────────────────────────
type TState = "IDLE" | "WALKING" | "TEACHING" | "RETURNING";

// ── TeacherNPC ────────────────────────────────────────────────────────────────
export class TeacherNPC extends YUKA.Vehicle {

    // Three.js
    npcMesh?: Object3D;
    mixer?:   AnimationMixer;
    private animationsAction: Record<string, AnimationAction> = {};
    private activedClip?: AnimationAction;

    // Cena/Loading
    scene:   Scene;
    loading: Loading;
    private playerModel?: Object3D;

    // Posições
    private readonly IDLE_POS  = new YUKA.Vector3(-5, 0, 25);
    private readonly STAGE_POS = new YUKA.Vector3( 0, 0,  0);

    // Yuka path (igual NPC.ts)
    private yukaPath      = new YUKA.Path();
    private paused        = false;
    private targetRot     = new Object3D();

    // Estado
    private tState: TState = "IDLE";

    // Slides
    private lesson?:       Lesson;
    private slideIdx       = 0;
    private slideTimer     = 0;
    private slideDuration  = 20;
    private slideMesh?:    Mesh;

    // Notebook
    private notebookGiven = false;
    private readonly NOTEBOOK_RADIUS = 3.5;

    constructor(scene: Scene, loading: Loading, playerModel?: Object3D) {
        super();
        this.scene       = scene;
        this.loading     = loading;
        this.playerModel = playerModel;
        this.maxSpeed    = 3.5;
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
                this.npcMesh!.scale.set(1.1, 1.1, 1.1);
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
            (err) => console.error("[TeacherNPC] Erro:", err)
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

        // Rotação suave
        this.targetRot.position.copy(this.npcMesh.position);
        this.targetRot.lookAt(target);
        this.npcMesh.quaternion.slerp(this.targetRot.quaternion, delta * 9.0);

        // Movimento lerp
        const pos = this.npcMesh.position.clone().lerp(target, delta * this.maxSpeed * 0.3);

        if (pos.distanceTo(target) < 0.4) {
            if (this.yukaPath.finished()) {
                this.npcMesh.position.copy(target);
                this.position.set(target.x, target.y, target.z);
                this.onArrived();
                return;
            }
            this.yukaPath.advance();
        }

        this.npcMesh.position.copy(pos);
        this.position.set(pos.x, pos.y, pos.z);
    }

    private buildPath(from: YUKA.Vector3, to: YUKA.Vector3) {
        this.yukaPath = new YUKA.Path();
        this.yukaPath.add(from.clone());
        this.yukaPath.add(to.clone());
        this.yukaPath.advance();
        this.paused = false;
    }

    private onArrived() {
        this.paused = true;
        this.setAnimation(this.animationsAction["Idle"]);

        if (this.tState === "WALKING") {
            this.tState = "TEACHING";
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
        const W = 1024, H = 640;
        const canvas = document.createElement("canvas");
        canvas.width  = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d")!;

        // Fundo
        ctx.fillStyle = "#0b0b0b";
        ctx.fillRect(0, 0, W, H);

        // Borda verde
        ctx.strokeStyle = "#00ff9d";
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, W - 8, H - 8);

        // Badge superior
        ctx.fillStyle = "#00ff9d";
        ctx.fillRect(40, 36, 180, 4);
        ctx.font = "bold 18px 'Share Tech Mono', monospace";
        ctx.fillStyle = "#3a6b52";
        ctx.fillText("HackOS  AULA", 40, 30);

        // Título
        ctx.font = "bold 52px Rajdhani, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(slide.title, 40, 110);

        // Linhas de conteúdo
        ctx.font = "26px 'Share Tech Mono', monospace";
        ctx.fillStyle = "#b0ffd8";
        slide.lines.forEach((line, i) => {
            ctx.fillText(line, 40, 175 + i * 40);
        });

        // Bloco de código (se houver)
        if (slide.code) {
            const codeY = 175 + slide.lines.length * 40 + 20;
            ctx.fillStyle = "rgba(0,255,157,0.06)";
            ctx.fillRect(32, codeY - 4, W - 64, slide.code.split("\n").length * 34 + 16);
            ctx.strokeStyle = "#0d2e1c";
            ctx.lineWidth = 1;
            ctx.strokeRect(32, codeY - 4, W - 64, slide.code.split("\n").length * 34 + 16);
            ctx.font = "24px 'Share Tech Mono', monospace";
            ctx.fillStyle = "#f0b90b";
            slide.code.split("\n").forEach((line, i) => {
                ctx.fillText(line, 48, codeY + 28 + i * 34);
            });
        }

        // Rodapé com número do slide
        const total = this.lesson?.slides.length ?? 1;
        ctx.font = "18px 'Share Tech Mono', monospace";
        ctx.fillStyle = "#3a6b52";
        ctx.fillText(
            `${slide.title}  ·  ${this.slideIdx + 1} / ${total}`,
            40, H - 24
        );

        return new CanvasTexture(canvas);
    }

    private showSlide(idx: number) {
        if (!this.lesson) return;
        this.slideIdx = idx;
        const slide   = this.lesson.slides[idx];

        // Remove slide anterior
        if (this.slideMesh) {
            this.scene.remove(this.slideMesh);
            this.slideMesh.geometry.dispose();
            (this.slideMesh.material as MeshBasicMaterial).map?.dispose();
            (this.slideMesh.material as MeshBasicMaterial).dispose();
        }

        // Cria novo painel 3D acima do palco (3.2 unidades de largura, 2 de altura)
        const tex  = this.buildSlideTexture(slide);
        const geo  = new PlaneGeometry(4.8, 3.0);
        const mat  = new MeshBasicMaterial({ map: tex, transparent: false });
        this.slideMesh = new Mesh(geo, mat);

        // Posição: ligeiramente atrás do NPC no palco, altura da cabeça
        this.slideMesh.position.set(0, 2.8, -1.5);
        this.slideMesh.rotation.y = 0; // voltado para a plateia
        this.scene.add(this.slideMesh);

        // Emite evento (Editor C preenche o código automaticamente)
        eventEmitter.dispatchEvent(new CustomEvent("teacher:slide", {
            detail: { slide, index: idx, total: this.lesson.slides.length, lesson: this.lesson }
        }));

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

        this.lesson  = lesson;
        this.tState  = "WALKING";

        const from = this.npcMesh
            ? new YUKA.Vector3(this.npcMesh.position.x, 0, this.npcMesh.position.z)
            : this.IDLE_POS.clone();

        this.buildPath(from, this.STAGE_POS);
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

        const from = this.npcMesh
            ? new YUKA.Vector3(this.npcMesh.position.x, 0, this.npcMesh.position.z)
            : this.STAGE_POS.clone();

        this.buildPath(from, this.IDLE_POS);
        this.setAnimation(this.animationsAction["Walk"]);

        eventEmitter.dispatchEvent(new CustomEvent("lesson:complete", {
            detail: { lessonId: this.lesson?.id }
        }));
        window.HUD?.notify("✅ Aula encerrada! Pratique no terminal.", "success");
        showInstruction("✅ Aula concluída", "Abra o terminal e resolva o desafio de C.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NOTEBOOK
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
    // LABEL 2D
    // ─────────────────────────────────────────────────────────────────────────
    private addLabel() {
        if (document.getElementById("__teacher-label")) return;
        const el = document.createElement("div");
        el.id = "__teacher-label";
        Object.assign(el.style, {
            position: "fixed", pointerEvents: "none", zIndex: "50",
            fontFamily: "'Rajdhani',sans-serif", fontSize: "12px",
            fontWeight: "700", color: "#f0b90b",
            textShadow: "0 0 8px rgba(240,185,11,0.5)",
            background: "rgba(0,0,0,0.55)", padding: "2px 8px",
            borderRadius: "3px", display: "none",
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
    // UPDATE — chamado pelo entityManager (igual NPC.ts)
    // ─────────────────────────────────────────────────────────────────────────
    override update(delta: number): this {
        super.update(delta);
        this.mixer?.update(delta);

        // corrige root motion (igual PlayerModel.update)
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

    // Chamado no loop do Experience apenas para o label 2D
    tick(camera: any) { this.updateLabel(camera); }

    // ─────────────────────────────────────────────────────────────────────────
    // GETTERS / CONFIG
    // ─────────────────────────────────────────────────────────────────────────
    get isIdle()     { return this.tState === "IDLE"; }
    get isTeaching() { return this.tState === "TEACHING"; }

    setPlayerModel(m: Object3D) { this.playerModel = m; }
    setSlideDuration(s: number) { this.slideDuration = s; }

    dispose() {
        this.removeSlide();
        if (this.npcMesh) this.scene.remove(this.npcMesh);
        document.getElementById("__teacher-label")?.remove();
    }
}

export default TeacherNPC;