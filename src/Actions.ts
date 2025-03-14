import { infoPlayer } from "./InfoPlayer";

//Compartilhado globalmente
export const eventEmitter = new EventTarget();

const currency = Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const contentFiles: any[] = []
const filesInMission = ["\n  -- log.txt     15 bytes"];
const dirInMission = ["\n  -- missao     <DIR>"];
const filesRoot = ["\n  -- carteira.txt    3 bytes"];

//Processes
const processes = [
    { name: "explorer.exe", pid: 1234, memory: "45.6 MB" },
    { name: "chrome.exe", pid: 5678, memory: "150.2 MB" },
    { name: "notepad.exe", pid: 9012, memory: "3.4 MB" },
    { name: "svchost.exe", pid: 3456, memory: "20.8 MB" },
    { name: "cmd.exe", pid: 1111, memory: "5.7 MB" }
];

// Variáveis de estado
let isCollided = false;
let missionContent = "";

let currentPrefix = "C:\\"; // Prefixo dinâmico do terminal

// Funções globais
let elementos = {
    showTerminal: createTerminal,
    hideTerminal: () => {
        removeElement('terminal')
        removeElement('framescreen')
    },
    setIsCollided: (state: boolean) => { isCollided = state; },
    setCurrentMission: (currentMission: string) => { missionContent = currentMission; },
    setProcesses: (name: string, pid: number, memoryInMB: number) => {
        processes.push({
            name: name,
            pid: pid,
            memory: `${memoryInMB} MB`
        })
    },
    setFilesInMission: (name: string, content: string) => {
        filesInMission.push(name)
        contentFiles.push({name, content})
    },
    showMsg: (msg: string) =>{
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
function addNewCommandLine(terminal: HTMLDivElement) {
    const commandLine = document.createElement("div");
    commandLine.style.display = "flex";
    commandLine.style.alignItems = "center";

    // Prefixo
    const prefix = document.createElement("span");
    prefix.textContent = `${currentPrefix}> `;
    prefix.style.color = "white";
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
    "ping": (args) => `  Ping: disparando ${args[0] || "127.0.0.1"}: bytes=32 time<1ms TTL=128>`,
    "ipconfig": () => `  Ethernet adapter:\n IPv4 Address: 192.168.1.100\n Subnet Mask: 255.255.255.0\n Default Gateway: 192.168.1.1`,
    "help": () => `  Comandos disponíveis: 
            \n ping [host] → Simula o comando ping, testando a conexão com um host.
            \n ipconfig → Exibe informações de rede, como IP, máscara de sub-rede e gateway.
            \n help → Lista os comandos disponíveis no terminal.
            \n clear → Limpa o terminal.
            \n cd → Entra em uma missão, se estiver em um local válido.
            \n type [arquivo] → Exibe o conteúdo de um arquivo dentro da missão.
            \n dir → Lista os arquivos disponíveis no diretório atual.
            \n tasklist → Lista todos os processos.
            \n taskkill /PID [PID] /F → Elimina um processo`,
    "clear": () => "",
    "cd": (args) => {

        if (isCollided && args[0] !== "..") {
            if(args[0] == "missao"){
                currentPrefix = "C:\\Missao";
                return "Entrando na missão...\nC:\\Missao>";
            }
            else{
                return "Caminho não encontrado.";
            }
        }

        if(args[0] == ".." && currentPrefix == "C:\\Missao"){
            currentPrefix = "C:\\";
            return "Saindo da missão...\nC:\\>";
        }
        else if(args[0] == ".."){
            return currentPrefix
        }

        return "Erro: Você não está em um local de missão.";
    },
    "type": (args) => {
        
        if (args[0] === "log.txt" && isCollided &&  currentPrefix == "C:\\Missao") {
            return missionContent ? formatMultiline(missionContent) : "Arquivo vazio.";
        }
        else if(args[0] === "carteira.txt" && currentPrefix == "C:\\"){
            return `Saldo em dinheiro: ${currency.format(infoPlayer.money)}`
        }

        if(args.length == 0){
            return `Erro: Comando inválido.`;
        }

        return `Erro: O arquivo "${args[0]}" não existe.`;
    },
    "dir": () => {
        const files = isCollided ? currentPrefix == "C:\\Missao" ? filesInMission : dirInMission : filesRoot;
        return `Arquivos em ${currentPrefix}:\n${files.map(file => ` ${file}`).join("\n")}`;
    },
    "tasklist": () => {
        return ` Nome do Processo         PID      Memória  
        -------------------------------------------
            ${processes.map(p => ` ${p.name}     ${p.pid}    ${p.memory}`).join("\n")}`;
    },
    "taskkill": (args) => {
        if (args.length < 3 || args[0] !== "/PID" || args[2] !== "/F") {
            return "Erro: Uso correto: taskkill /PID [número] /F";
        }

        const pid = parseInt(args[1]);
        const index = processes.findIndex(p => p.pid === pid);

        if (index === -1) {
            return `Erro: Processo com PID ${pid} não encontrado.`;
        }

        processes.splice(index, 1); // Remove o processo da lista
        eventEmitter.dispatchEvent(new CustomEvent("remove_pid", { detail: { processes, isCollided }  }));
        return `Processo ${pid} encerrado com sucesso.`;
    },
    "code": (args) => {
        if(args.length > 0){
            const foundFile = contentFiles.filter(f => f.name == args[0])[0]
            
            if(args[1]){
                if(args[2]){

                    let comando = ""

                    for(let i = 2; i < args.length; i++){
                        comando += args[i] + " "
                    }

            
                    eventEmitter.dispatchEvent(new CustomEvent("new_code", { detail: {
                        code: comando,
                        line: args[1],
                        isCollided: isCollided
                    }}));

                    return comando
                }

                return `
                    code [aquivo] [linha] (código aqui)
                    Use > Exemplo: code demo.js 5 (var y = 0; //Seu código)
                 `
            }
            else{
                if(foundFile){
                    return foundFile.content
                }

                return `Não foi encontrado o aquivo ${args[0]}.`
            }          

            
        }

        return "Falta argumento para esse comando"
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
function appendToTerminal(text: string, terminal: HTMLDivElement) {
    const lines = text.split("\n");
    lines.forEach(line => {
        const div = document.createElement("div");
        div.textContent = line;
        terminal.appendChild(div);
    });
    terminal.scrollTop = terminal.scrollHeight;
}

// Formatar quebras de linha no "type"
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
