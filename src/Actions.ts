import { CCompiler } from "./Compiler";
import { infoPlayer, othersPlayers, roles } from "./InfoPlayer";
import SocketManager from "./SocketManager";

// ══════════════════════════════════════════════════════════════════════════════
// REDE VIRTUAL — Motor de estado de rede por player
// Estado local: _netState (este player)
// Estado remoto: window.__netPeers (outros players, atualizado via socket)
// ══════════════════════════════════════════════════════════════════════════════

interface _NetIface  { name:string; ip?:string; prefix:number; mac:string; up:boolean }
interface _NetRoute  { dest:string; via?:string; dev:string; metric:number }
interface _NetService{ name:string; port:number; running:boolean; pid:number; crashMsg?:string }
interface _NetNode   { socketId:string; playerName:string; hostname:string;
                       interfaces:_NetIface[]; routes:_NetRoute[]; services:_NetService[] }

function _randMac(){ return Array.from({length:6},()=>Math.floor(Math.random()*256).toString(16).padStart(2,"0")).join(":") }
function _ipNum(ip:string){ return ip.split(".").reduce((a,o)=>(a<<8)+parseInt(o),0)>>>0 }
function _numIp(n:number){ return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".") }
function _inSubnet(ip:string,cidr:string){
    const [net,bits]=cidr.split("/"); const mask=bits?(0xFFFFFFFF<<(32-+bits))>>>0:0xFFFFFFFF;
    return (_ipNum(ip)&mask)===(_ipNum(net)&mask);
}
function _prefixMask(p:number){ return _numIp(p===0?0:(0xFFFFFFFF<<(32-p))>>>0) }
function _netAddr(ip:string,p:number){ return _numIp(_ipNum(ip)&((0xFFFFFFFF<<(32-p))>>>0)) }
function _bcastAddr(ip:string,p:number){
    const m=(0xFFFFFFFF<<(32-p))>>>0; return _numIp((_ipNum(ip)&m)|(~m>>>0));
}

const _netState: _NetNode = {
    socketId: "",
    playerName: "player",
    hostname: "hackos-pc",
    interfaces: [
        { name:"lo",   ip:"127.0.0.1", prefix:8,  mac:"00:00:00:00:00:00", up:true  },
        { name:"eth0", ip:undefined,   prefix:24, mac:_randMac(),           up:false },
    ],
    routes: [],
    services: [
        { name:"sshd", port:22, running:true,  pid:891  },
        { name:"cron", port:0,  running:true,  pid:1042 },
    ],
};

// Expõe peers e FS para uso em NetworkCommands / curl
(window as any).__netPeers = {};
(window as any).__netState = _netState;

// ── Registra listeners de rede virtual ───────────────────────────────────────
// Deve ser chamado de Experience.ts APÓS todos os módulos estarem inicializados,
// evitando o problema de importação circular com SocketManager.
// Exemplo em Experience.ts:
//   import { initNetSocket } from './Actions';
//   // ...após setup completo:
//   initNetSocket();
let _netSocketInited = false;
export function initNetSocket() {
    if (_netSocketInited) return;
    _netSocketInited = true;

    // Atribui o singleton já resolvido — a esta altura o módulo circular
    // já terminou de avaliar, então SocketManager é válido.
    _SM = SocketManager;

    SocketManager.io.on("connect", () => {
        _netState.socketId   = SocketManager.io.id ?? "";
        _netState.playerName = SocketManager.playerName || (window as any).__playerName || "player";
        _netState.hostname   = `${_netState.playerName.toLowerCase().replace(/\s+/g, "-")}-pc`;
        _netBroadcast();
    });

    SocketManager.io.on("net:state", (node: _NetNode) => {
        (window as any).__netPeers[node.socketId] = node;
    });

    SocketManager.io.on("net:bug", (data: { type: string }) => {
        _netInjectBug(data.type);
        const msgs: Record<string, string> = {
            "link-down":     "⚠ eth0 caiu! Use: ip link set eth0 up",
            "ip-conflict":   "⚠ Conflito de IP! Reconfigure: ip addr add ...",
            "service-crash": "⚠ apache2 crashou! Use: apache2 start",
            "route-lost":    "⚠ Rotas perdidas! Use: ip route add default via ...",
        };
        const msg = msgs[data.type] ?? "⚠ Falha de rede detectada.";
        (window as any).HUD?.notify(msg, "error");
        (window as any).Phone?.chat?.receive("ctOS", msg);
    });

    SocketManager.io.on("net:http-req", (data: { fromId: string; targetIp: string }) => {
        const eth0 = _netState.interfaces.find(i => i.name === "eth0");
        if (eth0?.ip === data.targetIp) {
            const resp = _httpServe(data.targetIp);
            SocketManager.io.emit("net:http-res", { toId: data.fromId, ...resp });
        }
    });

    SocketManager.io.on("net:http-res", (data: { status: number; body: string; from: string }) => {
        (window as any).__netHttpRes = data;
        (window as any).Phone?.browser?.load?.(data.body, data.status, data.from);
    });
}

// SM resolvido após initNetSocket() — usado por _netBroadcast nas funções sync
let _SM: typeof SocketManager | null = null;

function _netBroadcast() {
    // Usa _SM se já inicializado, senão cai no import estático diretamente.
    // Isso garante que ip addr add / apache2 start emitem mesmo antes de
    // initNetSocket() ser chamado — sem perder estado de rede.
    const sm = _SM ?? SocketManager;
    if (sm?.io?.connected) sm.io.emit("net:state", _netState);
}

// ── Ping virtual ──────────────────────────────────────────────────────────────
function _netPing(host:string):{ok:boolean;msg:string;ms?:number;hops?:string[]}{
    if (host==="127.0.0.1"||host==="localhost") return {ok:true,msg:"",ms:0.05};
    const upIface = _netState.interfaces.find(i=>i.up&&i.ip&&i.name!=="lo");
    if (!upIface) return {ok:false,msg:"Network unreachable — configure IP: ip addr add <IP>/24 dev eth0"};
    const route = _netFindRoute(host);
    if (!route) return {ok:false,msg:`No route to host — adicione: ip route add default via <gateway>`};
    // Verifica próprio IP antes de buscar peers
    const isSelf = _netState.interfaces.some(i=>i.ip===host&&i.up);
    const peer = isSelf ? null : _netFindPeerByIP(host);
    if (!isSelf && !peer) return {ok:false,msg:`Request timeout — ${host} não está na rede virtual (ninguém com esse IP)`};
    const ms = isSelf ? parseFloat((0.05+Math.random()*0.1).toFixed(3)) : parseFloat((1+Math.random()*6).toFixed(2));
    const hops = route.via ? [route.via, host] : [host];
    return {ok:true,msg:"",ms,hops};
}

function _netFindRoute(ip:string):_NetRoute|undefined{
    return _netState.routes.find(r=>{
        const [,bits]=r.dest.split("/");
        if (!bits) return r.dest===ip;
        return _inSubnet(ip,r.dest);
    });
}

function _netFindPeerByIP(ip:string):_NetNode|undefined{
    const peers = (window as any).__netPeers as Record<string,_NetNode>;
    return Object.values(peers).find(n=>n.interfaces.some(i=>i.ip===ip));
}

// ── ifconfig ──────────────────────────────────────────────────────────────────
function _netIfconfig(ifaceName?:string):string{
    const ifaces = ifaceName
        ? _netState.interfaces.filter(i=>i.name===ifaceName)
        : _netState.interfaces;
    if (!ifaces.length) return `${ifaceName}: Device not found`;
    return ifaces.map(i=>[
        `${i.name}: flags=${i.up?"4163<UP,BROADCAST,RUNNING,MULTICAST>":"4098<BROADCAST,MULTICAST>"}  mtu 1500`,
        i.ip
            ? `        inet ${i.ip}  netmask ${_prefixMask(i.prefix)}  broadcast ${_bcastAddr(i.ip,i.prefix)}`
            : `        [sem endereço — use: ip addr add <IP>/<prefix> dev ${i.name}]`,
        `        ether ${i.mac}`,
    ].join("\n")).join("\n\n");
}

// ── set IP ────────────────────────────────────────────────────────────────────
function _netSetIP(ifaceName:string, ip:string, prefix=24):string{
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return `Erro: IP inválido: ${ip}`;
    // Verifica conflito com peers
    const peers = (window as any).__netPeers as Record<string,_NetNode>;
    for (const n of Object.values(peers)){
        if (n.interfaces.some(i=>i.ip===ip))
            return `Erro: IP ${ip} já em uso por ${n.playerName} (${n.hostname})`;
    }
    const iface = _netState.interfaces.find(i=>i.name===ifaceName);
    if (!iface) return `Erro: interface ${ifaceName} não encontrada`;
    iface.ip=ip; iface.prefix=prefix; iface.up=true;
    // Rota de rede local automática (como Linux)
    const net = _netAddr(ip,prefix);
    _netRouteAdd(`${net}/${prefix}`, undefined, ifaceName, 0);
    _netBroadcast();
    return ` ${ifaceName}: inet ${ip}/${prefix}  mac ${iface.mac}\n  Link: UP`;
}

function _netDelIP(ifaceName:string):string{
    const iface = _netState.interfaces.find(i=>i.name===ifaceName);
    if (!iface) return `interface ${ifaceName} não encontrada`;
    iface.ip=undefined; iface.up=false; _netBroadcast();
    return `IP removido de ${ifaceName}`;
}

function _netLinkSet(ifaceName:string, up:boolean):string{
    const iface = _netState.interfaces.find(i=>i.name===ifaceName);
    if (!iface) return `interface ${ifaceName} não encontrada`;
    iface.up=up; _netBroadcast();
    return `  ${ifaceName}: link ${up ? "UP" : "DOWN"}`;
}

// ── rotas ─────────────────────────────────────────────────────────────────────
function _netRouteAdd(dest:string, via?:string, dev="eth0", metric=100):string{
    if (_netState.routes.find(r=>r.dest===dest&&r.via===via)) return `Rota ${dest} já existe.`;
    _netState.routes.push({dest,via,dev,metric});
    _netState.routes.sort((a,b)=>{
        const ba=parseInt(a.dest.split("/")[1]??"32"); const bb=parseInt(b.dest.split("/")[1]??"32");
        return bb!==ba?bb-ba:a.metric-b.metric;
    });
    _netBroadcast();
    return `Rota adicionada: ${dest} ${via?"via "+via:"direta"} dev ${dev}`;
}

function _netRouteDel(dest:string):string{
    const before=_netState.routes.length;
    _netState.routes=_netState.routes.filter(r=>r.dest!==dest);
    if (_netState.routes.length===before) return `Erro: rota ${dest} não encontrada`;
    _netBroadcast();
    return `Rota ${dest} removida.`;
}

function _netRouteShow():string{
    if (!_netState.routes.length)
        return "  Tabela vazia — use: ip route add default via <gateway>";
    const hdr=`Kernel IP routing table\n${"Destino".padEnd(20)}${"Gateway".padEnd(16)}${"Máscara".padEnd(16)}Iface`;
    const rows=_netState.routes.map(r=>{
        const [net,bits]=r.dest.split("/");
        return `${net.padEnd(20)}${(r.via??"0.0.0.0").padEnd(16)}${_prefixMask(parseInt(bits??"32")).padEnd(16)}${r.dev}`;
    });
    return [hdr,...rows].join("\n");
}

// ── netstat / arp / nmap ──────────────────────────────────────────────────────
function _netNetstat():string{
    const hdr=`Active Internet connections\n${"Proto".padEnd(8)}${"Local Address".padEnd(22)}${"State".padEnd(12)}Service`;
    const rows=_netState.services.filter(s=>s.running&&s.port>0)
        .map(s=>`${"tcp".padEnd(8)}${("0.0.0.0:"+s.port).padEnd(22)}${"LISTEN".padEnd(12)}${s.name}`);
    return rows.length?[hdr,...rows].join("\n"):"Nenhuma porta aberta.";
}

function _netArp():string{
    const peers=(window as any).__netPeers as Record<string,_NetNode>;
    const lines=["Address          HWtype  HWaddress           Iface       Player"];
    for (const n of Object.values(peers)){
        const e=n.interfaces.find(i=>i.name==="eth0");
        if (e?.ip&&e.up)
            lines.push(`${e.ip.padEnd(17)}ether   ${e.mac.padEnd(20)}${("eth0").padEnd(12)}${n.playerName}`);
    }
    return lines.length>1?lines.join("\n"):"Tabela ARP vazia — faça ping para popular.";
}

function _netNmap(ip:string):string{
    if (ip==="127.0.0.1"||ip===((_netState.interfaces.find(i=>i.name==="eth0"))?.ip)){
        const ports=_netState.services.filter(s=>s.running&&s.port>0)
            .map(s=>`${String(s.port).padEnd(8)}tcp  open  ${s.name}`);
        return [`Nmap scan: ${ip} (${_netState.hostname})`,`Host is up.`,"PORT     STATE SERVICE",...ports,`Done: 1 host`].join("\n");
    }
    const peer=_netFindPeerByIP(ip);
    if (!peer) return `Nmap scan: ${ip}\nHost seems down.`;
    const ports=peer.services.filter(s=>s.running&&s.port>0)
        .map(s=>`${String(s.port).padEnd(8)}tcp  open  ${s.name}`);
    return [`Nmap scan: ${ip} (${peer.hostname})`,`Host is up.`,"PORT     STATE SERVICE",...ports,`Done: 1 host`].join("\n");
}

// ── Serviços ──────────────────────────────────────────────────────────────────
function _svcStart(name:string):string{
    if (name==="apache2"){
        const eth0=_netState.interfaces.find(i=>i.name==="eth0");
        if (!eth0?.ip) return "Erro: configure IP primeiro — ip addr add <IP>/24 dev eth0";
        if (!eth0.up)  return "Erro: interface eth0 está DOWN — ip link set eth0 up";
        // Verifica se existe index.html no FS
        let hasHtml=false;
        for (const dir of Object.values(diretories)){
            if ((dir as any).contentFile?.some((f:any)=>f.name.endsWith(".html"))){ hasHtml=true; break; }
        }
        if (!hasHtml) return `Erro: nenhum arquivo .html encontrado.\nCrie um com: nano index.html "<h1>Meu Site</h1>"`;
    }
    let svc=_netState.services.find(s=>s.name===name);
    if (svc){
        if (svc.running) return `${name} já está rodando (PID ${svc.pid}).`;
        svc.running=true; svc.pid=Math.floor(Math.random()*20000)+10000; svc.crashMsg=undefined;
    } else {
        const portMap:Record<string,number>={apache2:80,nginx:80,sshd:22,ftpd:21,dhcpd:67,nodejs:3000};
        svc={name,port:portMap[name]??8080,running:true,pid:Math.floor(Math.random()*20000)+10000};
        _netState.services.push(svc);
    }
    processes.push({pid:svc.pid,user:"www-data",cpu:0.3,mem:1.2,command:name,state:"S"});
    _netBroadcast();
    return `Starting ${name}...\n  * Starting web server apache2  [ OK ]\n  PID: ${svc.pid}  porta: ${svc.port}`;
}

function _svcStop(name:string):string{
    const svc=_netState.services.find(s=>s.name===name);
    if (!svc||!svc.running) return `${name} não está rodando.`;
    svc.running=false;
    const idx=processes.findIndex(p=>p.pid===svc.pid);
    if (idx!==-1) processes.splice(idx,1);
    _netBroadcast();
    return `Stopping ${name}...  [ OK ]`;
}

function _svcStatus(name:string):string{
    const svc=_netState.services.find(s=>s.name===name);
    if (!svc) return `${name}: serviço não encontrado.`;
    if (svc.running) return `● ${name} - ativo (running)\n  PID: ${svc.pid}  porta: ${svc.port}\n  Ativo desde o início da sessão.`;
    return `○ ${name} - inativo${svc.crashMsg?"\n  Erro: "+svc.crashMsg:""}`;
}

// ── Injeção de bugs ───────────────────────────────────────────────────────────
function _netInjectBug(type:string){
    switch(type){
        case "link-down":{ const e=_netState.interfaces.find(i=>i.name==="eth0"); if(e) e.up=false; break; }
        case "ip-conflict":{
            // Duplica o IP de um peer aleatório no estado local — cria conflito
            const peers=Object.values((window as any).__netPeers as Record<string,_NetNode>);
            const victim=peers.find(n=>n.interfaces.some(i=>i.name==="eth0"&&i.ip));
            if (victim){ const vIp=victim.interfaces.find(i=>i.name==="eth0")!.ip!;
                const eth0=_netState.interfaces.find(i=>i.name==="eth0"); if(eth0) eth0.ip=vIp; }
            break;
        }
        case "service-crash":{
            const a=_netState.services.find(s=>s.name==="apache2");
            if(a){ a.running=false; a.crashMsg="Segmentation fault (core dumped)"; }
            break;
        }
        case "route-lost":{ _netState.routes=_netState.routes.filter(r=>r.dest!=="0.0.0.0/0"); break; }
    }
    _netBroadcast();
}

// ── HTTP virtual — serve index.html do FS para curl/Phone ─────────────────────
function _httpServe(targetIp:string):{status:number;body:string;from:string}{
    const apache=_netState.services.find(s=>s.name==="apache2"&&s.running);
    if (!apache) return {status:503,from:_netState.hostname,
        body:`<h1>503 — apache2 offline</h1><p>Use: <code>apache2 start</code></p>`};
    // Busca index.html no FS virtual
    for (const dir of Object.values(diretories)){
        const f=(dir as any).contentFile?.find((f:any)=>f.name==="index.html"||f.name.endsWith(".html"));
        if (f) return {status:200,from:_netState.hostname,body:f.content};
    }
    return {status:404,from:_netState.hostname,
        body:`<h1>404 — Not Found</h1><p>Crie: <code>nano index.html "&lt;h1&gt;Olá&lt;/h1&gt;"</code></p>`};
}

function _openBrowserPhone(url:string, targetIp:string){
    // Tenta servir localmente primeiro; senão pede ao peer via socket
    const myIp=_netState.interfaces.find(i=>i.name==="eth0")?.ip;
    if (myIp===targetIp){
        const resp=_httpServe(targetIp);
        (window as any).Phone?.browser?.load?.(resp.body, resp.status, resp.from);
    } else {
        _SM?.io.emit("net:http-req",{targetIp});
        // Resposta chegará via "net:http-res" listener registrado em initNetSocket()
    }
}

// ── Browser navigate bridge — phone.js delega aqui ──────────────────────────
document.addEventListener('browser:navigate', (e: any) => {
    const url: string = e.detail.url;
    const m = url.match(/https?:\/\/([\d.]+)/);
    if (!m) { (window as any).Phone?.browser?.load?.('<h1>URL inválida</h1><p>Use formato http://IP</p>', 400, 'local'); return; }
    const targetIp = m[1];
    const ping = _netPing(targetIp);
    if (!ping.ok) {
        (window as any).Phone?.browser?.load?.(
            `<h1>Erro de Rede</h1><p>${ping.msg}</p>`, 503, targetIp
        );
        return;
    }
    (window as any).Phone?.browser?.setUrl?.(url);
    _openBrowserPhone(url, targetIp);
});

// ══════════════════════════════════════════════════════════════════════════════
// FIM REDE VIRTUAL
// ══════════════════════════════════════════════════════════════════════════════



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
        { id:"editor-js", label:"Editor JS", icon:"bxl-javascript" },
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

    const jsPanel = panels["editor-js"];
    css(jsPanel, { flexDirection:"column", position:"relative" });

    const jsHeader = document.createElement("div");
    css(jsHeader, { padding:"7px 14px", borderBottom:`1px solid ${V.border}`,
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    fontFamily:"'Rajdhani',sans-serif", gap:"8px" });

    const jsTitle = document.createElement("span");
    css(jsTitle, { fontSize:"10px", letterSpacing:".15em", color:V.muted,
                   textTransform:"uppercase", display:"flex", alignItems:"center", gap:"6px" });
    jsTitle.innerHTML = `<i class='bx bxl-javascript' style="color:${V.yellow}"></i> INTERPRETADOR JS — HackOS Node`;

    const jsActions = document.createElement("div");
    jsActions.style.display = "flex"; jsActions.style.gap = "8px";

    const jsRunBtn = document.createElement("button");
    css(jsRunBtn, { fontFamily:"'Rajdhani',sans-serif", fontSize:"11px", fontWeight:"700",
                    letterSpacing:".1em", textTransform:"uppercase", padding:"4px 14px",
                    background:`rgba(240,185,11,0.1)`, border:`1px solid ${V.yellow}`,
                    color:V.yellow, borderRadius:"3px", cursor:"pointer",
                    display:"flex", alignItems:"center", gap:"5px" });
    jsRunBtn.innerHTML = `<i class='bx bx-play-circle'></i> Executar`;

    const jsClearBtn = document.createElement("button");
    css(jsClearBtn, { fontFamily:"'Rajdhani',sans-serif", fontSize:"11px", fontWeight:"600",
                      letterSpacing:".1em", textTransform:"uppercase", padding:"4px 10px",
                      background:"transparent", border:`1px solid ${V.border}`,
                      color:V.muted, borderRadius:"3px", cursor:"pointer" });
    jsClearBtn.textContent = "Limpar";

    jsActions.append(jsClearBtn, jsRunBtn);
    jsHeader.append(jsTitle, jsActions);
    jsPanel.appendChild(jsHeader);

    const jsBody = document.createElement("div");
    css(jsBody, { display:"flex", flex:"1", overflow:"hidden" });

    // ── Editor (esquerda) ────────────────────────────────────────────────────
    const jsEditorWrap = document.createElement("div");
    css(jsEditorWrap, { flex:"1", display:"flex", flexDirection:"column",
                        borderRight:`1px solid ${V.border}` });

    const jsLangBadge = document.createElement("div");
    css(jsLangBadge, { padding:"4px 14px", fontSize:"9px", letterSpacing:".14em",
                       color:V.muted, textTransform:"uppercase", borderBottom:`1px solid ${V.border}`,
                       display:"flex", gap:"10px", alignItems:"center" });
    jsLangBadge.innerHTML = `<span style="color:${V.yellow}">JS</span> main.js &nbsp;|&nbsp; <span id="__js-status" style="color:${V.muted}">Pronto</span>`;

    const jsTextarea = document.createElement("textarea");
    jsTextarea.id = "__js-editor";
    css(jsTextarea, { flex:"1", background:"transparent", border:"none", outline:"none",
                      color:V.text, fontFamily:"'Share Tech Mono', monospace",
                      fontSize:"12px", lineHeight:"1.7", padding:"12px 14px",
                      resize:"none", tabSize:"4" });
    jsTextarea.spellcheck = false;
    jsTextarea.value = `// Olá, Mundo! em JavaScript\nconsole.log("Olá, Mundo!");`;

    // Tab insere 4 espaços (igual ao Editor C)
    jsTextarea.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Tab") {
            e.preventDefault();
            const s = jsTextarea.selectionStart;
            jsTextarea.value = jsTextarea.value.slice(0, s) + "    " + jsTextarea.value.slice(s);
            jsTextarea.selectionStart = jsTextarea.selectionEnd = s + 4;
        }
    });
    jsTextarea.addEventListener("click",    e => e.stopPropagation());
    jsTextarea.addEventListener("keypress", e => e.stopPropagation());
    jsEditorWrap.append(jsLangBadge, jsTextarea);

    // ── Saída (direita) ──────────────────────────────────────────────────────
    const jsOutputWrap = document.createElement("div");
    css(jsOutputWrap, { width:"260px", display:"flex", flexDirection:"column" });

    const jsOutHeader = document.createElement("div");
    css(jsOutHeader, { padding:"4px 14px", fontSize:"9px", letterSpacing:".14em",
                       color:V.muted, textTransform:"uppercase", borderBottom:`1px solid ${V.border}`,
                       display:"flex", alignItems:"center", gap:"6px" });
    jsOutHeader.innerHTML = `<i class='bx bx-terminal' style="color:${V.yellow};font-size:12px"></i> CONSOLE`;

    const jsOutput = document.createElement("pre");
    jsOutput.id = "__js-output";
    css(jsOutput, { flex:"1", overflowY:"auto", margin:"0", padding:"12px 14px",
                    fontSize:"11px", lineHeight:"1.6", color:V.text,
                    fontFamily:"'Share Tech Mono', monospace", whiteSpace:"pre-wrap",
                    background:"rgba(0,0,0,0.2)" });
    jsOutput.textContent = "// Execute para ver a saida";

    jsOutputWrap.append(jsOutHeader, jsOutput);
    jsBody.append(jsEditorWrap, jsOutputWrap);
    jsPanel.appendChild(jsBody);
    device.appendChild(jsPanel);

    // ── Runner ───────────────────────────────────────────────────────────────
    function runJSCode() {
        const ta     = document.getElementById("__js-editor") as HTMLTextAreaElement;
        const output = document.getElementById("__js-output")  as HTMLPreElement;
        const status = document.getElementById("__js-status")  as HTMLSpanElement;
        if (!ta || !output || !status) return;

        const src = ta.value;
        status.textContent = "Executando..."; status.style.color = V.yellow;
        output.textContent = ""; output.style.color = V.text;

        setTimeout(() => {
            // ── Sandbox: captura console.log, bloqueia APIs perigosas ─────────
            const lines: string[] = [];
            const safeConsole = {
                log:   (...args: unknown[]) => lines.push(args.map(a =>
                    a === null ? "null" : a === undefined ? "undefined" :
                    typeof a === "object" ? (() => { try { return JSON.stringify(a); } catch { return "[Object]"; } })() :
                    String(a)).join(" ")),
                error: (...args: unknown[]) => lines.push("[erro] "   + args.map(String).join(" ")),
                warn:  (...args: unknown[]) => lines.push("[aviso] "  + args.map(String).join(" ")),
                info:  (...args: unknown[]) => lines.push("[info] "   + args.map(String).join(" ")),
            };

            const deadline = Date.now() + 3000;
            const __loopGuard = () => {
                if (Date.now() > deadline) throw new Error("Tempo limite excedido (loop infinito?)");
                return true;
            };

            // Palavras proibidas no código
            const blocked = ["window","document","location","fetch","XMLHttpRequest",
                             "WebSocket","localStorage","sessionStorage","eval","Function",
                             "setTimeout","setInterval","__proto__","constructor","process","globalThis"];
            const found = blocked.find(id => new RegExp(`\\b${id}\\b`).test(src));
            if (found) {
                status.textContent = "BLOQUEADO"; status.style.color = V.red;
                output.style.color = V.red;
                output.textContent = `[Segurança] '${found}' não está disponível no ambiente HackOS.`;
                return;
            }

            // Injeta loop guard no while e for
            let safe = src
                .replace(/\bwhile\s*\(/g, "while (__loopGuard() && (")
                .replace(/\bfor\s*\(([^;]*);([^;]*);/g,
                    (_m: string, init: string, cond: string) =>
                        `for (${init}; __loopGuard() && (${cond.trim() || "true"});`);

            // Fecha parênteses extras do while guard
            safe = (() => {
                const MARKER = "while (__loopGuard() && (";
                let result = ""; let i = 0;
                while (i < safe.length) {
                    const idx = safe.indexOf(MARKER, i);
                    if (idx === -1) { result += safe.slice(i); break; }
                    result += safe.slice(i, idx + MARKER.length);
                    let depth = 1; let j = idx + MARKER.length;
                    while (j < safe.length && depth > 0) {
                        if (safe[j] === "(") depth++;
                        else if (safe[j] === ")") depth--;
                        if (depth > 0) result += safe[j];
                        j++;
                    }
                    result += "))"; i = j;
                }
                return result;
            })();

            try {
                // Identificadores reservados que não podem ser nomes de parâmetro
                // em strict mode (eval, arguments, etc.) são bloqueados via detecção
                // de uso no código, mas NÃO passados como parâmetros da função.
                const RESERVED_PARAM_NAMES = new Set([
                    "eval","arguments","implements","interface","let","package",
                    "private","protected","public","static","yield","Function",
                ]);

                // APIs permitidas explicitamente no sandbox
                const allowedKeys:   string[]  = ["console","Math","JSON","Number","String",
                                                   "Boolean","Array","Object","parseInt",
                                                   "parseFloat","isNaN","isFinite","__loopGuard"];
                const allowedValues: unknown[] = [safeConsole,Math,JSON,Number,String,
                                                   Boolean,Array,Object,parseInt,
                                                   parseFloat,isNaN,isFinite,__loopGuard];

                // APIs bloqueadas que podem ser passadas como parâmetro (shadow do escopo externo)
                const shadowKeys:   string[]  = blocked.filter(id => !RESERVED_PARAM_NAMES.has(id));
                const shadowValues: unknown[] = shadowKeys.map(() => undefined);

                const keys   = [...allowedKeys,   ...shadowKeys];
                const values = [...allowedValues, ...shadowValues];

                // eslint-disable-next-line no-new-func
                new Function(...keys, `"use strict";\n${safe}`)(...values);

                const out = lines.join("\n").slice(0, 4000);
                status.textContent = "OK"; status.style.color = V.yellow;
                output.style.color = V.text;
                output.textContent = out || "(sem saida)";

                // Emite evento para o MissionManager — mesmo padrão de c:output
                eventEmitter.dispatchEvent(new CustomEvent("js:output", {
                    detail: { output: out, source: src }
                }));

            } catch (e: any) {
                status.textContent = "ERRO"; status.style.color = V.red;
                output.style.color = V.red;
                output.textContent = `[Erro] ${e.message}`;
            }
        }, 60);
    }

    jsRunBtn.addEventListener("click", runJSCode);
    jsClearBtn.addEventListener("click", () => {
        const ta = document.getElementById("__js-editor") as HTMLTextAreaElement;
        if (ta) ta.value = "// Digite seu código JavaScript aqui\n";
        const out = document.getElementById("__js-output") as HTMLPreElement;
        if (out) { out.textContent = "// Execute para ver a saida"; out.style.color = V.text; }
        const st = document.getElementById("__js-status") as HTMLSpanElement;
        if (st) { st.textContent = "Pronto"; st.style.color = V.muted; }
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
    "ping": (args) => {
        if (!args[0]) return "Uso: ping <IP ou hostname>";
        const host = args[0];
        eventEmitter.dispatchEvent(new CustomEvent("terminal:ping", { detail: { host } }));
        const result = _netPing(host);
        if (!result.ok) return result.msg;
        const lines = [
            `PING ${host}: 56 data bytes`,
            ...Array.from({ length: 4 }, (_, i) =>
                `64 bytes from ${host}: icmp_seq=${i+1} ttl=64 time=${(result.ms! + Math.random()*0.4).toFixed(2)} ms`
            ),
            `--- ${host} ping statistics ---`,
            `4 packets transmitted, 4 received, 0% packet loss`,
        ];
        return lines.join("\n");
    },
    "pwd": () => {
        eventEmitter.dispatchEvent(new CustomEvent("terminal:pwd", { detail: { dir: currentDir } }));
        return currentDir;
    },
    "ifconfig": (args) => {
        eventEmitter.dispatchEvent(new CustomEvent("terminal:ifconfig", {}));
        return _netIfconfig(args[0]);
    },
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
        "── REDE VIRTUAL ────────────────────────────────────────",
        "  ip addr show                    Interfaces de rede",
        "  ip addr add <IP>/<pfx> dev eth0  Configura IP",
        "  ip link set eth0 up|down         Liga/desliga interface",
        "  ip route show                    Tabela de rotas",
        "  ip route add default via <gw>    Rota padrão",
        "  route -n                         Tabela de rotas (legado)",
        "  netstat -an                      Portas abertas",
        "  arp -a                           Tabela ARP",
        "  nmap <IP>                        Scan de portas",
        "  traceroute <IP>                  Rastreia rota",
        "  apache2 start|stop|status        Servidor HTTP virtual",
        "  service <nome> start|stop        Serviços",
        "  curl http://<IP>                 Abre site no Phone",
        "  net:status                       Visão geral da rede",
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
                msg = findFile.content;
                eventEmitter.dispatchEvent(new CustomEvent("terminal:cat", { detail: { file: args[0], dir: currentDir } }));
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

        eventEmitter.dispatchEvent(new CustomEvent("terminal:ls", { detail: { dir: currentDir } }));
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
            return "Uso: nano [arquivo.ext] \"conteúdo\" (extensões: .txt, .html, .css, .js, .py)";
        }

        const fileName = args[0];

        // Reconstrói a linha completa e extrai tudo após o primeiro argumento (filename)
        // Suporta aspas normais "..." e aspas tipográficas "..." que o browser pode inserir
        const fullLine = args.join(" ");
        const contentMatch = fullLine.match(/[""\u201C]([\s\S]*?)[""\u201D]$/) ||
                             fullLine.match(/["]([\s\S]*)["]/) ||
                             fullLine.match(/[""\u201C]([\s\S]*)/);

        const allowedExtensions = [".txt", ".js", ".py", ".html", ".css"];

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

            eventEmitter.dispatchEvent(new CustomEvent("terminal:nano", { detail: { file: fileName, action: "updated", dir: currentDir } }));
            return `Arquivo ${fileName} atualizado.`;
        } else {

            const localFile: file = { name: fileName, content }

            if(isRemotelyConnected){
                SocketManager.handleFileRemote("nano", currentDir, localFile)
                return "";
            }

            dirLocal[currentDir].contentFile.push(localFile);
            eventEmitter.dispatchEvent(new CustomEvent("terminal:nano", { detail: { file: fileName, action: "created", dir: currentDir } }));
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
                eventEmitter.dispatchEvent(new CustomEvent("terminal:mkdir", { detail: { dir: args[0], path } }));
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
                eventEmitter.dispatchEvent(new CustomEvent("terminal:ssh", { detail: { address: args[0] } }));
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
            return `Professor indo ao palco — aula: ${arg2}`;
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
            return "Aula encerrada. Professor retornando ao ponto de espera.";
        }

        return `Subcomando desconhecido: '${sub}'. Digite: teach list`;
    },
// ── Rede Virtual — ip / route / apache2 / curl etc ──────────────────────────
    "ip" : (args: any) => {
        const sub = args[0]; const sub2 = args[1];
        if (sub === "addr" || sub === "address") {
            if (!sub2 || sub2 === "show") return _netIfconfig();
            if (sub2 === "add") {
                const cidr = args[2]; const dev = args[4] ?? "eth0";
                if (!cidr) return "Uso: ip addr add <IP>/<prefix> dev <interface>";
                const [ip, pfx] = cidr.split("/");
                return _netSetIP(dev, ip, parseInt(pfx ?? "24"));
            }
            if (sub2 === "del" || sub2 === "delete") {
                const dev = args[4] ?? "eth0";
                return _netDelIP(dev);
            }
        }
        if (sub === "link") {
            if (!sub2 || sub2 === "show") return _netIfconfig();
            if (sub2 === "set") {
                const dev = args[2]; const state = args[3];
                if (!dev || !state) return "Uso: ip link set <interface> up|down";
                return _netLinkSet(dev, state === "up");
            }
        }
        if (sub === "route") {
            if (!sub2 || sub2 === "show") return _netRouteShow();
            if (sub2 === "add") {
                const dest = args[2] === "default" ? "0.0.0.0/0" : args[2];
                const via  = args[4]; const dev = args[6] ?? "eth0";
                if (!dest) return "Uso: ip route add <destino> via <gateway> [dev <iface>]";
                return _netRouteAdd(dest, via, dev);
            }
            if (sub2 === "del" || sub2 === "delete") {
                const dest = args[2] === "default" ? "0.0.0.0/0" : args[2];
                return _netRouteDel(dest);
            }
        }
        return [
            "Uso: ip <objeto> <comando>",
            "  ip addr show                        Interfaces",
            "  ip addr add <IP>/<prefix> dev eth0  Configura IP",
            "  ip link set eth0 up|down             Liga/desliga",
            "  ip route show                        Rotas",
            "  ip route add default via <gateway>   Rota padrão",
        ].join("\n");
    },
    "route": (args) => {
        if (!args[0] || args[0] === "-n") return _netRouteShow();
        if (args[0] === "add") {
            const dest = args[1] === "default" ? "0.0.0.0/0" : args[1];
            return _netRouteAdd(dest, args[3], args[5] ?? "eth0");
        }
        if (args[0] === "del") return _netRouteDel(args[1] === "default" ? "0.0.0.0/0" : args[1]);
        return "Uso: route -n | route add default gw <IP>";
    },
    "traceroute": (args) => {
        if (!args[0]) return "Uso: traceroute <IP>";
        const r = _netPing(args[0]);
        if (!r.ok) return `traceroute: ${r.msg}`;
        const hops = r.hops ?? [args[0]];
        return `traceroute to ${args[0]}, max 30 hops\n` +
            hops.map((h, i) => `  ${i+1}  ${h}  ${(1+Math.random()*4).toFixed(2)} ms`).join("\n");
    },
    "netstat": (_args) => _netNetstat(),
    "arp": (_args) => _netArp(),
    "nmap": (args) => {
        if (!args[0]) return "Uso: nmap <IP>";
        return _netNmap(args[0]);
    },
    "hostname": (args) => {
        if (args[0]) { _netState.hostname = args[0]; return `hostname: ${args[0]}`; }
        return _netState.hostname;
    },
    "apache2": (args) => {
        const sub = args[0];
        if (!sub) return "Uso: apache2 [start|stop|restart|status]";
        if (sub === "start" || sub === "restart") return _svcStart("apache2");
        if (sub === "stop")   return _svcStop("apache2");
        if (sub === "status") return _svcStatus("apache2");
        return `apache2: subcomando desconhecido: ${sub}`;
    },
    "service": (args) => {
        const name = args[0]; const sub = args[1];
        if (!name || !sub) return "Uso: service <nome> start|stop|status";
        if (sub === "start")  return _svcStart(name);
        if (sub === "stop")   return _svcStop(name);
        if (sub === "status") return _svcStatus(name);
        return `service: ação desconhecida: ${sub}`;
    },
    "systemctl": (args) => {
        const sub = args[0]; const name = args[1];
        if (!sub || !name) return "Uso: systemctl [start|stop|restart|status] <serviço>";
        if (sub === "start" || sub === "restart") return _svcStart(name);
        if (sub === "stop")   return _svcStop(name);
        if (sub === "status") return _svcStatus(name);
        if (sub === "enable" || sub === "disable") return `${name} ${sub}d. (simulado)`;
        return `systemctl: operação desconhecida: ${sub}`;
    },
    "curl": (args) => {
        const url = args[0];
        if (!url) return "Uso: curl http://<IP>";
        const m = url.match(/https?:\/\/([\d.]+)/);
        if (!m) return "Erro: use formato http://<IP>";
        const targetIp = m[1];
        const ping = _netPing(targetIp);
        if (!ping.ok) return `curl: (7) Failed to connect to ${targetIp}: ${ping.msg}`;
        _openBrowserPhone(url, targetIp);
        return `  Conectando a ${targetIp}... abrindo no Phone > Browser`;
    },
    "net:status": (_args) => {
        const nodes: string[] = ["══ REDE VIRTUAL ══════════════════════════════════════"];
        const peers = (window as any).__netPeers as Record<string, any> ?? {};
        const me = _netState;
        const eth0 = me.interfaces.find((i:any) => i.name === "eth0");
        nodes.push(` ● (você) ${me.hostname.padEnd(22)} ${(eth0?.ip ?? "—").padEnd(16)} apache2:${_netState.services.find((s:any)=>s.name==="apache2")?.running?"▶":"■"}`);
        for (const [id, n] of Object.entries(peers)) {
            const e = (n as any).interfaces?.find((i:any) => i.name === "eth0");
            nodes.push(` ○ ${(n as any).playerName?.padEnd(16) ?? id.slice(0,8).padEnd(16)} ${((n as any).hostname ?? "").padEnd(22)} ${(e?.ip ?? "—").padEnd(16)} apache2:${(n as any).services?.find((s:any)=>s.name==="apache2")?.running?"▶":"■"}`);
        }
        return nodes.join("\n");
    },
    "net:bug": (args) => {
        const isAdmin = infoPlayer.role === "admin" || infoPlayer.role === "moderator";
        if (!isAdmin) return "Permissão negada. Apenas admin ou moderador.";
        const bug = args[0]; const target = args[1];
        const valid = ["link-down","ip-conflict","service-crash","route-lost"];
        if (!valid.includes(bug)) return `Bugs: ${valid.join(", ")}\nUso: net:bug <tipo> [socketId]`;
        _SM?.io.emit("net:bug:inject", { type: bug, targetId: target ?? null });
        return `Bug "${bug}" injetado${target ? ` em ${target}` : " em todos"}.`;
    },
}

// Executar um comando digitado
function executeCommand(command: string, terminal: HTMLDivElement) {
    // Split inteligente: preserva conteúdo entre aspas como um único token.
    // Suporta " normais e " " tipográficas que o contentEditable pode inserir.
    const raw = command.trim();
    const parts: string[] = [];
    // Regex: token fora de aspas OU conteúdo entre qualquer variante de aspas
    const tokenRe = /[""\u201C]([\s\S]*?)[""\u201D]|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(raw)) !== null) {
        // grupo 1 = conteúdo dentro das aspas, grupo 2 = token sem aspas
        parts.push(m[1] !== undefined ? `"${m[1]}"` : m[2]);
    }
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