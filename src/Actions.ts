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

// Criar o terminal
function createTerminal() {
    let terminal = document.getElementById("terminal") as HTMLDivElement;

    if (!terminal) {
        let framescreen = document.createElement("div");
        framescreen.id = "framescreen"
        framescreen.style.background = "url(img/screenframe.png) no-repeat center center";
        framescreen.style.position = "absolute";
        framescreen.style.bottom = "10px";
        framescreen.style.right = "10px";
        framescreen.style.backgroundSize = "cover";
        framescreen.style.width = "500px";
        framescreen.style.height = "300px";


        terminal = document.createElement("div");
        terminal.id = "terminal";

        terminal.style.position = "absolute";
        terminal.style.bottom = "56px";
        terminal.style.right = "44px";
        terminal.style.width = "406px";
        terminal.style.height = "207px";
        terminal.style.whiteSpace = "pre-wrap";

        // terminal.style.border = "1px solid gray";
        terminal.style.background = "transparent";
        terminal.style.color = "white";
        terminal.style.fontFamily = "monospace";
        terminal.style.fontSize = "12px";
        terminal.style.overflowY = "auto";
        terminal.style.display = "flex";
        terminal.style.flexDirection = "column";
        terminal.style.justifyContent = "flex-start";
        // terminal.style.borderRadius = "4px";

        framescreen.appendChild(terminal)
        document.body.appendChild(framescreen);
    }

    addNewCommandLine(terminal);
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
  

// ═══════════════════════════════════════════════════════════════
// createRadialMenu — Estilo GTA V
// Substitui a função createRadialMenu atual no Actions.ts
// ═══════════════════════════════════════════════════════════════
//
// Como funciona:
//   - SVG com <path> em forma de fatia de pizza para cada item
//   - Labels HTML posicionados pelo ângulo médio de cada fatia
//   - Overlay com backdrop-blur escurece a cena ao abrir
//   - Hover no segmento SVG sincroniza highlight da label via JS
//   - Animação de entrada via classe CSS (opacity + scale)

function createRadialMenu(actions: RadialAction[]) {
    document.getElementById('radial-menu')?.remove();
    document.getElementById('radial-overlay')?.remove();

    const count   = actions.length;
    const SIZE    = 320;
    const cx      = SIZE / 2;
    const cy      = SIZE / 2;
    const outerR  = 140;
    const innerR  = 44;
    const labelR  = 96;
    const GAP_DEG = 3;
    const angleStep = 360 / count;

    // ── Overlay ──────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'radial-overlay';
    overlay.classList.add('hidden');
    document.body.appendChild(overlay);

    // ── Container fixo, centralizado ─────────────────────────────
    // position:fixed + transform:translate já centraliza na tela.
    // O SVG e as labels usam coordenadas relativas a este container.
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
        zIndex:    '1000',
    });

    // ── SVG ocupa 100% do container ───────────────────────────────
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('width',  '100%');
    svg.setAttribute('height', '100%');
    svg.style.position = 'absolute';
    svg.style.inset    = '0';
    svg.style.overflow = 'visible';

    // anel decorativo
    const ringEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ringEl.setAttribute('cx', String(cx));
    ringEl.setAttribute('cy', String(cy));
    ringEl.setAttribute('r',  String(outerR + 7));
    ringEl.setAttribute('fill',         'none');
    ringEl.setAttribute('stroke',       'rgba(240,185,11,0.12)');
    ringEl.setAttribute('stroke-width', '1');
    svg.appendChild(ringEl);

    menu.appendChild(svg);

    // ── Centro HTML (position:absolute relativo ao container) ─────
    const center = document.createElement('div');
    center.className = 'radial-center';
    center.innerHTML = '<span class="center-key">TAB</span><span class="center-label">Ações</span>';
    menu.appendChild(center);

    // ── Helpers ───────────────────────────────────────────────────
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

    // ── Fatias + labels ───────────────────────────────────────────
    actions.forEach((action, i) => {
        const startDeg = i * angleStep + GAP_DEG / 2;
        const endDeg   = startDeg + angleStep - GAP_DEG;
        const midDeg   = startDeg + (angleStep - GAP_DEG) / 2;

        // Segmento SVG
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', slicePath(startDeg, endDeg));
        path.style.fill            = 'rgba(10,10,10,0.80)';
        path.style.stroke          = 'rgba(255,255,255,0.07)';
        path.style.strokeWidth     = '1.5';
        path.style.cursor          = 'pointer';
        path.style.transition      = 'fill 0.13s ease';
        path.style.pointerEvents   = 'auto';
        svg.appendChild(path);

        // Label: position:absolute em px relativos ao container (SIZE×SIZE)
        // polar() já retorna coordenadas dentro do espaço 0..SIZE
        const lp = polar(midDeg, labelR);
        const label = document.createElement('div');
        label.style.position  = 'absolute';
        label.style.left      = lp.x + 'px';
        label.style.top       = lp.y + 'px';
        label.style.transform = 'translate(-50%, -50%)';
        label.style.display   = 'flex';
        label.style.flexDirection  = 'column';
        label.style.alignItems     = 'center';
        label.style.justifyContent = 'center';
        label.style.gap            = '4px';
        label.style.pointerEvents  = 'auto';
        label.style.cursor         = 'pointer';
        label.style.userSelect     = 'none';
        label.style.textAlign      = 'center';

        // Separa ícone do texto
        const tmp = document.createElement('div');
        tmp.innerHTML = action.label;
        const iconEl   = tmp.querySelector('i');
        const iconHTML = iconEl ? iconEl.outerHTML : '';
        const txt      = (tmp.textContent || '').trim();

        const iconSpan = document.createElement('span');
        iconSpan.innerHTML  = iconHTML;
        iconSpan.style.fontSize   = '20px';
        iconSpan.style.color      = 'rgba(255,255,255,0.88)';
        iconSpan.style.lineHeight = '1';
        iconSpan.style.transition = 'color 0.13s';

        const textSpan = document.createElement('span');
        textSpan.textContent        = txt;
        textSpan.style.fontFamily   = 'Poppins, sans-serif';
        textSpan.style.fontSize     = '9px';
        textSpan.style.fontWeight   = '600';
        textSpan.style.letterSpacing = '0.07em';
        textSpan.style.textTransform = 'uppercase';
        textSpan.style.color         = 'rgba(255,255,255,0.65)';
        textSpan.style.whiteSpace    = 'nowrap';
        textSpan.style.transition    = 'color 0.13s';

        label.appendChild(iconSpan);
        label.appendChild(textSpan);
        menu.appendChild(label);

        // Hover: sincroniza segmento ↔ label
        const hi = () => {
            path.style.fill        = 'rgba(240,185,11,0.92)';
            iconSpan.style.color   = '#111';
            textSpan.style.color   = '#111';
        };
        const lo = () => {
            path.style.fill        = 'rgba(10,10,10,0.80)';
            iconSpan.style.color   = 'rgba(255,255,255,0.88)';
            textSpan.style.color   = 'rgba(255,255,255,0.65)';
        };

        [path, label].forEach(el => {
            el.addEventListener('mouseenter', hi);
            el.addEventListener('mouseleave', lo);
            el.addEventListener('click', () => {
                toggle(false);
                action.onSelect();
            });
        });
    });

    document.body.appendChild(menu);

    // ── Toggle ────────────────────────────────────────────────────
    const toggle = (force?: boolean) => {
        const open = force !== undefined ? force : menu.classList.contains('hidden');
        if (open) {
            menu.classList.remove('hidden');
            overlay.classList.remove('hidden');
            menu.style.opacity      = '0';
            menu.style.scale        = '0.85';
            menu.style.transition   = 'opacity 0.18s ease, scale 0.18s ease';
            // Força reflow para a animação funcionar
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
        if (e.key === 'Tab') {
            e.preventDefault();
            toggle();
        }
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