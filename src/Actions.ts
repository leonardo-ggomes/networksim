import { CCompiler } from "./Compiler";
import { infoPlayer, othersPlayers, roles } from "./InfoPlayer";
import SocketManager from "./SocketManager";


//Compartilhado globalmente
export const eventEmitter = new EventTarget();


//Processes
type Process = { pid:number; user:string; cpu:number; mem:number; command:string; state:string };
const processes: Process[] = [
    { pid:    1, user:"root",   cpu:0.0, mem:0.1, command:"systemd",               state:"S" },
    { pid:  312, user:"root",   cpu:0.0, mem:0.0, command:"kthreadd",              state:"S" },
    { pid:  891, user:"root",   cpu:0.1, mem:0.3, command:"sshd",                  state:"S" },
    { pid: 1042, user:"root",   cpu:0.0, mem:0.2, command:"cron",                  state:"S" },
    { pid: 2048, user:"hackos", cpu:1.4, mem:2.1, command:"hackos-kernel",         state:"R" },
    { pid: 2049, user:"hackos", cpu:0.8, mem:1.7, command:"edu-server --port 443", state:"S" },
    { pid: 2201, user:"hackos", cpu:0.2, mem:0.9, command:"mission-manager",       state:"S" },
    { pid: 3310, user:"player", cpu:2.9, mem:3.4, command:"bash",                  state:"R" },
    { pid: 3311, user:"player", cpu:0.0, mem:0.6, command:"nano",                  state:"S" },
    { pid: 4096, user:"player", cpu:5.1, mem:4.2, command:"gcc hello.c -o hello",  state:"R" },
    { pid: 5500, user:"player", cpu:0.3, mem:1.1, command:"node index.js",         state:"S" },
    { pid: 7777, user:"root",   cpu:0.0, mem:0.1, command:"watchdog/0",            state:"I" },
];
function _tickProcesses() {
    processes.forEach(p => {
        p.cpu = Math.max(0, Math.min(99, p.cpu + (Math.random() - 0.5) * 0.8));
        p.mem = Math.max(0, Math.min(99, p.mem + (Math.random() - 0.5) * 0.3));
    });
}
setInterval(_tickProcesses, 1200);

// Variáveis de estado
let isCollided = false;


type RadialAction = {
    label: string;
    value: string;
    onSelect: () => void;
};  

export type file = {
    name: string,
    content: string
}

export type dir = {
    name: string,
    contentFile: file[],
    contentDir: string[]
}

const rootPath = "/"
export let diretories: { [key: string]: dir } = {}
export let remoteDiretories: { [key: string]: dir } = {}
export let systemDirs = ["bin", "home", "var"]


//Inicializa o diretório root com algumas pastas
diretories[rootPath] = {
    name: rootPath,
    contentFile: [],
    contentDir: []
}

systemDirs.forEach(sysdir => {
    diretories[rootPath].contentDir.push(sysdir)
    diretories[`${rootPath}${sysdir}/`] = {
        name: sysdir,
        contentFile: [],
        contentDir: []
    }
})

//Configurações do servidor remoto e prefixos
export let isRemotelyConnected = false;
let serverAddressRemote = "server@2025"
let serverPrefix = "user@server:~$ "; // Prefixo dinâmico do server
let localPrefix = "player@local:~$ "; // Prefixo dinâmico local
let currentPrefix = localPrefix; // Prefixo dinâmico do terminal
let currentDir = "/";

// Funções globais
let elementos = {
    showTerminal: createTerminal,
    hideTerminal: () => {
        removeElement('terminal')
        removeElement('framescreen')
    },
    setIsCollided: (state: boolean) => { isCollided = state; },
    setCurrentMission: (currentMission: string) => { (window as any).HUD?.setMission(currentMission, currentMission, ''); },
    setProcesses: (name: string, pid: number, memory: number, cpu: number) => {
        processes.push({
            command: name,
            pid: pid,
            mem: memory,
            cpu: cpu,
            user: "default",
            state: "R"
        })
    },
    setFilesInMission: (dirPath = rootPath, name: string, content: string) => {

        const missionFile: file = {
            name,
            content
        }

        diretories[dirPath].contentFile.push(missionFile)
    },
    showMsg: (msg: string) => {
        (window as any).HUD?.notify(msg, 'success');
    }
};

// Criar o terminal — dispositivo estilo GTA V

// ─────────────────────────────────────────────────────────────────────────────
// TERMINAL ENGINE — typewriter · glitch · missões · histórico · cores · CRT
// ─────────────────────────────────────────────────────────────────────────────

const cmdHistory: string[] = [];
let   cmdHistoryIdx = -1;

type OutputType = "default"|"success"|"error"|"info"|"warn"|"system"|"mission";
const OUTPUT_COLORS: Record<OutputType,string> = {
    default: "#c8fce8",
    success: "#4ade80",
    error:   "#f87171",
    info:    "#7df9e8",
    warn:    "#fbbf24",
    system:  "#6b7280",
    mission: "#a78bfa",
};

function detectOutputType(text: string): OutputType {
    if (!text) return "default";
    const t = text.toLowerCase();
    if (t.startsWith("erro") || t.startsWith("error") || t.includes("não encontrado") || t.includes("não existe")) return "error";
    if (t.startsWith("✓") || t.includes("criado") || t.includes("atualizado") || t.includes("sucesso") || t.includes("conectado")) return "success";
    if (t.startsWith("⚠") || t.includes("aviso")) return "warn";
    if (t.startsWith("[missão]") || t.startsWith("▸") || t.startsWith("◈")) return "mission";
    if (t.startsWith("//") || t.startsWith("hackos") || t.startsWith("kernel") ||
        t.startsWith("montando") || t.startsWith("inicializando") || t.startsWith("conexão") ||
        t.startsWith("detectando") || t.startsWith("carregando")) return "system";
    return "default";
}

// Typewriter: imprime texto letra por letra
function typewriterAppend(text: string, terminal: HTMLDivElement, type: OutputType = "default", onDone?: () => void) {
    const lines = text.split("\n");
    let li = 0;
    function nextLine() {
        if (li >= lines.length) { onDone?.(); return; }
        const line = lines[li++];
        const lt   = detectOutputType(line) !== "default" ? detectOutputType(line) : type;
        const div  = document.createElement("div");
        div.style.color      = OUTPUT_COLORS[lt];
        div.style.minHeight  = "1.2em";
        div.style.fontFamily = "'Share Tech Mono', monospace";
        div.style.fontSize   = "12px";
        terminal.appendChild(div);
        terminal.scrollTop   = terminal.scrollHeight;
        if (!line.trim()) { nextLine(); return; }
        // Linhas de sistema saem de uma vez (mais rápido, sem digitar)
        if (lt === "system" || line.startsWith(" ")) { div.textContent = line; setTimeout(nextLine, 18); return; }
        let ci = 0;
        function nextChar() {
            if (ci < line.length) {
                div.textContent += line[ci++];
                terminal.scrollTop = terminal.scrollHeight;
                setTimeout(nextChar, 16);
            } else {
                setTimeout(nextLine, 10);
            }
        }
        nextChar();
    }
    nextLine();
}

// Glitch: corrompe visualmente o terminal por ~800ms
function triggerGlitch(terminal: HTMLDivElement) {
    const el    = terminal.parentElement ?? terminal;
    const chars = "!@#$%^&*░▒▓█▀▄╗╔╝╚╬";
    const noise: HTMLDivElement[] = [];
    for (let i = 0; i < 3; i++) {
        const n = document.createElement("div");
        n.style.color      = "#f87171";
        n.style.opacity    = "0.7";
        n.style.fontFamily = "'Share Tech Mono',monospace";
        n.style.fontSize   = "11px";
        n.textContent = Array.from({length: 40 + (Math.random()*20|0)},
            () => chars[Math.random()*chars.length|0]).join("");
        terminal.appendChild(n);
        noise.push(n);
    }
    terminal.scrollTop = terminal.scrollHeight;
    let frames = 0;
    const iv = setInterval(() => {
        noise.forEach(n => {
            n.textContent = Array.from({length: 40 + (Math.random()*20|0)},
                () => chars[Math.random()*chars.length|0]).join("");
        });
        el.style.transform = `translate(${(Math.random()-.5)*8}px,${(Math.random()-.5)*4}px)`;
        el.style.filter    = `hue-rotate(${Math.random()*60}deg) brightness(1.2)`;
        if (++frames > 10) {
            clearInterval(iv);
            noise.forEach(n => n.remove());
            el.style.transform = "";
            el.style.filter    = "";
        }
    }, 60);
}

// CRT: adiciona scanlines animadas sobre o painel do terminal
function applyCRTOverlay(termPanel: HTMLElement) {
    if (!document.getElementById("crt-style")) {
        const st = document.createElement("style");
        st.id = "crt-style";
        st.textContent = `
            @keyframes crtFlicker { 0%,95%,100%{opacity:1} 96%{opacity:.92} 97%{opacity:1} 98%{opacity:.88} }
            @keyframes progressFill { from{width:0%} to{width:100%} }
        `;
        document.head.appendChild(st);
    }
    const crt = document.createElement("div");
    Object.assign(crt.style, {
        position:"absolute", inset:"0", pointerEvents:"none", zIndex:"10",
        backgroundImage:`repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.13) 3px,rgba(0,0,0,0.13) 4px)`,
        animation:"crtFlicker 4s infinite",
    });
    termPanel.style.position = "relative";
    termPanel.appendChild(crt);
}

// ── Sistema de Missões ────────────────────────────────────────────────────────
export type TerminalStep = {
    instruction: string;
    validate: (cmd: string, args: string[]) => boolean;
    successMsg?: string;
    failMsg?:    string;
};
export type TerminalMission = {
    id: string; title: string; description: string; steps: TerminalStep[];
};

let activeMission:   TerminalMission | null = null;
let missionStepIdx:  number = 0;
let missionTerminal: HTMLDivElement | null = null;

/** Inicia uma missão de terminal — chame de qualquer lugar do projeto */
export function startTerminalMission(mission: TerminalMission) {
    activeMission  = mission;
    missionStepIdx = 0;
    const t = missionTerminal ?? (document.getElementById("terminal") as HTMLDivElement | null);
    if (!t) return;
    typewriterAppend(
        `◈  MISSÃO: ${mission.title}\n${mission.description}\n▸ ${mission.steps[0].instruction}`,
        t, "mission"
    );
}

function checkMissionStep(cmd: string, args: string[], terminal: HTMLDivElement): boolean {
    if (!activeMission) return false;
    const step = activeMission.steps[missionStepIdx];
    if (!step) return false;
    if (step.validate(cmd, args)) {
        missionStepIdx++;
        if (missionStepIdx >= activeMission.steps.length) {
            typewriterAppend(step.successMsg ?? "✓ Passo concluído!", terminal, "success");
            setTimeout(() => typewriterAppend(`✓  MISSÃO CONCLUÍDA: ${activeMission!.title}`, terminal, "success"), 400);
            activeMission = null; missionStepIdx = 0;
        } else {
            typewriterAppend(step.successMsg ?? "✓ Correto! Próximo passo:", terminal, "success");
            setTimeout(() => typewriterAppend(`▸ ${activeMission!.steps[missionStepIdx].instruction}`, terminal, "mission"), 300);
        }
        return true;
    } else {
        triggerGlitch(terminal);
        typewriterAppend(step.failMsg ?? `✗ Comando incorreto. Tente: ${step.instruction}`, terminal, "error");
        return true;
    }
}

/** Missões pré-definidas prontas para uso */
export const TERMINAL_MISSIONS: Record<string, TerminalMission> = {
    "explorar-arquivos": {
        id:"explorar-arquivos", title:"Exploração do Sistema",
        description:"Navegue pelo sistema de arquivos e encontre o arquivo.",
        steps:[
            { instruction:"Liste os arquivos com: ls",        validate:(c)=>c==="ls",                         successMsg:"✓ Arquivos listados." },
            { instruction:"Entre no diretório home: cd home", validate:(c,a)=>c==="cd"&&a[0]==="home",        successMsg:"✓ Dentro de /home." },
            { instruction:"Leia o arquivo: cat missao.txt",   validate:(c,a)=>c==="cat"&&a[0]==="missao.txt", successMsg:"✓ Arquivo lido!" },
        ],
    },
    "criar-arquivo": {
        id:"criar-arquivo", title:"Primeiro Script",
        description:"Crie e leia seu primeiro arquivo no terminal.",
        steps:[
            { instruction:'Crie um arquivo: nano hello.txt "Ola Mundo"', validate:(c,a)=>c==="nano"&&a[0]==="hello.txt", successMsg:"✓ Arquivo criado!" },
            { instruction:"Leia o arquivo: cat hello.txt",               validate:(c,a)=>c==="cat"&&a[0]==="hello.txt",  successMsg:"✓ Missão completa!" },
        ],
    },
};

function createTerminal() {
    if (document.getElementById("framescreen")) return;

    // ── Overlay de fundo ──────────────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.id = "framescreen";
    Object.assign(overlay.style, {
        position: "fixed", inset: "0",
        background: "rgba(0,0,0,0.55)",
        // backdropFilter removido — cria stacking context que bloqueia radial-menu
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: "500",
        animation: "deviceIn .3s cubic-bezier(.4,0,.2,1) both",
    });

    // Injeta keyframe se ainda não existir
    if (!document.getElementById("__device_kf")) {
        const s = document.createElement("style");
        s.id = "__device_kf";
        s.textContent = `
            @keyframes deviceIn {
                from { opacity:0; transform:translateY(16px) scale(0.97); }
                to   { opacity:1; transform:translateY(0) scale(1); }
            }
            @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@500;600;700&display=swap');
            #device-root * { box-sizing: border-box; }
            #device-root ::-webkit-scrollbar { width:4px; }
            #device-root ::-webkit-scrollbar-track { background:transparent; }
            #device-root ::-webkit-scrollbar-thumb { background:#0d2e1c; border-radius:2px; }
        `;
        document.head.appendChild(s);
    }

    // ── Dispositivo ───────────────────────────────────────────────────────────
    const device = document.createElement("div");
    device.id = "device-root";
    Object.assign(device.style, {
        width: "720px",
        background: "#0b0b0b",
        border: "1px solid #1a1a1a",
        borderRadius: "10px",
        boxShadow: "0 0 0 1px #000, 0 30px 80px rgba(0,0,0,0.9), 0 0 40px rgba(0,255,157,0.04)",
        overflow: "hidden",
        fontFamily: "'Share Tech Mono', monospace",
    });

    const V = {
        green: "#00ff9d", green2: "#00cc7a", bg: "#050e0a",
        border: "#0d2e1c", text: "#b0ffd8", muted: "#3a6b52",
        yellow: "#f0b90b", red: "#ff3c3c", blue: "#00cfff",
    };

    const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) => Object.assign(el.style, s);

    // ── Top bar ───────────────────────────────────────────────────────────────
    const bar = document.createElement("div");
    css(bar, { background:"#0d0d0d", borderBottom:`1px solid #1c1c1c`, padding:"9px 14px",
               display:"flex", alignItems:"center", gap:"10px" });

    const dots = document.createElement("div");
    dots.style.display = "flex"; dots.style.gap = "6px";
    ["#ff5f57","#febc2e","#28c840"].forEach(c => {
        const d = document.createElement("span");
        css(d, { width:"10px", height:"10px", borderRadius:"50%", background:c, display:"block" });
        dots.appendChild(d);
    });

    const title = document.createElement("div");
    css(title, { flex:"1", textAlign:"center", fontFamily:"'Rajdhani',sans-serif",
                 fontSize:"11px", fontWeight:"600", letterSpacing:"0.3em",
                 textTransform:"uppercase", color:V.muted });
    title.textContent = "HackOS v2.4 — Terminal Seguro";

    const statusDot = document.createElement("div");
    css(statusDot, { display:"flex", alignItems:"center", gap:"5px",
                     fontSize:"10px", color:V.muted, fontFamily:"'Rajdhani',sans-serif",
                     letterSpacing:".1em" });
    const blinkDot = document.createElement("span");
    css(blinkDot, { width:"6px", height:"6px", borderRadius:"50%",
                    background:V.green, boxShadow:`0 0 6px ${V.green}`,
                    display:"inline-block",
                    animation:"blink 2s ease-in-out infinite" });
    if (!document.getElementById("__blink_kf")) {
        const s = document.createElement("style");
        s.id = "__blink_kf";
        s.textContent = `@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}`;
        document.head.appendChild(s);
    }
    statusDot.appendChild(blinkDot);
    statusDot.append(" CONECTADO");

    bar.appendChild(dots); bar.appendChild(title); bar.appendChild(statusDot);
    device.appendChild(bar);

    // ── Abas ──────────────────────────────────────────────────────────────────
    const tabBar = document.createElement("div");
    css(tabBar, { display:"flex", borderBottom:`1px solid ${V.border}`, background:V.bg });

    const tabDefs = [
        { id:"terminal",  label:"Terminal",  icon:"bx-terminal" },
        { id:"editor-c",  label:"Editor C",  icon:"bx-code-alt" },
        { id:"processes", label:"Processos", icon:"bx-chip" },
        { id:"files",     label:"Arquivos",  icon:"bx-folder" },
    ];

    const panels: Record<string, HTMLElement> = {};

    tabDefs.forEach((t, i) => {
        const tab = document.createElement("div");
        css(tab, { padding:"10px 20px", fontFamily:"'Rajdhani',sans-serif",
                   fontSize:"12px", fontWeight:"600", letterSpacing:".12em",
                   textTransform:"uppercase", color:i===0?V.green:V.muted,
                   cursor:"pointer", borderBottom: i===0?`2px solid ${V.green}`:"2px solid transparent",
                   transition:"color .15s, border-color .15s",
                   display:"flex", alignItems:"center", gap:"7px", userSelect:"none" });
        tab.innerHTML = `<i class='bx ${t.icon}' style="font-size:15px"></i> ${t.label}`;

        tab.addEventListener("click", () => {
            tabBar.querySelectorAll("div").forEach((tb: any) => {
                tb.style.color = V.muted;
                tb.style.borderBottom = "2px solid transparent";
            });
            tab.style.color = V.green;
            tab.style.borderBottom = `2px solid ${V.green}`;
            Object.values(panels).forEach((p: HTMLElement) => p.style.display = "none");
            panels[t.id].style.display = "flex";
            if (t.id === "processes") renderProcs();
            if (t.id === "files") renderFilesPanel();
        });

        tabBar.appendChild(tab);

        // Painel
        const panel = document.createElement("div");
        css(panel, { display: i===0?"flex":"none", flexDirection:"column",
                     background:V.bg, height:"340px" });
        panels[t.id] = panel;
    });

    device.appendChild(tabBar);

    // ══════════════════════════════════════════════════════════════════════════
    // PAINEL: TERMINAL
    // ══════════════════════════════════════════════════════════════════════════
    const termPanel = panels["terminal"];

    const termHeader = document.createElement("div");
    css(termHeader, { padding:"7px 14px", borderBottom:`1px solid ${V.border}`,
                      display:"flex", alignItems:"center", gap:"8px",
                      fontFamily:"'Rajdhani',sans-serif", fontSize:"10px",
                      letterSpacing:".15em", color:V.muted });
    termHeader.innerHTML = `<i class='bx bx-chevron-right' style="color:${V.green}"></i> SHELL`;
    const pathSpan = document.createElement("span");
    pathSpan.style.color = V.green;
    pathSpan.textContent = `${currentPrefix}${currentDir} $`;
    termHeader.appendChild(pathSpan);
    termPanel.appendChild(termHeader);

    // Área de output — este é o #terminal que o resto do código usa
    const terminal = document.createElement("div");
    terminal.id = "terminal";
    css(terminal, { flex:"1", overflowY:"auto", padding:"12px 14px",
                    fontSize:"12px", lineHeight:"1.7", color:V.text,
                    display:"flex", flexDirection:"column",
                    scrollbarWidth:"thin", background:"transparent" });
    termPanel.appendChild(terminal);
    device.appendChild(termPanel);

    // Registra terminal para missões + aplica CRT
    missionTerminal = terminal;
    applyCRTOverlay(termPanel);

    // Boot sequence dramático com barra de progresso
    const bootSteps = [
        { t:"HackOS v2.4 — kernel 6.1.0-secure",             delay:0    },
        { t:"Inicializando BIOS... OK",                       delay:180  },
        { t:"Detectando hardware... CPU: x86_64 | RAM: 512M", delay:340  },
        { t:"Montando sistema de arquivos... OK",             delay:520  },
        { t:"Carregando módulos de segurança... OK",          delay:700  },
        { t:"Inicializando módulos de rede... OK",            delay:880  },
        { t:"Conexão estabelecida: 192.168.1.100",            delay:1060 },
    ];

    // Barra de progresso visual
    const progWrap = document.createElement("div");
    Object.assign(progWrap.style, { margin:"6px 0", display:"flex", alignItems:"center", gap:"10px" });
    const progLabel = document.createElement("span");
    Object.assign(progLabel.style, { color:OUTPUT_COLORS.system, fontSize:"11px", fontFamily:"'Share Tech Mono',monospace" });
    progLabel.textContent = "BOOT";
    const progTrack = document.createElement("div");
    Object.assign(progTrack.style, { flex:"1", height:"3px", background:"rgba(125,249,232,0.12)", borderRadius:"2px", overflow:"hidden" });
    const progFill = document.createElement("div");
    Object.assign(progFill.style, { height:"100%", width:"0%", background:OUTPUT_COLORS.info, borderRadius:"2px", animation:"progressFill 1200ms linear both" });
    progTrack.appendChild(progFill);
    progWrap.appendChild(progLabel);
    progWrap.appendChild(progTrack);
    terminal.appendChild(progWrap);

    bootSteps.forEach(({ t, delay }, i) => {
        setTimeout(() => {
            const d = document.createElement("div");
            Object.assign(d.style, { color:OUTPUT_COLORS.system, fontFamily:"'Share Tech Mono',monospace", fontSize:"11px" });
            d.textContent = t;
            terminal.appendChild(d);
            terminal.scrollTop = terminal.scrollHeight;
            if (i === bootSteps.length - 1) {
                setTimeout(() => { progWrap.remove(); addNewCommandLine(terminal); eventEmitter.dispatchEvent(new CustomEvent("terminal:opened")); }, 200);
            }
        }, delay);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PAINEL: PROCESSOS
    // ══════════════════════════════════════════════════════════════════════════
    const procPanel = panels["processes"];
    css(procPanel, { flexDirection:"column" });
    const procToolbar = document.createElement("div");
    css(procToolbar, { padding:"6px 14px", borderBottom:`1px solid ${V.border}`,
                       display:"flex", alignItems:"center", gap:"8px", flexShrink:"0" });
    const procCount = document.createElement("span");
    css(procCount, { fontFamily:"'Share Tech Mono',monospace", fontSize:"10px", color:V.muted, flex:"1" });
    const procUptime = document.createElement("span");
    css(procUptime, { fontFamily:"'Share Tech Mono',monospace", fontSize:"10px", color:V.muted });
    const killBtn = document.createElement("button");
    css(killBtn, { fontFamily:"'Rajdhani',sans-serif", fontSize:"10px", fontWeight:"700",
                   letterSpacing:".1em", textTransform:"uppercase", padding:"3px 10px",
                   background:"transparent", border:`1px solid ${V.red}`, color:V.red,
                   borderRadius:"3px", cursor:"pointer", display:"flex", alignItems:"center", gap:"4px" });
    killBtn.innerHTML = `<i class='bx bx-x-circle'></i> Kill -9`;
    procToolbar.appendChild(procCount);
    procToolbar.appendChild(procUptime);
    procToolbar.appendChild(killBtn);
    procPanel.appendChild(procToolbar);
    const procHead = document.createElement("div");
    css(procHead, { display:"grid", gridTemplateColumns:"52px 74px 160px 160px 1fr",
                    padding:"4px 14px", borderBottom:`1px solid ${V.border}`,
                    fontFamily:"'Rajdhani',sans-serif", fontSize:"10px",
                    letterSpacing:".12em", textTransform:"uppercase", color:V.muted, flexShrink:"0" });
    procHead.innerHTML = ["PID","USER","CPU","MEM","COMANDO"].map(h => `<span>${h}</span>`).join("");
    procPanel.appendChild(procHead);
    const procScroll = document.createElement("div");
    css(procScroll, { flex:"1", overflowY:"auto", padding:"4px 0" });
    procPanel.appendChild(procScroll);
    device.appendChild(procPanel);
    let selectedPid: number | null = null;
    function mkBar(pct: number, color: string): string {
        const filled = Math.min(Math.round(pct / 5), 20);
        return `<span style="color:${color};letter-spacing:-1px;font-size:9px">${"█".repeat(filled)}${"░".repeat(20-filled)}</span> <span style="color:${color}">${pct.toFixed(1)}%</span>`;
    }
    function renderProcs() {
        const now = new Date();
        const avg = (processes.reduce((s, p) => s + p.cpu, 0) / processes.length).toFixed(2);
        procUptime.textContent = `${now.toLocaleTimeString()}  load: ${avg}`;
        procCount.textContent  = `tasks: ${processes.length}  running: ${processes.filter(p => p.state === "R").length}`;
        procScroll.innerHTML = "";
        [...processes].sort((a, b) => b.cpu - a.cpu).forEach(p => {
            const row = document.createElement("div");
            const sel = selectedPid === p.pid;
            const cpuColor = p.cpu > 4 ? V.red : p.cpu > 1.5 ? V.yellow : V.green;
            const stateColor: Record<string,string> = { R:V.green, S:V.muted, I:"#334155", Z:V.red };
            css(row, { display:"grid", gridTemplateColumns:"52px 74px 160px 160px 1fr",
                       padding:"5px 14px", cursor:"pointer", alignItems:"center",
                       background: sel ? "rgba(0,255,157,0.07)" : "transparent",
                       borderLeft: sel ? `2px solid ${V.green}` : "2px solid transparent",
                       transition:"background .1s" });
            row.innerHTML =
                `<span style="color:${V.yellow};font-family:'Share Tech Mono',monospace;font-size:11px">${p.pid}</span>` +
                `<span style="color:${V.muted};font-family:'Share Tech Mono',monospace;font-size:11px">${p.user}</span>` +
                `<span style="font-family:'Share Tech Mono',monospace;font-size:10px">${mkBar(p.cpu, cpuColor)}</span>` +
                `<span style="font-family:'Share Tech Mono',monospace;font-size:10px">${mkBar(p.mem, "#7df9e8")}</span>` +
                `<span style="color:${V.text};font-family:'Share Tech Mono',monospace;font-size:11px">` +
                `<span style="color:${stateColor[p.state]??V.muted};margin-right:6px">[${p.state}]</span>${p.command}</span>`;
            row.addEventListener("mouseenter", () => { if (!sel) row.style.background = "rgba(255,255,255,0.02)"; });
            row.addEventListener("mouseleave", () => { if (!sel) row.style.background = "transparent"; });
            row.addEventListener("click", () => { selectedPid = p.pid; renderProcs(); });
            procScroll.appendChild(row);
        });
    }
    setInterval(() => { if (procPanel.style.display !== "none") renderProcs(); }, 1200);
    killBtn.addEventListener("click", () => {
        if (selectedPid === null) return;
        const idx = processes.findIndex(p => p.pid === selectedPid);
        if (idx !== -1) {
            processes.splice(idx, 1); selectedPid = null;
            eventEmitter.dispatchEvent(new CustomEvent("remove_pid", { detail: { processes, isCollided } }));
            renderProcs();
        }
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PAINEL: EDITOR C
    // ══════════════════════════════════════════════════════════════════════════
    const cPanel = panels["editor-c"];
    css(cPanel, { flexDirection:"column", position:"relative" });

    const cHeader = document.createElement("div");
    css(cHeader, { padding:"7px 14px", borderBottom:`1px solid ${V.border}`,
                   display:"flex", alignItems:"center", justifyContent:"space-between",
                   fontFamily:"'Rajdhani',sans-serif", gap:"8px" });

    const cTitle = document.createElement("span");
    css(cTitle, { fontSize:"10px", letterSpacing:".15em", color:V.muted,
                  textTransform:"uppercase", display:"flex", alignItems:"center", gap:"6px" });
    cTitle.innerHTML = `<i class='bx bx-code-alt' style="color:${V.green}"></i> COMPILADOR C — HackOS GCC`;

    const cActions = document.createElement("div");
    cActions.style.display = "flex"; cActions.style.gap = "8px";

    const runBtn = document.createElement("button");
    css(runBtn, { fontFamily:"'Rajdhani',sans-serif", fontSize:"11px", fontWeight:"700",
                  letterSpacing:".1em", textTransform:"uppercase", padding:"4px 14px",
                  background:`rgba(0,255,157,0.1)`, border:`1px solid ${V.green}`,
                  color:V.green, borderRadius:"3px", cursor:"pointer",
                  display:"flex", alignItems:"center", gap:"5px" });
    runBtn.innerHTML = `<i class='bx bx-play-circle'></i> Compilar &amp; Executar`;

    const clearCBtn = document.createElement("button");
    css(clearCBtn, { fontFamily:"'Rajdhani',sans-serif", fontSize:"11px", fontWeight:"600",
                     letterSpacing:".1em", textTransform:"uppercase", padding:"4px 10px",
                     background:"transparent", border:`1px solid ${V.border}`,
                     color:V.muted, borderRadius:"3px", cursor:"pointer" });
    clearCBtn.textContent = "Limpar";

    cActions.append(clearCBtn, runBtn);
    cHeader.append(cTitle, cActions);
    cPanel.appendChild(cHeader);

    const cBody = document.createElement("div");
    css(cBody, { display:"flex", flex:"1", overflow:"hidden" });

    const cEditorWrap = document.createElement("div");
    css(cEditorWrap, { flex:"1", display:"flex", flexDirection:"column",
                       borderRight:`1px solid ${V.border}` });

    const cLangBadge = document.createElement("div");
    css(cLangBadge, { padding:"4px 14px", fontSize:"9px", letterSpacing:".14em",
                      color:V.muted, textTransform:"uppercase", borderBottom:`1px solid ${V.border}`,
                      display:"flex", gap:"10px", alignItems:"center" });
    cLangBadge.innerHTML = `<span style="color:${V.yellow}">C</span> main.c &nbsp;|&nbsp; <span id="__c-status" style="color:${V.muted}">Pronto</span>`;

    const cTextarea = document.createElement("textarea");
    cTextarea.id = "__c-editor";
    css(cTextarea, { flex:"1", background:"transparent", border:"none", outline:"none",
                     color:V.text, fontFamily:"'Share Tech Mono', monospace",
                     fontSize:"12px", lineHeight:"1.7", padding:"12px 14px",
                     resize:"none", tabSize:"4" });
    cTextarea.spellcheck = false;
    cTextarea.value = '#include <stdio.h>\n\nint main() {\n    printf("Ola, Mundo!\\n");\n    return 0;\n}';

    cTextarea.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Tab") {
            e.preventDefault();
            const s = cTextarea.selectionStart;
            cTextarea.value = cTextarea.value.slice(0, s) + "    " + cTextarea.value.slice(s);
            cTextarea.selectionStart = cTextarea.selectionEnd = s + 4;
        }
    });
    cTextarea.addEventListener("click",    e => e.stopPropagation());
    cTextarea.addEventListener("keypress", e => e.stopPropagation());
    cEditorWrap.append(cLangBadge, cTextarea);

    const cOutputWrap = document.createElement("div");
    css(cOutputWrap, { width:"260px", display:"flex", flexDirection:"column" });

    const cOutHeader = document.createElement("div");
    css(cOutHeader, { padding:"4px 14px", fontSize:"9px", letterSpacing:".14em",
                      color:V.muted, textTransform:"uppercase", borderBottom:`1px solid ${V.border}`,
                      display:"flex", alignItems:"center", gap:"6px" });
    cOutHeader.innerHTML = `<i class='bx bx-terminal' style="color:${V.green};font-size:12px"></i> SAIDA`;

    const cOutput = document.createElement("pre");
    cOutput.id = "__c-output";
    css(cOutput, { flex:"1", overflowY:"auto", margin:"0", padding:"12px 14px",
                   fontSize:"11px", lineHeight:"1.6", color:V.text,
                   fontFamily:"'Share Tech Mono', monospace", whiteSpace:"pre-wrap",
                   background:"rgba(0,0,0,0.2)" });
    cOutput.textContent = "// Execute para ver a saida";

    cOutputWrap.append(cOutHeader, cOutput);
    cBody.append(cEditorWrap, cOutputWrap);
    cPanel.appendChild(cBody);
    device.appendChild(cPanel);

    function runCCode() {
        const ta     = document.getElementById("__c-editor") as HTMLTextAreaElement;
        const output = document.getElementById("__c-output")  as HTMLPreElement;
        const status = document.getElementById("__c-status")  as HTMLSpanElement;
        if (!ta || !output || !status) return;
        const src = ta.value;
        status.textContent = "Compilando..."; status.style.color = V.yellow;
        output.textContent = ""; output.style.color = V.text;
        setTimeout(() => {
            const result = CCompiler.run(src);
            if (result.success) {
                status.textContent = "OK"; status.style.color = V.green;
                output.textContent = result.output || "(sem saida)";
                eventEmitter.dispatchEvent(new CustomEvent("c:output", {
                    detail: { output: result.output, source: src }
                }));
            } else {
                status.textContent = "ERRO"; status.style.color = V.red;
                output.style.color = V.red;
                output.textContent = result.errors.map((e: string, i: number) => `[Erro ${i+1}] ${e}`).join("\n");
            }
        }, 80);
    }

    runBtn.addEventListener("click", runCCode);
    clearCBtn.addEventListener("click", () => {
        const ta = document.getElementById("__c-editor") as HTMLTextAreaElement;
        if (ta) ta.value = '#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}';
        const out = document.getElementById("__c-output") as HTMLPreElement;
        if (out) { out.textContent = "// Execute para ver a saida"; out.style.color = V.text; }
        const st = document.getElementById("__c-status") as HTMLSpanElement;
        if (st) { st.textContent = "Pronto"; st.style.color = V.muted; }
    });

    // Quando professor mudar slide, preenche editor com codigo de exemplo
    eventEmitter.addEventListener("teacher:slide", (e: Event) => {
        const { slide } = (e as CustomEvent).detail;
        if (slide.code) {
            const ta = document.getElementById("__c-editor") as HTMLTextAreaElement;
            if (ta) ta.value = `#include <stdio.h>\n\n${slide.code}`;
        }
    });

    const filePanel = panels["files"];
    css(filePanel, { flexDirection:"column" });
    const fileTB = document.createElement("div");
    css(fileTB, { padding:"6px 12px", borderBottom:`1px solid ${V.border}`,
                  display:"flex", alignItems:"center", gap:"6px", flexShrink:"0" });
    const pathDisplay = document.createElement("span");
    css(pathDisplay, { fontFamily:"'Share Tech Mono',monospace", fontSize:"11px",
                       color:V.green, flex:"1", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" });
    const mkFBtn = (icon: string, label: string, color = V.green2) => {
        const b = document.createElement("button");
        css(b, { fontFamily:"'Rajdhani',sans-serif", fontSize:"10px", fontWeight:"700",
                 letterSpacing:".06em", textTransform:"uppercase", padding:"3px 8px",
                 background:"transparent", border:`1px solid ${color}`, color,
                 borderRadius:"3px", cursor:"pointer", display:"flex", alignItems:"center", gap:"3px", flexShrink:"0" });
        b.innerHTML = `<i class='bx ${icon}'></i>${label}`;
        return b;
    };
    const btnNewFile = mkFBtn("bx-file-plus", "Novo arquivo");
    const btnNewDir  = mkFBtn("bx-folder-plus", "Nova pasta");
    const btnSave    = mkFBtn("bx-save", "Salvar");
    const btnDl      = mkFBtn("bx-download", "Download");
    btnSave.style.display = "none"; btnDl.style.display = "none";
    fileTB.appendChild(pathDisplay); fileTB.appendChild(btnNewFile);
    fileTB.appendChild(btnNewDir);   fileTB.appendChild(btnSave); fileTB.appendChild(btnDl);
    filePanel.appendChild(fileTB);
    const createForm = document.createElement("div");
    css(createForm, { display:"none", padding:"7px 12px", borderBottom:`1px solid ${V.border}`,
                      background:"rgba(0,255,157,0.03)", alignItems:"center", gap:"6px" });
    const createInput = document.createElement("input");
    css(createInput, { flex:"1", background:"#06090f", border:`1px solid ${V.border}`,
                       borderRadius:"4px", padding:"4px 8px", color:V.text,
                       fontFamily:"'Share Tech Mono',monospace", fontSize:"11px", outline:"none" });
    createInput.placeholder = "nome-do-arquivo.txt";
    const createOkBtn = mkFBtn("bx-check", "Criar", V.green);
    const createCxBtn = mkFBtn("bx-x", "", V.red);
    createForm.appendChild(createInput); createForm.appendChild(createOkBtn); createForm.appendChild(createCxBtn);
    filePanel.appendChild(createForm);
    const fileBody = document.createElement("div");
    css(fileBody, { flex:"1", display:"flex", overflow:"hidden" });
    const sidebar = document.createElement("div");
    css(sidebar, { width:"140px", borderRight:`1px solid ${V.border}`, overflowY:"auto", flexShrink:"0" });
    const fileMain = document.createElement("div");
    css(fileMain, { flex:"1", display:"flex", flexDirection:"column", overflow:"hidden" });
    const fileList = document.createElement("div");
    css(fileList, { flex:"1", overflowY:"auto", padding:"6px 8px" });
    const editorPane = document.createElement("div");
    css(editorPane, { display:"none", flexDirection:"column", borderTop:`1px solid ${V.border}`, flexShrink:"0", maxHeight:"55%" });
    const editorBar = document.createElement("div");
    css(editorBar, { padding:"4px 10px", background:"rgba(125,249,232,0.04)",
                     borderBottom:`1px solid ${V.border}`, display:"flex", alignItems:"center", gap:"6px", flexShrink:"0" });
    const editorTitle = document.createElement("span");
    css(editorTitle, { fontFamily:"'Share Tech Mono',monospace", fontSize:"10px", color:"#7df9e8", flex:"1" });
    const editorCloseBtn = document.createElement("button");
    css(editorCloseBtn, { background:"transparent", border:"none", color:V.muted, cursor:"pointer", fontSize:"13px" });
    editorCloseBtn.textContent = "✕";
    editorBar.appendChild(editorTitle); editorBar.appendChild(editorCloseBtn);
    const editorTA = document.createElement("textarea");
    css(editorTA, { flex:"1", background:"#040810", color:"#c8fce8",
                    fontFamily:"'Share Tech Mono',monospace", fontSize:"12px",
                    border:"none", outline:"none", padding:"10px 12px",
                    resize:"none", lineHeight:"1.65", overflowY:"auto" });
    editorTA.spellcheck = false;
    editorPane.appendChild(editorBar); editorPane.appendChild(editorTA);
    fileMain.appendChild(fileList); fileMain.appendChild(editorPane);
    fileBody.appendChild(sidebar);  fileBody.appendChild(fileMain);
    filePanel.appendChild(fileBody);
    device.appendChild(filePanel);
    let fileViewDir = "/";
    let editingFile: file | null = null;
    let creatingDir = false;
    function openEditor(f: file) {
        editingFile = f; editorTitle.textContent = `✎  ${fileViewDir}${f.name}`;
        editorTA.value = f.content; editorPane.style.display = "flex";
        btnSave.style.display = "flex"; btnDl.style.display = "flex";
        editorTA.focus(); renderFilesPanel();
    }
    function closeEditor() {
        editingFile = null; editorPane.style.display = "none";
        btnSave.style.display = "none"; btnDl.style.display = "none";
        renderFilesPanel();
    }
    editorCloseBtn.addEventListener("click", closeEditor);
    btnSave.addEventListener("click", () => {
        if (!editingFile) return;
        editingFile.content = editorTA.value;
        const prev = editorTitle.textContent;
        editorTitle.textContent = `✎  ${fileViewDir}${editingFile.name}  ✓ salvo`;
        setTimeout(() => { editorTitle.textContent = prev; }, 1400);
    });
    btnDl.addEventListener("click", () => {
        if (!editingFile) return;
        const blob = new Blob([editorTA.value], { type:"text/plain" });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), { href:url, download:editingFile.name });
        a.click(); URL.revokeObjectURL(url);
    });
    function showCreateForm(isDir: boolean) {
        creatingDir = isDir; createInput.placeholder = isDir ? "nome-da-pasta" : "arquivo.txt";
        createInput.value = ""; createForm.style.display = "flex"; createInput.focus();
    }
    function hideCreateForm() { createForm.style.display = "none"; }
    btnNewFile.addEventListener("click", () => showCreateForm(false));
    btnNewDir.addEventListener("click",  () => showCreateForm(true));
    createCxBtn.addEventListener("click", hideCreateForm);
    createInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") createOkBtn.click();
        if (e.key === "Escape") hideCreateForm();
    });
    createOkBtn.addEventListener("click", () => {
        const name = createInput.value.trim(); if (!name) return;
        const dir = diretories[fileViewDir]; if (!dir) return;
        if (creatingDir) {
            const newPath = `${fileViewDir}${name}/`;
            if (!diretories[newPath]) { diretories[newPath] = { name, contentFile:[], contentDir:[] }; dir.contentDir.push(name); }
        } else {
            if (!dir.contentFile.some(f => f.name === name)) {
                const nf: file = { name, content:"" }; dir.contentFile.push(nf);
                hideCreateForm(); renderFilesPanel(); openEditor(nf); return;
            }
        }
        hideCreateForm(); renderFilesPanel();
    });
    function renderFilesPanel() {
        sidebar.innerHTML = "";
        Object.keys(diretories).forEach(path => {
            const d = document.createElement("div");
            css(d, { padding:"6px 10px", fontSize:"10px", fontFamily:"'Share Tech Mono',monospace",
                     color: path===fileViewDir ? "#7df9e8" : V.muted,
                     background: path===fileViewDir ? "rgba(125,249,232,0.06)" : "transparent",
                     cursor:"pointer", display:"flex", alignItems:"center", gap:"5px",
                     borderLeft: path===fileViewDir ? "2px solid #7df9e8" : "2px solid transparent" });
            d.innerHTML = `<i class='bx bx-folder' style="font-size:12px"></i>${path}`;
            d.addEventListener("click", () => { fileViewDir = path; closeEditor(); hideCreateForm(); renderFilesPanel(); });
            sidebar.appendChild(d);
        });
        pathDisplay.textContent = `~${fileViewDir}`; fileList.innerHTML = "";
        const dir = diretories[fileViewDir]; if (!dir) return;
        const iconMap: Record<string,string> = { TXT:"bx-file-blank", JS:"bx-code-alt", PY:"bx-code-curly", C:"bx-chip", H:"bx-chip" };
        dir.contentDir.forEach(name => {
            const item = document.createElement("div");
            css(item, { display:"flex", alignItems:"center", gap:"7px", padding:"6px 8px", borderRadius:"3px",
                        cursor:"pointer", color:V.text, fontFamily:"'Share Tech Mono',monospace", fontSize:"11px" });
            item.innerHTML = `<i class='bx bx-folder' style="color:${V.yellow};font-size:14px"></i><span style="flex:1">${name}/</span><span style="color:${V.muted};font-size:10px">DIR</span>`;
            item.addEventListener("mouseenter", () => item.style.background = "rgba(255,255,255,0.03)");
            item.addEventListener("mouseleave", () => item.style.background = "transparent");
            item.addEventListener("click", () => { fileViewDir = `${fileViewDir}${name}/`; hideCreateForm(); renderFilesPanel(); });
            fileList.appendChild(item);
        });
        dir.contentFile.forEach(f => {
            const ext = f.name.split(".").pop()?.toUpperCase() || "";
            const icon = iconMap[ext] ?? "bx-file";
            const isOpen = editingFile?.name === f.name;
            const item = document.createElement("div");
            css(item, { display:"flex", alignItems:"center", gap:"7px", padding:"6px 8px", borderRadius:"3px",
                        cursor:"pointer", fontFamily:"'Share Tech Mono',monospace", fontSize:"11px",
                        color: isOpen ? "#7df9e8" : V.text,
                        background: isOpen ? "rgba(125,249,232,0.06)" : "transparent",
                        borderLeft: isOpen ? "2px solid #7df9e8" : "2px solid transparent" });
            const delBtn = document.createElement("button");
            css(delBtn, { background:"transparent", border:"none", color:V.red, cursor:"pointer",
                          fontSize:"12px", padding:"0 2px", marginLeft:"auto", opacity:"0", transition:"opacity .1s", flexShrink:"0" });
            delBtn.textContent = "✕";
            item.innerHTML = `<i class='bx ${icon}' style="color:${isOpen?"#7df9e8":V.green};font-size:14px"></i><span style="flex:1">${f.name}</span><span style="color:${V.muted};font-size:9px">${ext}</span>`;
            item.appendChild(delBtn);
            item.addEventListener("mouseenter", () => { if (!isOpen) item.style.background = "rgba(255,255,255,0.03)"; delBtn.style.opacity = "1"; });
            item.addEventListener("mouseleave", () => { if (!isOpen) item.style.background = "transparent"; delBtn.style.opacity = "0"; });
            item.addEventListener("click", (e) => { if (e.target === delBtn) return; openEditor(f); });
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation(); item.innerHTML = "";
                css(item, { background:"rgba(248,113,113,0.08)", borderLeft:`2px solid ${V.red}`, color:V.red, justifyContent:"space-between" });
                const msg = Object.assign(document.createElement("span"), { textContent:`Apagar ${f.name}?` });
                msg.style.fontSize = "10px";
                const yesBtn = mkFBtn("bx-check", "Sim", V.red);
                const noBtn  = mkFBtn("bx-x", "Não", V.muted);
                yesBtn.addEventListener("click", () => { const i = dir.contentFile.indexOf(f); if (i !== -1) dir.contentFile.splice(i,1); if (editingFile?.name===f.name) closeEditor(); renderFilesPanel(); });
                noBtn.addEventListener("click", () => renderFilesPanel());
                item.appendChild(msg); item.appendChild(yesBtn); item.appendChild(noBtn);
            });
            fileList.appendChild(item);
        });
        if (!dir.contentDir.length && !dir.contentFile.length) {
            const empty = document.createElement("div");
            css(empty, { color:V.muted, fontSize:"11px", padding:"24px 8px", textAlign:"center", fontFamily:"'Share Tech Mono',monospace" });
            empty.textContent = "diretório vazio"; fileList.appendChild(empty);
        }
    }

    // ── Status bar ────────────────────────────────────────────────────────────
    const statusBar = document.createElement("div");
    css(statusBar, { background:"#060606", borderTop:`1px solid ${V.border}`,
                     padding:"5px 14px", display:"flex", alignItems:"center",
                     gap:"16px", fontFamily:"'Rajdhani',sans-serif",
                     fontSize:"10px", letterSpacing:".1em", textTransform:"uppercase" });

    const mkStatus = (label: string, val: string) => {
        const s = document.createElement("span");
        s.style.color = V.muted;
        s.innerHTML = `${label} <span style="color:${V.green}">${val}</span>`;
        return s;
    };
    const sep = () => { const s = document.createElement("span"); s.style.color = V.border; s.textContent = "|"; return s; };

    statusBar.appendChild(mkStatus("USER", "player@local"));
    statusBar.appendChild(sep());
    const sbDir = mkStatus("DIR", currentDir);
    statusBar.appendChild(sbDir);
    statusBar.appendChild(sep());
    const sbProcs = mkStatus("PROCS", String(processes.length));
    statusBar.appendChild(sbProcs);

    device.appendChild(statusBar);

    // Fechar clicando fora
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            overlay.remove();
            document.getElementById("framescreen")?.remove();
        }
    });

    overlay.appendChild(device);
    document.body.appendChild(overlay);
}


// Adicionar uma nova linha de comando ao terminal
export function addNewCommandLine(terminal: HTMLDivElement) {
    const commandLine = document.createElement("div");
    commandLine.style.display    = "flex";
    commandLine.style.alignItems = "center";
    commandLine.style.marginTop  = "2px";

    // Prefixo colorido: user · : · dir · $
    const prefix = document.createElement("span");
    prefix.style.userSelect  = "none";
    prefix.style.flexShrink  = "0";
    prefix.style.whiteSpace  = "nowrap";
    prefix.style.fontFamily  = "'Share Tech Mono',monospace";
    prefix.style.fontSize    = "12px";
    prefix.innerHTML =
        `<span style="color:#7df9e8">${currentPrefix}</span>` +
        `<span style="color:#6b7280">:</span>` +
        `<span style="color:#a78bfa">${currentDir}</span>` +
        `<span style="color:#fbbf24">$ </span>`;
    commandLine.appendChild(prefix);

    const input = document.createElement("span");
    input.contentEditable = "true";
    input.style.outline    = "none";
    input.style.color      = "#e2f0ff";
    input.style.fontFamily = "'Share Tech Mono',monospace";
    input.style.fontSize   = "12px";
    input.style.wordBreak  = "break-word";
    input.style.overflow   = "hidden";
    input.style.flexGrow   = "1";
    input.style.whiteSpace = "pre-wrap";
    commandLine.appendChild(input);

    terminal.appendChild(commandLine);
    terminal.scrollTop = terminal.scrollHeight;
    input.focus();
    cmdHistoryIdx = -1;

    input.addEventListener("keydown", (event) => {
        event.stopPropagation();

        // ── Histórico ↑↓ ────────────────────────────────────────────────────
        if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!cmdHistory.length) return;
            cmdHistoryIdx = Math.min(cmdHistoryIdx + 1, cmdHistory.length - 1);
            input.textContent = cmdHistory[cmdHistoryIdx];
            const r = document.createRange(), s = window.getSelection();
            r.selectNodeContents(input); r.collapse(false);
            s?.removeAllRanges(); s?.addRange(r);
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (cmdHistoryIdx <= 0) { cmdHistoryIdx = -1; input.textContent = ""; return; }
            cmdHistoryIdx--;
            input.textContent = cmdHistory[cmdHistoryIdx];
            return;
        }

        // ── Tab autocomplete básico ──────────────────────────────────────────
        if (event.key === "Tab") {
            event.preventDefault();
            const partial = input.innerText.trim();
            if (!partial) return;
            const match = Object.keys(commands).find(c => c.startsWith(partial) && c !== partial);
            if (match) {
                input.textContent = match + " ";
                const r = document.createRange(), s = window.getSelection();
                r.selectNodeContents(input); r.collapse(false);
                s?.removeAllRanges(); s?.addRange(r);
            }
            return;
        }

        // ── Enter ────────────────────────────────────────────────────────────
        if (event.key === "Enter") {
            event.preventDefault();
            const command = input.innerText.trim();
            if (command) {
                if (cmdHistory[0] !== command) cmdHistory.unshift(command);
                if (cmdHistory.length > 50) cmdHistory.pop();
                executeCommand(command, terminal);
            }
            input.contentEditable = "false";
            addNewCommandLine(terminal);
        }
    });

    input.addEventListener("click",    (e) => e.stopPropagation());
    input.addEventListener("keypress", (e) => e.stopPropagation());
}
// Dicionário de comandos do terminal
const commands: Record<string, (args: string[]) => string> = {
    "ping": (args) => `  PING ${args[0] || "127.0.0.1"}: 56 data bytes\n64 bytes from ${args[0] || "127.0.0.1"}: icmp_seq=1 ttl=64 time=0.5 ms`,
    "pwd": () => currentDir,
    "ifconfig": () => `  eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n inet 192.168.1.100  netmask 255.255.255.0  broadcast 192.168.1.255\n gateway 192.168.1.1`,
    "help": () => [
        "╔══════════════════════════════════════════════════════╗",
        "║         HACKOS v2.4  —  COMANDOS DISPONÍVEIS        ║",
        "╚══════════════════════════════════════════════════════╝",
        "",
        "── NAVEGAÇÃO ───────────────────────────────────────────",
        "  ls                  Lista arquivos e pastas",
        "  cd [dir]            Entra no diretório (.. para voltar)",
        "  pwd                 Mostra diretório atual",
        "",
        "── ARQUIVOS ────────────────────────────────────────────",
        "  cat [arquivo]       Exibe conteúdo do arquivo",
        "  nano [arq] \"texto\"  Cria ou edita arquivo",
        "  rm [arquivo]        Remove arquivo",
        "  mkdir [pasta]       Cria novo diretório",
        "",
        "── REDE ────────────────────────────────────────────────",
        "  ping [host]         Testa conexão com host",
        "  ifconfig            Exibe interfaces de rede",
        "  ssh [user@host]     Conecta a servidor remoto",
        "  exit                Encerra sessão remota",
        "",
        "── PROCESSOS ───────────────────────────────────────────",
        "  top                 Monitor em tempo real (q para sair)",
        "  ps aux              Lista todos os processos",
        "  kill -9 [PID]       Encerra processo forçadamente",
        "",
        "── TERMINAL ────────────────────────────────────────────",
        "  clear               Limpa o terminal",
        "  help                Exibe esta mensagem",
        "",
        "  ↑ ↓  Histórico de comandos   Tab  Autocomplete",
    ].join("\n"),
    "cd": (args) => {

        if (args[0] === "..") {
            let backDir = currentDir.split("/").filter(i => i != "")
            backDir.pop()

            if (backDir.length > 0) {
                currentDir = `/${backDir.join("/")}/`
            }
            else {
                currentDir = "/"
            }

            return "";
        }
        else if (args[0]) {

            let dir = isRemotelyConnected ? remoteDiretories.dirs as any : diretories

            let changerDir = `${currentDir}${args[0]}/`
            if (dir[changerDir]) {
                currentDir = changerDir
                return ""
            }
        }

        return "Erro: Diretório não encontrado.";
    },
    "cat": (args) => {

        let msg = "Uso: cat [arquivo.ext]"

        if(args[0])
        {
            const dirLocal = isRemotelyConnected ? remoteDiretories.dirs as any : diretories
            const findFile = (dirLocal[currentDir].contentFile as file[]).find(file => file.name === args[0])

            if(findFile)
            {
                msg = findFile.content
            }
            else
            {
                msg = `Erro: O arquivo "${args[0]}" não existe.`
            }

        }
        
        return formatMultiline(msg)
    },
    "ls": () => {

        if (isRemotelyConnected) {
            SocketManager.sendRemoteAccess(currentDir, "", "ls")
            return ""
        }

        const actualDir = diretories[currentDir];
        let AllFilesAndDirs = `\n${actualDir.contentDir.map(dir => ` ${dir}`).join("  ")}`
        AllFilesAndDirs += `  ${actualDir.contentFile.map(file => ` ${file.name}`).join("  ")}`

        return AllFilesAndDirs;
    },
    "top": () => {
        const terminal = document.getElementById("terminal") as HTMLDivElement | null;
        if (!terminal) return "";
        const box = document.createElement("pre");
        Object.assign(box.style, {
            color:"#7df9e8", fontFamily:"'Share Tech Mono',monospace", fontSize:"11px",
            lineHeight:"1.55", margin:"4px 0", background:"rgba(0,0,0,0.4)",
            padding:"8px 10px", borderLeft:"3px solid #7df9e8", whiteSpace:"pre",
        });
        const SEP = "─".repeat(58);
        function renderTop() {
            const now = new Date();
            const avg = (processes.reduce((s, p) => s + p.cpu, 0) / processes.length).toFixed(1);
            let out =
                ` top — ${now.toLocaleTimeString()}  |  tasks: ${processes.length}  |  cpu avg: ${avg}%\n` +
                `${SEP}\n` +
                ` ${"PID".padEnd(6)}${"USER".padEnd(9)}${"CPU%".padEnd(7)}${"MEM%".padEnd(7)}${"ST".padEnd(4)}COMANDO\n` +
                `${SEP}\n`;
            [...processes].sort((a, b) => b.cpu - a.cpu).forEach(p => {
                out += ` ${String(p.pid).padEnd(6)}${p.user.padEnd(9)}${p.cpu.toFixed(1).padEnd(7)}${p.mem.toFixed(1).padEnd(7)}${p.state.padEnd(4)}${p.command}\n`;
            });
            out += `${SEP}\n pressione q para sair`;
            box.textContent = out;
        }
        renderTop();
        terminal.appendChild(box);
        terminal.scrollTop = terminal.scrollHeight;
        const tid = setInterval(() => { if (!box.isConnected) { clearInterval(tid); return; } renderTop(); }, 1200);
        const onKey = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === "q") {
                clearInterval(tid); box.style.borderLeftColor = "#f87171";
                box.textContent += "\n[top encerrado]";
                document.removeEventListener("keydown", onKey);
            }
        };
        document.addEventListener("keydown", onKey);
        return "";
    },
    "kill": (args) => {
        if (args.length < 2 || args[0] !== "-9") {
            return "Erro: Uso correto: kill -9 [número do processo]";
        }

        const pid = Number(args[1]);
        if (isNaN(pid)) return "Erro: O PID deve ser um número válido.";

        const index = processes.findIndex(p => p.pid === pid);
        if (index === -1) return `Erro: Processo com PID ${pid} não encontrado.`;

        processes.splice(index, 1);
        eventEmitter.dispatchEvent(new CustomEvent("remove_pid", { detail: { processes, isCollided } }));
        return `Processo ${pid} encerrado com sucesso.`;
    },
    "nano": (args) => {
        if (args.length < 2) {
            return "Uso: nano [arquivo.ext] \"conteúdo\" (extensões: .txt, .js, .py)";
        }

        const fileName = args[0];
        const contentMatch = args.join(" ").match(/\"(.*?)\"/);
        const allowedExtensions = [".txt", ".js", ".py"];

        if (!contentMatch) {
            return "Erro: O conteúdo deve estar entre aspas. Exemplo: nano arquivo.txt \"seu texto aqui\"";
        }

        const content = contentMatch[1];
        const fileExtension = fileName.slice(fileName.lastIndexOf("."));

        if (!allowedExtensions.includes(fileExtension)) {
            return "Erro: Extensão não permitida. Use .txt, .js ou .py";
        }

        const dirLocal = isRemotelyConnected ? remoteDiretories.dirs as any : diretories
      
        const fileExists = (dirLocal[currentDir].contentFile as file[]).some( f => f.name === fileName);

        if (fileExists) {
            const file = (dirLocal[currentDir].contentFile as file[]).find(f => f.name === fileName);
          
            if (file){
                file.content = content;
            }

            if(isRemotelyConnected){
                if(file)
                {
                    SocketManager.handleFileRemote("nano", currentDir, file)
                }

                return "";
            }

            return `Arquivo ${fileName} atualizado.`;
        } else {

            const localFile: file = { name: fileName, content }

            if(isRemotelyConnected){
                SocketManager.handleFileRemote("nano", currentDir, localFile)
                return "";
            }

            dirLocal[currentDir].contentFile.push(localFile);
            return `Arquivo ${fileName} criado com sucesso.`;
        }
    },
    "mkdir": (args) => {

        if (args[0]) {

            if (isRemotelyConnected) {
                SocketManager.sendRemoteAccess(currentDir, args[0], "mkdir")
                return ""
            }

            let path = `${currentDir}${args[0]}/`

            if (diretories[path] === undefined) {

                diretories[currentDir].contentDir.push(args[0])

                diretories[path] = {
                    name: `${path}`,
                    contentFile: [],
                    contentDir: []
                }

                return ""
            }

            return `O diretório ${args[0]} já existe`
        }

        return "uso: mkdir <nome_diretorio>";
    },
    "rmdir": (args) => {
        if (args[0]) {
            let path = `${currentDir}${args[0]}/`;

            if (isRemotelyConnected) {
                SocketManager.sendRemoteAccess(currentDir, args[0], "rmdir")
                return ""
            }

            // Verifica se o diretório existe
            if (diretories[path] === undefined) {
                return `O diretório ${args[0]} não existe`;
            }

            // Remove referência no contentDir do diretório pai
            diretories[currentDir].contentDir = diretories[currentDir].contentDir.filter(dir => !dir.includes(args[0]));

            // Remove todos os subdiretórios e arquivos do diretório a ser excluído
            Object.keys(diretories).forEach((chave) => {
                if (chave.startsWith(path)) {
                    delete diretories[chave];
                }
            });

            return "";
        }

        return "uso: rmdir <nome_diretorio>";
    },
    "rm": (args) => {

        let msg = "uso: rm <nome_arquivo>"

        if (args[0]) {

            if (isRemotelyConnected) {
                SocketManager.sendRemoteAccess(currentDir, "", "rm",args[0])
                return ""
            }

            diretories[currentDir].contentFile = diretories[currentDir].contentFile.filter(file => file.name !== args[0])
            msg = ""
        }

        return msg;
    },
    "ssh": (args) => {
        if (args[0]) {
            if (args[0] === serverAddressRemote && SocketManager.isConnected) {
                isRemotelyConnected = true;
                currentPrefix = serverPrefix
                currentDir = rootPath
                return "Conectado ao servidor remoto"
            }
            else {
                return `SSH: Conexão não realizada para ${args[0]}`
            }
        }
        else {
            return "Uso: ssh <user>@<server>"
        }
    },
    "exit": () => {

        let info = ""

        if (currentPrefix == serverPrefix) {
            isRemotelyConnected = false;
            currentPrefix = localPrefix
            info = "desconectado"
            currentDir = rootPath
        }

        SocketManager.io.emit("sendRemoteAccess", { currentDir: "/", command: "exit", dir: "", name: "" })
        return info
    },
    "energy": () => `Energia: ${infoPlayer.energy}% ⚡`,
    // su é processado pelo servidor — senha nunca exposta no cliente
    "su": (args) => {
        if (!args[0]) return "Uso: su <senha>"
        SocketManager.io.emit("sendRemoteAccess", {
            currentDir: "/", command: "su", dir: args[0], name: ""
        })
        return "Aguardando autenticacao..."
    },
    "whoami": (_args: any) => {
        SocketManager.io.emit("sendRemoteAccess", { currentDir: "/", command: "whoami", dir: "", name: "" })
        return ""
    },
    "who": (_args: any) => {
        SocketManager.io.emit("sendRemoteAccess", { currentDir: "/", command: "who", dir: "", name: "" })
        return ""
    },
    "id": (args: any) => {
        SocketManager.io.emit("sendRemoteAccess", { currentDir: "/", command: "id", dir: args[0] || "", name: "" })
        return ""
    },
    "usermod": (args: any) => {
        const clean = args.filter((a: string) => !a.startsWith("-"))
        SocketManager.io.emit("sendRemoteAccess", { currentDir: "/", command: "usermod", dir: clean[0] || "", name: clean[1] || "" })
        return ""
    },
    "gpasswd": (args: any) => {
        const clean = args.filter((a: string) => !a.startsWith("-"))
        SocketManager.io.emit("sendRemoteAccess", { currentDir: "/", command: "gpasswd", dir: clean[0] || "", name: clean[1] || "" })
        return ""
    },
    // ── Comando admin: iniciar aula do professor ──────────────────────────
    // ── Comando teach — controle do professor NPC ────────────────────────────
    // teach list                → lista aulas disponíveis
    // teach start <lesson-id>   → NPC caminha ao palco e inicia a aula
    // teach next                → avança slide
    // teach prev                → volta slide
    // teach stop                → encerra aula e NPC retorna
    "teach": (args: any) => {
        const isAdmin = infoPlayer.role === "admin" || infoPlayer.role === "moderator";
        if (!isAdmin) return "Permissao negada. Apenas admin ou moderador.";

        const sub  = (args[0] ?? "").toLowerCase();
        const arg2 = (args[1] ?? "").toLowerCase();
        const teacher = (window as any).__teacherNPC;
        if (!teacher) return "Erro: TeacherNPC nao inicializado.";

        // ── teach list ────────────────────────────────────────────────────
        if (!sub || sub === "list") {
            return [
                "Uso do comando teach:",
                "  teach start intro-c        → Intro a linguagem C",
                "  teach start conditionals   → Condicionais em C",
                "  teach start loops          → Loops em C",
                "─────────────────────────────",
                "  teach next    → avanca slide",
                "  teach prev    → volta slide",
                "  teach stop    → encerra aula",
            ].join("\n");
        }

        // ── teach start <lesson-id> ───────────────────────────────────────
        if (sub === "start") {
            if (!arg2) return [
                "Uso: teach start <lesson-id>",
                "  teach start intro-c",
                "  teach start conditionals",
                "  teach start loops",
            ].join("\n");

            teacher.startLesson(arg2);
            return `Prof. Chico indo ao palco — aula: ${arg2}`;
        }

        // ── teach next / prev / stop ──────────────────────────────────────
        if (sub === "next") {
            if (!teacher.isTeaching) return "Nenhuma aula em andamento.";
            teacher.nextSlide();
            return `Avancando: ${teacher.lessonProgress}`;
        }
        if (sub === "prev") {
            if (!teacher.isTeaching) return "Nenhuma aula em andamento.";
            teacher.prevSlide();
            return `Voltando: ${teacher.lessonProgress}`;
        }
        if (sub === "stop") {
            if (!teacher.isTeaching) return "Nenhuma aula em andamento.";
            teacher.endLessonNow?.();
            return "Aula encerrada. Prof. Chico retornando ao ponto de espera.";
        }

        return `Subcomando desconhecido: '${sub}'. Digite: teach list`;
    }
};

// Executar um comando digitado
function executeCommand(command: string, terminal: HTMLDivElement) {
    const parts = command.trim().split(/\s+/);
    const cmd   = parts.shift()?.toLowerCase() ?? "";
    const args  = parts;
    if (!cmd) return;

    if (cmd === "clear") { terminal.innerHTML = ""; return; }

    // Verifica passo de missão ativa antes de executar
    const missionHit = checkMissionStep(cmd, args, terminal);

    if (commands[cmd]) {
        const output = commands[cmd](args);
        if (output) typewriterAppend(output, terminal, detectOutputType(output));
    } else if (!missionHit) {
        // Comando desconhecido e não era passo de missão → glitch + erro
        triggerGlitch(terminal);
        typewriterAppend(
            `✗  comando não encontrado: ${cmd}\nDigite help para ver os comandos disponíveis.`,
            terminal, "error"
        );
    }
}

// Adiciona output sem typewriter — para uso programático externo
export function appendToTerminal(text: string, terminal: HTMLDivElement, type: OutputType = "default") {
    const lines = text.split("\n");
    lines.forEach(line => {
        const div = document.createElement("div");
        div.style.color      = OUTPUT_COLORS[detectOutputType(line) !== "default" ? detectOutputType(line) : type];
        div.style.fontFamily = "'Share Tech Mono',monospace";
        div.style.fontSize   = "12px";
        div.textContent = line;
        terminal.appendChild(div);
    });
    terminal.scrollTop = terminal.scrollHeight;
}

// Formatar quebras de linha no "cat"
function formatMultiline(text: string) {
    return text.split("\n").map(line => ` ${line}`).join("\n");
}

// Função para remover elementos
function removeElement(name: string) {
    let elemento = document.getElementById(name) as HTMLDivElement;
    if (elemento) {
        elemento.remove();
    }
}


createRadialMenu([
    {
         label: "<i class='bx bx-slideshow'></i> Exibidor", 
         value: "presenter", 
         onSelect: () => {
            if (infoPlayer.role !== roles.ADMIN && infoPlayer.role !== roles.MODERATOR) {
                showInstruction("⚠️ Aviso!", "Apenas admin ou moderador pode promover.")
                return
            }
            if(othersPlayers.collideId) {
                SocketManager.promotePlayerTo(othersPlayers.collideId, roles.PRESENTER)
                showInstruction("Info ",`Agora ele é um ${roles.PRESENTER}`)
            } else {
                showInstruction("⚠️ Aviso!","Ninguém por perto.")
            }
        } 
    },
    { 
        label: "<i class='bx bx-chair' ></i> Ouvinte",
        value: "player", 
        onSelect: () => {
            if (infoPlayer.role !== roles.ADMIN && infoPlayer.role !== roles.MODERATOR) {
                showInstruction("⚠️ Aviso!", "Apenas admin ou moderador pode rebaixar.")
                return
            }
            if(othersPlayers.collideId) {
                SocketManager.promotePlayerTo(othersPlayers.collideId, roles.PLAYER)
                showInstruction("Info ",`Agora ele é um ${roles.PLAYER}`)
            } else {
                showInstruction("⚠️ Aviso!","Ninguém por perto.")
            }
        } 
    },
    { label: "<i class='bx bx-music' ></i> Música", value: "music", onSelect: () => {
        if(infoPlayer.role === roles.ADMIN){
            SocketManager.io.emit("music:change", true)
        }
        else
        {
            showInstruction("⚠️ Aviso!","Fale com o administrador")
        }
       
    }},
    { label: "<i class='bx bxs-hand' ></i> Aplausos", value: "aplaudir", onSelect: () => {
        if(infoPlayer.role === roles.ADMIN){
            SocketManager.io.emit("music:interact", true)
        }
        else
        {
            showInstruction("⚠️ Aviso!","Fale com o administrador")
        }
    } },
]);
  

function createRadialMenu(actions: RadialAction[]) {
    document.getElementById('radial-menu')?.remove();
    document.getElementById('radial-overlay')?.remove();

    const count     = actions.length;
    const SIZE      = 320;
    const cx        = SIZE / 2;
    const cy        = SIZE / 2;
    const outerR    = 140;
    const innerR    = 44;
    const labelR    = 96;
    const GAP_DEG   = 3;
    const angleStep = 360 / count;

    // Overlay — z-index alto para ficar acima do terminal (500)
    // SEM backdropFilter para não criar stacking context
    const overlay = document.createElement('div');
    overlay.id = 'radial-overlay';
    overlay.classList.add('hidden');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0',
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(3px)',   // ok aqui pois o radial está em z:9999 fora deste elemento
        zIndex: '9998',
        transition: 'opacity .18s ease',
    });
    document.body.appendChild(overlay);

    // Container — position:fixed centralizado, z-index acima de tudo
    const menu = document.createElement('div');
    menu.id = 'radial-menu';
    menu.classList.add('hidden');
    Object.assign(menu.style, {
        position:  'fixed',
        top:       '50%',
        left:      '50%',
        transform: 'translate(-50%, -50%)',
        width:     SIZE + 'px',
        height:    SIZE + 'px',
        pointerEvents: 'none',
        zIndex:    '9999',
    });

    // SVG — ocupa 100% do container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('width',  '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;inset:0;overflow:visible;';

    // Anel decorativo
    const ringEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ringEl.setAttribute('cx', String(cx));
    ringEl.setAttribute('cy', String(cy));
    ringEl.setAttribute('r',  String(outerR + 7));
    ringEl.setAttribute('fill', 'none');
    ringEl.setAttribute('stroke', 'rgba(240,185,11,0.12)');
    ringEl.setAttribute('stroke-width', '1');
    svg.appendChild(ringEl);
    menu.appendChild(svg);

    // Centro
    const center = document.createElement('div');
    center.className = 'radial-center';
    center.innerHTML = '<span class="center-key">TAB</span><span class="center-label">Ações</span>';
    menu.appendChild(center);

    // Helpers
    const polar = (deg: number, r: number) => {
        const rad = (deg - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    };

    const slicePath = (s: number, e: number) => {
        const p1 = polar(s, outerR), p2 = polar(e, outerR);
        const p3 = polar(s, innerR), p4 = polar(e, innerR);
        const lg = (e - s) > 180 ? 1 : 0;
        return `M${p3.x} ${p3.y} L${p1.x} ${p1.y} A${outerR} ${outerR} 0 ${lg} 1 ${p2.x} ${p2.y} L${p4.x} ${p4.y} A${innerR} ${innerR} 0 ${lg} 0 ${p3.x} ${p3.y}Z`;
    };

    // Fatias + labels
    actions.forEach((action, i) => {
        const startDeg = i * angleStep + GAP_DEG / 2;
        const endDeg   = startDeg + angleStep - GAP_DEG;
        const midDeg   = startDeg + (angleStep - GAP_DEG) / 2;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', slicePath(startDeg, endDeg));
        path.style.cssText = 'fill:rgba(10,10,10,0.80);stroke:rgba(255,255,255,0.07);stroke-width:1.5;cursor:pointer;transition:fill .13s ease;pointer-events:auto;';
        svg.appendChild(path);

        const lp = polar(midDeg, labelR);
        const label = document.createElement('div');
        label.style.cssText = `position:absolute;left:${lp.x}px;top:${lp.y}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:auto;cursor:pointer;user-select:none;text-align:center;`;

        const tmp = document.createElement('div');
        tmp.innerHTML = action.label;
        const iconEl   = tmp.querySelector('i');
        const iconHTML = iconEl ? iconEl.outerHTML : '';
        const txt      = (tmp.textContent || '').trim();

        const iconSpan = document.createElement('span');
        iconSpan.innerHTML  = iconHTML;
        iconSpan.style.cssText = 'font-size:20px;color:rgba(255,255,255,0.88);line-height:1;transition:color .13s;display:block;';

        const textSpan = document.createElement('span');
        textSpan.textContent    = txt;
        textSpan.style.cssText  = 'font-family:Poppins,sans-serif;font-size:9px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,0.65);white-space:nowrap;transition:color .13s;';

        label.appendChild(iconSpan);
        label.appendChild(textSpan);
        menu.appendChild(label);

        const hi = () => { path.style.fill='rgba(240,185,11,0.92)'; iconSpan.style.color='#111'; textSpan.style.color='#111'; };
        const lo = () => { path.style.fill='rgba(10,10,10,0.80)'; iconSpan.style.color='rgba(255,255,255,0.88)'; textSpan.style.color='rgba(255,255,255,0.65)'; };

        [path, label].forEach(el => {
            el.addEventListener('mouseenter', hi);
            el.addEventListener('mouseleave', lo);
            el.addEventListener('click', () => { toggle(false); action.onSelect(); });
        });
    });

    document.body.appendChild(menu);

    const toggle = (force?: boolean) => {
        const open = force !== undefined ? force : menu.classList.contains('hidden');
        if (open) {
            menu.classList.remove('hidden');
            overlay.classList.remove('hidden');
            menu.style.opacity    = '0';
            menu.style.scale      = '0.85';
            menu.style.transition = 'opacity .18s ease, scale .18s ease';
            menu.getBoundingClientRect();
            menu.style.opacity = '1';
            menu.style.scale   = '1';
        } else {
            menu.style.opacity = '0';
            menu.style.scale   = '0.85';
            overlay.classList.add('hidden');
            setTimeout(() => menu.classList.add('hidden'), 180);
        }
    };

    overlay.addEventListener('click', () => toggle(false));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { e.preventDefault(); toggle(); }
        if (e.key === 'Escape') toggle(false);
    });
}


export function showInstruction(title: string, content: string){
    // Atualiza o elemento legado (usado pelo driver.js)
    const instruction = document.getElementById("instruction") as HTMLDivElement
    if (instruction) {
        instruction.innerHTML = `
            <div class="inst-title">${title}</div>
            <div class="inst-subtitle">${content}</div>
        `
    }
    // Dispara toast no HUD novo
    ;(window as any).HUD?.notify(`${title} — ${content}`, 'info');
}

export default elementos;