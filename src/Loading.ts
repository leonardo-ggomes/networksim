import { AnimationClip, LoadingManager, TextureLoader } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default class Loading
{
    manager: LoadingManager
    dracoLoader: DRACOLoader
    loader: GLTFLoader
    textureLoader: TextureLoader
    globalAnimations: { [key: string]: AnimationClip } = {}

    constructor()
    {      
        this.manager = new LoadingManager();

        this.dracoLoader = new DRACOLoader(this.manager)
        this.loader = new GLTFLoader(this.manager)
        this.textureLoader = new TextureLoader(this.manager)
        
        this.dracoLoader.setDecoderPath("draco/")
        this.loader.setDRACOLoader(this.dracoLoader)

        this.loadGlobalAnimations()
    }

    private showProgressBar()
    {
        // ── Keyframes e fontes (injetados uma única vez) ──────────────────────
        if (!document.getElementById("__ls")) {
            const st = document.createElement("style");
            st.id = "__ls";
            st.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');

                @keyframes __scan {
                    from { transform: translateY(-100%); }
                    to   { transform: translateY(100vh); }
                }
                @keyframes __blink {
                    0%,100% { opacity:1; } 50% { opacity:0; }
                }
                @keyframes __tip-slide {
                    from { opacity:0; transform:translateY(6px); }
                    to   { opacity:1; transform:translateY(0); }
                }
                @keyframes __bar-glow {
                    0%,100% { box-shadow: 0 0 10px rgba(240,185,11,.5); }
                    50%     { box-shadow: 0 0 22px rgba(240,185,11,.9); }
                }
                @keyframes __overlay-out {
                    to { opacity:0; pointer-events:none; }
                }
            `;
            document.head.appendChild(st);
        }

        // ── Dicas rotativas ───────────────────────────────────────────────────
        const tips = [
            "Pressione TAB para abrir o menu de ações rápidas.",
            "Use o terminal para executar comandos no servidor remoto.",
            "Pressione F próximo a uma cadeira para sentar.",
            "Ative a lanterna com L para iluminar áreas escuras.",
            "Use kill -9 [PID] para encerrar processos suspeitos.",
            "Fique atento às notificações de missão no canto superior.",
            "Conecte-se remotamente a outros dispositivos pelo terminal.",
            "Pressione ESC para fechar qualquer menu aberto.",
        ];

        // ── Container fullscreen ──────────────────────────────────────────────
        const ov = document.createElement("div");
        Object.assign(ov.style, {
            position:      "fixed",
            inset:         "0",
            zIndex:        "99999",
            background:    "#000",
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            fontFamily:    "'Rajdhani', sans-serif",
        });

        // Gradiente de fundo
        const bg = document.createElement("div");
        Object.assign(bg.style, {
            position:   "absolute",
            inset:      "0",
            background: `
                radial-gradient(ellipse 100% 60% at 50% 110%, rgba(240,185,11,.055) 0%, transparent 55%),
                linear-gradient(170deg, #02050a 0%, #050a05 50%, #000 100%)
            `,
            pointerEvents: "none",
        });
        ov.appendChild(bg);

        // Grade perspectiva sutil
        const grid = document.createElement("div");
        Object.assign(grid.style, {
            position:        "absolute",
            inset:           "0",
            backgroundImage: `
                linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)
            `,
            backgroundSize:  "52px 52px",
            maskImage:       "radial-gradient(ellipse 85% 85% at 50% 50%, black 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 85% 85% at 50% 50%, black 30%, transparent 80%)",
            pointerEvents:   "none",
        });
        ov.appendChild(grid);

        // Scanline animada
        const scan = document.createElement("div");
        Object.assign(scan.style, {
            position:      "absolute",
            left:          "0", right: "0",
            height:        "140px",
            background:    "linear-gradient(180deg, transparent 0%, rgba(240,185,11,.028) 50%, transparent 100%)",
            animation:     "__scan 5s linear infinite",
            pointerEvents: "none",
        });
        ov.appendChild(scan);

        // Vinheta lateral esquerda (linha de luz)
        const lline = document.createElement("div");
        Object.assign(lline.style, {
            position:   "absolute",
            top:        "0", bottom: "0", left: "7%",
            width:      "1px",
            background: "linear-gradient(180deg, transparent, rgba(240,185,11,.07) 40%, rgba(240,185,11,.1) 50%, rgba(240,185,11,.07) 60%, transparent)",
            pointerEvents: "none",
        });
        ov.appendChild(lline);

        // ── Área central: logo/título ─────────────────────────────────────────
        const center = document.createElement("div");
        Object.assign(center.style, {
            flex:           "1",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            gap:            "0",
            position:       "relative",
            zIndex:         "1",
        });
        ov.appendChild(center);

        // Eyebrow
        const eyebrow = document.createElement("div");
        Object.assign(eyebrow.style, {
            fontFamily:    "'Share Tech Mono', monospace",
            fontSize:      "10px",
            letterSpacing: ".35em",
            textTransform: "uppercase",
            color:         "rgba(240,185,11,.5)",
            marginBottom:  "14px",
        });
        eyebrow.textContent = "// carregando sessão";
        center.appendChild(eyebrow);

        // Título principal
        const title = document.createElement("div");
        Object.assign(title.style, {
            fontSize:      "clamp(52px, 8vw, 96px)",
            fontWeight:    "700",
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color:         "#fff",
            lineHeight:    ".9",
            textAlign:     "center",
        });
        title.innerHTML = `NETWORK<span style="color:#f0b90b">SIM</span>`;
        center.appendChild(title);

        // Subtítulo
        const sub = document.createElement("div");
        Object.assign(sub.style, {
            fontFamily:    "'Share Tech Mono', monospace",
            fontSize:      "11px",
            letterSpacing: ".22em",
            color:         "rgba(255,255,255,.18)",
            marginTop:     "18px",
            textTransform: "uppercase",
        });
        sub.textContent = "Simulador Multiplayer · Ambiente 3D";
        center.appendChild(sub);

        // ── Bloco inferior: dica + barra ──────────────────────────────────────
        const bottom = document.createElement("div");
        Object.assign(bottom.style, {
            position: "relative",
            zIndex:   "1",
            padding:  "0 60px 44px",
        });
        ov.appendChild(bottom);

        // Linha divisória
        const divider = document.createElement("div");
        Object.assign(divider.style, {
            height:       "1px",
            background:   "linear-gradient(90deg, rgba(240,185,11,.35), rgba(240,185,11,.08), transparent)",
            marginBottom: "22px",
        });
        bottom.appendChild(divider);

        // Dica — label
        const tipLabel = document.createElement("div");
        Object.assign(tipLabel.style, {
            fontFamily:    "'Share Tech Mono', monospace",
            fontSize:      "9px",
            letterSpacing: ".25em",
            textTransform: "uppercase",
            color:         "rgba(240,185,11,.45)",
            marginBottom:  "5px",
        });
        tipLabel.textContent = "DICA DO JOGO";
        bottom.appendChild(tipLabel);

        // Dica — texto rotativo
        const tipEl = document.createElement("div");
        Object.assign(tipEl.style, {
            fontSize:      "14px",
            fontWeight:    "500",
            color:         "rgba(255,255,255,.45)",
            letterSpacing: ".02em",
            marginBottom:  "26px",
            minHeight:     "20px",
            animation:     "__tip-slide .4s ease both",
        });
        tipEl.textContent = tips[0];
        bottom.appendChild(tipEl);

        // Roda dicas a cada 3s
        let tipIdx = 0;
        const tipTimer = setInterval(() => {
            tipIdx = (tipIdx + 1) % tips.length;
            tipEl.style.animation = "none";
            void (tipEl.offsetWidth); // reflow
            tipEl.style.animation = "__tip-slide .4s ease both";
            tipEl.textContent = tips[tipIdx];
        }, 3200);

        // ── Linha com status + barra + % ─────────────────────────────────────
        const row = document.createElement("div");
        Object.assign(row.style, {
            display:        "flex",
            alignItems:     "flex-end",
            justifyContent: "space-between",
            gap:            "32px",
        });
        bottom.appendChild(row);

        // Status (esquerda)
        const statusWrap = document.createElement("div");
        Object.assign(statusWrap.style, { flexShrink: "0" });
        row.appendChild(statusWrap);

        const statusLabel = document.createElement("div");
        Object.assign(statusLabel.style, {
            fontFamily:    "'Share Tech Mono', monospace",
            fontSize:      "9px",
            letterSpacing: ".2em",
            color:         "rgba(255,255,255,.2)",
            marginBottom:  "5px",
            textTransform: "uppercase",
        });
        statusLabel.textContent = "STATUS";
        statusWrap.appendChild(statusLabel);

        const statusText = document.createElement("div");
        Object.assign(statusText.style, {
            fontSize:      "18px",
            fontWeight:    "700",
            letterSpacing: ".05em",
            textTransform: "uppercase",
            color:         "#fff",
            display:       "flex",
            alignItems:    "center",
            gap:           "8px",
            whiteSpace:    "nowrap",
        });

        // Cursor piscante estilo terminal
        const cursor = document.createElement("span");
        Object.assign(cursor.style, {
            display:       "inline-block",
            width:         "2px",
            height:        "18px",
            background:    "#f0b90b",
            animation:     "__blink .75s step-end infinite",
            verticalAlign: "middle",
            flexShrink:    "0",
        });
        statusText.appendChild(document.createTextNode("Inicializando"));
        statusText.appendChild(cursor);
        statusWrap.appendChild(statusText);

        // Barra + % (direita)
        const barWrap = document.createElement("div");
        Object.assign(barWrap.style, {
            flex:          "1",
            display:       "flex",
            flexDirection: "column",
            alignItems:    "flex-end",
            gap:           "7px",
        });
        row.appendChild(barWrap);

        // Porcentagem
        const pct = document.createElement("div");
        Object.assign(pct.style, {
            fontFamily:    "'Share Tech Mono', monospace",
            fontSize:      "14px",
            color:         "#f0b90b",
            letterSpacing: ".1em",
        });
        pct.textContent = "0%";
        barWrap.appendChild(pct);

        // Track — clip-path nos cantos estilo GTA V
        const track = document.createElement("div");
        Object.assign(track.style, {
            width:    "100%",
            height:   "5px",
            clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
            background: "rgba(255,255,255,.07)",
            position:   "relative",
            overflow:   "hidden",
        });
        barWrap.appendChild(track);

        // Fill da barra
        const fill = document.createElement("div");
        Object.assign(fill.style, {
            position:   "absolute",
            inset:      "0",
            width:      "0%",
            background: "linear-gradient(90deg, #b8830a, #f0b90b, #ffe37a)",
            transition: "width .3s cubic-bezier(.4,0,.2,1)",
            animation:  "__bar-glow 1.8s ease-in-out infinite",
        });
        track.appendChild(fill);

        // Contador de arquivos abaixo da barra
        const fileInfo = document.createElement("div");
        Object.assign(fileInfo.style, {
            fontFamily:    "'Share Tech Mono', monospace",
            fontSize:      "9px",
            color:         "rgba(255,255,255,.18)",
            letterSpacing: ".08em",
        });
        fileInfo.textContent = "Aguardando assets…";
        barWrap.appendChild(fileInfo);

        document.body.appendChild(ov);

        // Fases de status que rotacionam enquanto carrega
        const phases = [
            "Inicializando", "Carregando modelos",
            "Compilando shaders", "Construindo octree", "Quase pronto",
        ];
        let phaseIdx = 0;
        const phaseTimer = setInterval(() => {
            phaseIdx = Math.min(phaseIdx + 1, phases.length - 1);
            statusText.childNodes[0].textContent = phases[phaseIdx];
        }, 1600);

        // Guarda referências para o start() atualizar
        (ov as any).__tipTimer   = tipTimer;
        (ov as any).__phaseTimer = phaseTimer;
        (ov as any).__pct        = pct;
        (ov as any).__fileInfo   = fileInfo;
        (ov as any).__statusText = statusText;

        return [ov, fill];
    }

    start(callback: Function)
    {
        const [container, loadingBar] = this.showProgressBar();
        const pct      = (container as any).__pct      as HTMLElement;
        const fileInfo = (container as any).__fileInfo as HTMLElement;

        this.manager.onProgress = (_url: string, loaded: number, total: number) => {
            const progress = (loaded / total) * 100;
            loadingBar.style.width = progress + "%";
            pct.textContent        = Math.round(progress) + "%";
            fileInfo.textContent   = `${loaded} / ${total} arquivos`;
        };

        this.manager.onLoad = () => {
            // Completa a barra antes de sumir
            loadingBar.style.width = "100%";
            pct.textContent        = "100%";

            clearInterval((container as any).__tipTimer);
            clearInterval((container as any).__phaseTimer);

            const statusText = (container as any).__statusText as HTMLElement;
            statusText.childNodes[0].textContent = "Pronto";

            (document.getElementById("status-server") as HTMLDivElement).style.display = "block";
            (document.getElementById("instruction")   as HTMLDivElement).style.display = "block";

            // Fade out suave antes de remover
            setTimeout(() => {
                container.style.transition = "opacity .6s ease";
                container.style.opacity    = "0";
                setTimeout(() => {
                    container.remove();
                    callback();
                }, 620);
            }, 400);
        };
    }

    async loadGlobalAnimations() {

        return await new Promise<void>(async (resolve) => {

            const animations = await Promise.all([
                this.loader.loadAsync("models/asian_male_animated@base.glb"),              
                this.loader.loadAsync("models/asian_male_animated@crounch_flashlight.glb"),              
                this.loader.loadAsync("models/asian_male_animated@crouch_back.glb"),
                this.loader.loadAsync("models/asian_male_animated@crouch_run.glb"),
                this.loader.loadAsync("models/asian_male_animated@crouch_walk_right.glb"),
                this.loader.loadAsync("models/asian_male_animated@crouch_walk_left.glb"),              
                this.loader.loadAsync("models/asian_male_animated@sitting.glb"),              
                this.loader.loadAsync("models/asian_male_animated@backward.glb"),              
                this.loader.loadAsync("models/asian_male_animated@walk_left.glb"),              
                this.loader.loadAsync("models/asian_male_animated@walk_right.glb"),              
            ]);
    
            this.globalAnimations = {
                "Waving":     animations[0].animations[0],
                "Idle":       animations[0].animations[1],
                "Walk":       animations[0].animations[4],
                "Running":    animations[0].animations[3],
                "Sitting":    animations[6].animations[0],
                "Crouch":     animations[5].animations[0],
                "CrouchIdle": animations[6].animations[0],
                "Backward":   animations[7].animations[0],
                "CrouchBack": animations[2].animations[0],
                "CrouchRun":  animations[3].animations[0],
                "CrouchRight":animations[4].animations[0],
                "CrouchLeft": animations[5].animations[0],
                "WalkRight":  animations[9].animations[0],
                "WalkLeft":   animations[8].animations[0]
            };

            resolve()
        })
    }
}