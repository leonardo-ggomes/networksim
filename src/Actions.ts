import { infoPlayer } from "./InfoPlayer";
import SocketManager from "./SocketManager";

//Compartilhado globalmente
export const eventEmitter = new EventTarget();
const socket = new SocketManager()

const currency = Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const contentFiles: any[] = []
const filesInMission = [" log.txt"];

//Processes
const processes = [
    { name: "apache", pid: 1234, memory: 145.6, cpu: 21 },
    { name: "bash", pid: 5678, memory: 50.2, cpu: 0.2 },
    { name: "mariadb", pid: 9012, memory: 293.4, cpu: 17 },
    { name: "svchost", pid: 3456, memory: 20.8, cpu: 0.3 },
    { name: "netns", pid: 1111, memory: 15.7, cpu: 3.7 }
];

// Variáveis de estado
let isCollided = false;
let missionContent = "";


type file = {
    name: string,
    content: string[]
}

type dir = {
    name: string,
    contentFile: file[],
    contentDir: string[]
}

const rootPath = "/"
let diretories: { [key: string]: dir } = {}
let systemDirs = ["bin", "home","var"]

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

export let isRemotelyConnected = false;
let serverAddressRemote = "teste@123"
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
    setProcesses: (name: string, pid: number, memoryInMB: number, cpu: number) => {
        processes.push({
            name: name,
            pid: pid,
            memory: memoryInMB,
            cpu: cpu
        })
    },
    setFilesInMission: (name: string, content: string) => {
        filesInMission.push(name)
        contentFiles.push({ name, content })
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
        terminal.style.fontFamily = "poppins";
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
    "help": () => `  Comandos disponíveis: 
            ping [host] → Testa a conexão com um host.
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
            let changerDir = `${currentDir}${args[0]}/`
            if (diretories[changerDir]) {
                currentDir = changerDir
                return ""
            }
        }

        return "Erro: Diretório não encontrado.";
    },
    "cat": (args) => {
        if (args[0] === "log.txt" && isCollided && currentDir == "/Missao ") {
            return missionContent ? formatMultiline(missionContent) : "Arquivo vazio.";
        }
        else if (args[0] === "notas.txt" && currentDir == "") {
            return `Energia:  ${infoPlayer.energy} ⚡`
        }

        if (args.length == 0) {
            return `Erro: Comando inválido.`;
        }

        return `Erro: O arquivo "${args[0]}" não existe.`;
    },
    "ls": () => {

        if(isRemotelyConnected)
        {
            socket.sendRemoteAccess(currentDir, "", "ls")
            return ""
        }
       
        const actualDir = diretories[currentDir];
        let AllFilesAndDirs = `\n${actualDir.contentDir.map(dir => ` ${dir}`).join("  ")}`
        AllFilesAndDirs += `${actualDir.contentFile.map(file => ` ${file}`).join("  ")}`

        return AllFilesAndDirs;
    },
    "ps": () => {
        return `
        USUÁRIO     PID     %CPU     %MEM     COMANDO
        --------------------------------------
       ${processes.map(p => `user     ${p.pid}     ${p.cpu}     ${p.memory}     ${p.name}`).join("\n       ")}`;
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
        if (args.length > 0) {
            const foundFile = contentFiles.filter(f => f.name == args[0])[0]

            if (args[1]) {
                if (args[2]) {

                    let comando = ""

                    for (let i = 2; i < args.length; i++) {
                        comando += args[i] + " "
                    }

                    eventEmitter.dispatchEvent(new CustomEvent("new_code", {
                        detail: {
                            nano: comando,
                            line: args[1],
                            isCollided: isCollided
                        }
                    }));

                    return comando
                }

                return `
                    nano [aquivo] [linha] (código aqui)
                    Use > Exemplo: nano demo.js 5 (var y = 0; //Seu código)
                 `
            }
            else {
                if (foundFile) {
                    return foundFile.content
                }

                return `Não foi encontrado o aquivo ${args[0]}.`
            }
        }

        return "Falta argumento para esse comando"
    },
    "mkdir": (args) => {

        if (args[0]) {
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
    "ssh": (args) => {
        if (args[0]) 
        {
            if(args[0] === serverAddressRemote)
            {
                isRemotelyConnected = true;
                currentPrefix = serverPrefix
                return "Conectado ao servidor remoto"
            }
            else
            {
                return `SSH: Conexão não realizada para ${args[0]}`
            }
        }
        else
        {
            return "Uso: ssh <user>@<server>"
        }
    },
    "exit": () => {

        if(currentPrefix == serverPrefix)
        {
            isRemotelyConnected = false;
            currentPrefix = localPrefix
        }

        return ""
    }
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

export default elementos;
