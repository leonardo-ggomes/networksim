import { infoPlayer, othersPlayers, roles } from "./InfoPlayer";
import SocketManager from "./SocketManager";

//Compartilhado globalmente
export const eventEmitter = new EventTarget();

let missionContent = ""

//Processes
const processes = [
    { pid: 1234, user: "root", cpu: "0.3%", mem: "1.2%", command: "systemd" },
    { pid: 5678, user: "me", cpu: "1.8%", mem: "0.9%", command: "node server.js" },
    { pid: 9101, user: "me", cpu: "0.1%", mem: "0.5%", command: "bash" },
    { pid: 1121, user: "me", cpu: "2.5%", mem: "1.1%", command: "firefox" },
    { pid: 2233, user: "me", cpu: "0.7%", mem: "0.3%", command: "htop" },
];

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
    setCurrentMission: (currentMission: string) => { missionContent = currentMission; },
    setProcesses: (name: string, pid: number, memory: number, cpu: number) => {
        processes.push({
            command: name,
            pid: pid,
            mem: memory.toString(),
            cpu: cpu.toString(),
            user: "default"
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
        showMissionFinished(msg)
    }
};

// Criar o terminal — dispositivo estilo GTA V
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

    // Boot message
    const bootLines = [
        { t:`HackOS v2.4 — kernel 6.1.0-secure`, c:V.blue },
        { t:`Montando sistema de arquivos... OK`,  c:V.muted },
        { t:`Inicializando módulos de rede... OK`, c:V.muted },
        { t:`Conexão: 192.168.1.100`, c:V.muted },
        { t:``, c:"" },
    ];
    bootLines.forEach(({ t, c }, i) => {
        setTimeout(() => {
            if (t) {
                const d = document.createElement("div");
                d.style.color = c;
                d.textContent = t;
                terminal.appendChild(d);
            }
            if (i === bootLines.length - 1) addNewCommandLine(terminal);
        }, i * 90);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PAINEL: PROCESSOS
    // ══════════════════════════════════════════════════════════════════════════
    const procPanel = panels["processes"];

    const procToolbar = document.createElement("div");
    css(procToolbar, { padding:"8px 14px", borderBottom:`1px solid ${V.border}`,
                       display:"flex", alignItems:"center", justifyContent:"space-between" });
    const procCount = document.createElement("span");
    css(procCount, { fontFamily:"'Rajdhani',sans-serif", fontSize:"10px",
                     letterSpacing:".15em", color:V.muted, textTransform:"uppercase" });
    const killBtn = document.createElement("button");
    css(killBtn, { fontFamily:"'Rajdhani',sans-serif", fontSize:"11px", fontWeight:"700",
                   letterSpacing:".1em", textTransform:"uppercase",
                   padding:"4px 12px", background:"transparent",
                   border:`1px solid ${V.red}`, color:V.red,
                   borderRadius:"3px", cursor:"pointer" });
    killBtn.innerHTML = `<i class='bx bx-x-circle'></i> Kill -9`;
    procToolbar.appendChild(procCount);
    procToolbar.appendChild(killBtn);
    procPanel.appendChild(procToolbar);

    const procScroll = document.createElement("div");
    css(procScroll, { flex:"1", overflowY:"auto", padding:"0 14px 12px" });
    const procTable = document.createElement("table");
    procTable.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;";
    procTable.innerHTML = `<thead><tr>
        ${["PID","USUÁRIO","%CPU","%MEM","COMANDO"].map(h =>
            `<th style="padding:8px 6px;font-family:'Rajdhani',sans-serif;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:${V.muted};border-bottom:1px solid ${V.border};text-align:left">${h}</th>`
        ).join("")}
    </tr></thead>`;
    const procBody = document.createElement("tbody");
    procTable.appendChild(procBody);
    procScroll.appendChild(procTable);
    procPanel.appendChild(procScroll);
    device.appendChild(procPanel);

    let selectedPid: number | null = null;

    function renderProcs() {
        procCount.textContent = `Processos ativos — ${processes.length}`;
        procBody.innerHTML = "";
        processes.forEach(p => {
            const tr = document.createElement("tr");
            tr.style.cursor = "pointer";
            const highCpu = parseFloat(p.cpu) > 1.5;
            tr.innerHTML = `
                <td style="padding:7px 6px;color:${V.yellow};border-bottom:1px solid rgba(13,46,28,.5)">${p.pid}</td>
                <td style="padding:7px 6px;color:${V.text};border-bottom:1px solid rgba(13,46,28,.5)">${p.user}</td>
                <td style="padding:7px 6px;color:${highCpu?V.red:V.green};border-bottom:1px solid rgba(13,46,28,.5)">${p.cpu}%</td>
                <td style="padding:7px 6px;color:${V.text};border-bottom:1px solid rgba(13,46,28,.5)">${p.mem}%</td>
                <td style="padding:7px 6px;color:${V.text};border-bottom:1px solid rgba(13,46,28,.5)">${p.command}</td>
            `;
            tr.addEventListener("click", () => {
                procBody.querySelectorAll("tr").forEach((r:any) => r.style.background="");
                tr.style.background = "rgba(0,255,157,0.08)";
                selectedPid = p.pid;
            });
            procBody.appendChild(tr);
        });
    }

    killBtn.addEventListener("click", () => {
        if (selectedPid === null) return;
        const idx = processes.findIndex(p => p.pid === selectedPid);
        if (idx !== -1) { processes.splice(idx, 1); selectedPid = null; renderProcs(); }
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PAINEL: ARQUIVOS
    // ══════════════════════════════════════════════════════════════════════════
    const filePanel = panels["files"];
    css(filePanel, { flexDirection:"row" });

    const sidebar = document.createElement("div");
    css(sidebar, { width:"150px", borderRight:`1px solid ${V.border}`,
                   padding:"12px 0", overflowY:"auto" });

    const fileMain = document.createElement("div");
    css(fileMain, { flex:"1", display:"flex", flexDirection:"column", overflow:"hidden" });

    const fileToolbar = document.createElement("div");
    css(fileToolbar, { padding:"8px 14px", borderBottom:`1px solid ${V.border}`,
                       display:"flex", alignItems:"center", justifyContent:"space-between" });
    const pathDisplay = document.createElement("span");
    css(pathDisplay, { fontSize:"11px", color:V.green, fontFamily:"'Share Tech Mono',monospace" });
    const newBtn = document.createElement("button");
    css(newBtn, { fontFamily:"'Rajdhani',sans-serif", fontSize:"11px", fontWeight:"700",
                  letterSpacing:".1em", textTransform:"uppercase",
                  padding:"4px 10px", background:"transparent",
                  border:`1px solid ${V.green2}`, color:V.green2,
                  borderRadius:"3px", cursor:"pointer" });
    newBtn.textContent = "+ Novo";
    fileToolbar.appendChild(pathDisplay);
    fileToolbar.appendChild(newBtn);

    const fileList = document.createElement("div");
    css(fileList, { flex:"1", overflowY:"auto", padding:"10px 14px" });

    fileMain.appendChild(fileToolbar);
    fileMain.appendChild(fileList);
    filePanel.appendChild(sidebar);
    filePanel.appendChild(fileMain);
    device.appendChild(filePanel);

    let fileViewDir = "/";

    function renderFilesPanel() {
        sidebar.innerHTML = "";
        Object.keys(diretories).forEach(path => {
            const d = document.createElement("div");
            css(d, { padding:"7px 14px", fontSize:"10px",
                     color: path===fileViewDir ? V.green : V.muted,
                     background: path===fileViewDir ? "rgba(0,255,157,0.06)" : "transparent",
                     cursor:"pointer", display:"flex", alignItems:"center",
                     gap:"6px", transition:"color .12s" });
            d.innerHTML = `<i class='bx bx-folder' style="font-size:13px"></i>${path}`;
            d.addEventListener("click", () => { fileViewDir = path; renderFilesPanel(); });
            sidebar.appendChild(d);
        });

        pathDisplay.textContent = fileViewDir;
        fileList.innerHTML = "";
        const dir = diretories[fileViewDir];
        if (!dir) return;

        dir.contentDir.forEach(name => {
            const item = document.createElement("div");
            css(item, { display:"flex", alignItems:"center", gap:"8px",
                        padding:"7px 8px", borderRadius:"4px", cursor:"pointer",
                        color:V.text, fontSize:"12px", transition:"background .12s" });
            item.innerHTML = `<i class='bx bx-folder' style="color:${V.green};font-size:15px"></i>${name}/ <span style="color:${V.muted};font-size:10px;margin-left:auto">DIR</span>`;
            item.addEventListener("click", () => { fileViewDir += name+"/"; renderFilesPanel(); });
            fileList.appendChild(item);
        });

        dir.contentFile.forEach(f => {
            const ext = f.name.split(".").pop()?.toUpperCase() || "";
            const item = document.createElement("div");
            css(item, { display:"flex", alignItems:"center", gap:"8px",
                        padding:"7px 8px", borderRadius:"4px",
                        color:V.text, fontSize:"12px", transition:"background .12s" });
            item.innerHTML = `<i class='bx bx-file' style="color:${V.green};font-size:15px"></i>${f.name} <span style="color:${V.muted};font-size:10px;margin-left:auto">${ext}</span>`;
            fileList.appendChild(item);
        });

        if (!dir.contentDir.length && !dir.contentFile.length) {
            fileList.innerHTML = `<div style="color:${V.muted};font-size:11px;padding:20px 8px;text-align:center">Diretório vazio</div>`;
        }
    }

    newBtn.addEventListener("click", () => {
        const name = prompt("Nome do arquivo (ex: script.js):");
        if (!name) return;
        const content = prompt("Conteúdo:") || "";
        diretories[fileViewDir]?.contentFile.push({ name, content });
        renderFilesPanel();
    });

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
    commandLine.style.display = "flex";
    commandLine.style.alignItems = "center";

    // Prefixo
    const prefix = document.createElement("span");
    prefix.textContent = `${currentPrefix} ${currentDir}`;
    prefix.style.color = "#00a99d";
    commandLine.appendChild(prefix);

    // Campo de entrada editável
    const input = document.createElement("span");
    input.contentEditable = "true";
    input.style.outline = "none";
    input.style.color = "white";
    input.style.wordBreak = "break-word"; // Quebra palavras longas automaticamente
    input.style.overflow = "hidden"; // Impede que o texto ultrapasse os limites
    input.style.flexGrow = "1";
    input.style.whiteSpace = "pre-wrap";
    commandLine.appendChild(input);

    terminal.appendChild(commandLine);
    terminal.scrollTop = terminal.scrollHeight;
    input.focus();


    input.addEventListener("keydown", (event) => {
        event.stopPropagation();

        if (event.key === "Enter") {
            event.preventDefault();

            const command = input.innerText.trim();
            if (command !== "") {
                executeCommand(command, terminal);
            }

            input.contentEditable = "false";
            addNewCommandLine(terminal);
        }
    });

    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("keypress", (event) => event.stopPropagation());


}
// Dicionário de comandos do terminal
const commands: Record<string, (args: string[]) => string> = {
    "ping": (args) => `  PING ${args[0] || "127.0.0.1"}: 56 data bytes\n64 bytes from ${args[0] || "127.0.0.1"}: icmp_seq=1 ttl=64 time=0.5 ms`,
    "pwd": () => currentDir,
    "ifconfig": () => `  eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n inet 192.168.1.100  netmask 255.255.255.0  broadcast 192.168.1.255\n gateway 192.168.1.1`,
    "help": () => `ping [host] → Testa a conexão com um host.
ifconfig → Exibe informações de rede.
help → Lista os comandos disponíveis no terminal.
clear → Limpa o terminal.
cd [diretório] → Entra em um diretório válido.
cat [arquivo] → Exibe o conteúdo de um arquivo.
ls → Lista os arquivos disponíveis no diretório atual.
ps aux → Lista todos os processos.
ssh [user@address] → Realiza um conexão remota.
kill -9 [PID] → Elimina um processo forçadamente.`,
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
        // Criar um elemento <pre> separado do estilo global
            let terminal = document.getElementById("terminal") as HTMLDivElement;
            
            if(terminal)
            {
                const pre = document.createElement("pre");
                pre.style.color = "#00ff00";
                pre.style.fontFamily = "monospace";
                pre.style.whiteSpace = "pre"; // Mantém formatação fixa
                pre.style.margin = "0"; // Remove margens extras
    
                // Criar cabeçalho
                let output = `PID     USER      %CPU    %MEM    COMMAND\n`;
                output += `--------------------------------------------\n`;
    
                // Criar linhas formatadas
                processes.forEach(p => {
                    output += `${p.pid.toString().padEnd(7)} ${p.user.padEnd(9)} ${p.cpu.padEnd(7)} ${p.mem.padEnd(7)} ${p.command}\n`;
                });
    
                pre.textContent = output; // Adicionar saída formatada no <pre>
                terminal.appendChild(pre)
            }

            return ""
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

        return info
    },
    "energy": () => `Energia: ${infoPlayer.energy}% ⚡`,
    "su": (args) => {

        if (args[0]) {
            if (args[0] === "123") {
                console.log(SocketManager.io.id)
                infoPlayer.role = roles.ADMIN
                SocketManager.promotePlayerTo(SocketManager.io.id as string, roles.ADMIN)
            }
            else {
                return `Inválido`
            }
        }
        else {
            return "Uso: su <senha>"
        }

        return ""
    },
};

// Executar um comando digitado
function executeCommand(command: string, terminal: HTMLDivElement) {
    const args = command.split(" ");
    const cmd = args.shift()?.toLowerCase();

    if (!cmd) return;

    if (cmd === "clear") {
        terminal.innerHTML = "";
        addNewCommandLine(terminal);
        return;
    }

    const output = commands[cmd] ? commands[cmd](args) : `Comando não reconhecido: ${cmd}`;
    appendToTerminal(output, terminal);
}

// Adiciona a saída no terminal
export function appendToTerminal(text: string, terminal: HTMLDivElement) {
    const lines = text.split("\n");
    lines.forEach(line => {
        const div = document.createElement("div");
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

function showMissionFinished(text: string) {
    let status = document.getElementById("status") as HTMLDivElement;

    if (!status) {
        status = document.createElement("div");
        status.id = "status";

        status.style.position = "absolute";
        status.style.top = "50%";
        status.style.left = "50%";
        status.style.transform = "translate(-50%, -50%)"
        status.style.color = "#ffffff";
        status.style.fontSize = "51px";
        status.style.textAlign = "center"
        status.style.fontFamily = "Poppins"
        status.style.fontWeight = "bold"
        status.innerHTML = text
        document.body.appendChild(status);

        setTimeout(() => {
            document.body.removeChild(status)
        }, 4000)
    }

}

createRadialMenu([
    {
         label: "<i class='bx bx-slideshow'></i> Exibidor", 
         value: "presenter", 
         onSelect: () => {
            if(othersPlayers.collideId)
            {
                SocketManager.promotePlayerTo(othersPlayers.collideId, roles.PRESENTER)
                showInstruction("Info ",`Agora ele é um ${roles.PRESENTER}`)
            }
            else
            {
                showInstruction("⚠️ Aviso!","Ninguém por perto.")
            }
        } 
    },
    { 
        label: "<i class='bx bx-chair' ></i> Ouvinte",
        value: "player", 
        onSelect: () => {
            if(othersPlayers.collideId)
            {
                SocketManager.promotePlayerTo(othersPlayers.collideId, roles.PLAYER)
                showInstruction("Info ",`Agora ele é um ${roles.PLAYER}`)
            }
            else
            {
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
    const instruction = document.getElementById("instruction") as HTMLDivElement
    instruction.innerHTML = `
        <div class="inst-title">${title}</div>
        <div class="inst-subtitle">
            ${content}
        </div>
    `
}

export default elementos;