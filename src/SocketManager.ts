import {io, Socket} from 'socket.io-client'
import { Object3D, Quaternion, Scene, Vector3 } from 'three'
import { Faker, pt_BR } from '@faker-js/faker'
import Loading from './Loading'
import { addNewCommandLine, appendToTerminal, dir, file, isRemotelyConnected, remoteDiretories as rd } from './Actions'
import { Auditorio, infoPlayer } from './InfoPlayer'
import { colliders } from './Colliders'
import Guest from './Guest'


/**
 * Normaliza o dado de avatar recebido do servidor.
 * Suporta 3 formatos para garantir compatibilidade:
 *   1. string pura:        'models/teacher_npc.glb'  (servidor antigo)
 *   2. objeto novo:        { url: '...', name: '...' }            (servidor atualizado)
 *   3. objeto aninhado:    { url: { url: '...', name: '...' } }   (bug de transição)
 */
function extractAvatarData(data: any): { url: string; name: string } {
    if (!data) return { url: '', name: 'Jogador' }

    // Formato 1: string pura
    if (typeof data === 'string') return { url: data, name: 'Jogador' }

    // Formato 3: objeto aninhado (servidor repassou o objeto inteiro como url)
    if (typeof data.url === 'object' && data.url !== null) {
        return {
            url:  data.url.url  || '',
            name: data.url.name || data.name || 'Jogador',
        }
    }

    // Formato 2: objeto correto
    return {
        url:  typeof data.url === 'string' ? data.url : '',
        name: typeof data.name === 'string' ? data.name : 'Jogador',
    }
}

class SocketManager{
   
    loading?: Loading
    io: Socket
    players: { [key: string] : Object3D } = {}
    scene?: Scene
    faker = new Faker({locale: pt_BR})
    isConnected = false
    avatarUrl:   string = ''  // URL do modelo — persistida para reconexão
    playerName: string = ''  // Nome escolhido — reemitido ao reconectar


    constructor(){
       
        //this.io = io('http://localhost:3000')
        this.io = io("https://onleo.online", {
            path: "/socket.io/", 
            transports: ["websocket", "polling"], // O servidor aceita ambos
            reconnection: true,
            reconnectionAttempts: 5
        });

        this.io.on('connect', () => {
            console.log('Conectado')
            this.isConnected = true
            this.setHudStatus(true)
            // Reenvia o avatar ao reconectar (garante que o servidor
            // sempre tem a URL mesmo após quedas de conexão)
            if (this.avatarUrl) {
                this.io.emit('avatar:set', { url: this.avatarUrl, name: this.playerName })
            }
        })

        this.io.on('disconnect', () => {
            console.log('Conexão perdida')
         
            if(this.io.id != undefined){
                this.scene?.remove(this.players[this.io.id])
                delete this.players[this.io.id]
            }
            

            //Remove do Collider
            const index = colliders.indexOf(this.players[this.io.id as any]);
            if (index !== -1) {
                colliders.splice(index, 1);
            }

            this.isConnected = false
            this.setHudStatus(false)
        })

        this.io.on('joinInRoom', this.joinInRoom)
        this.io.on('receivePlayerPosition', this.updatePosition)
        this.io.on('exitTheRoom', this.exitTheRoom)
        this.io.on('players:loaded', this.loadPlayers)       
        this.io.on('receiveRemoteAccess', this.receiveRemoteAccess)

        this.io.on("player:info", this.getPlayerInfo);          
        this.io.on("players:update", this.updatePlayerInfo);
        this.io.on("chair:list", this.updateChairs);
        this.io.on("npc:state",   this.updateNpcState);
        this.io.on("slide:npc",   this.receiveNpcSlide);
        this.io.on("slide:npc:end", this.receiveNpcSlideEnd);

        // ── Telão ─────────────────────────────────────────────────────────────
        // Listeners registrados no construtor — existem antes do Experience carregar.
        // _pendingBoardText inicializado aqui (no construtor) para evitar problemas
        // de ordem de inicialização de propriedades de classe no Vite/esbuild.
        this._pendingBoardText = null;
        this._boardRetryTimer  = null;

        this.io.on("board:display", (data: { text: string }) => {
            if (!data?.text) return;
            this._applyBoard(data.text);
        });
        this.io.on("board:clear", () => {
            this._pendingBoardText = null;
            if (this._boardRetryTimer !== null) {
                clearInterval(this._boardRetryTimer);
                this._boardRetryTimer = null;
            }
            (window as any).__boardManager?.clear();
        });
        this.io.on("board:denied", (data: { msg: string }) => {
            console.warn('[board] Permissão negada pelo servidor:', data?.msg);
            (window as any).HUD?.notify('Telão: sem permissão — faça su <senha> primeiro', 'error');
        });
    }

    // Declaradas sem inicializador — inicializadas no construtor para garantir
    // ordem correta no Vite (evita undefined em closures do setInterval)
    _pendingBoardText: string | null;
    _boardRetryTimer:  ReturnType<typeof setInterval> | null;

    private _applyBoard(text: string) {
        const mgr = (window as any).__boardManager;
        if (mgr) {
            mgr.display(text);
            this._pendingBoardText = null;
            if (this._boardRetryTimer !== null) {
                clearInterval(this._boardRetryTimer);
                this._boardRetryTimer = null;
            }
            return;
        }

        // __boardManager ainda não existe — GLB do auditório ainda carregando.
        // Guarda o texto e polling a cada 300ms.
        // Usa closure local para não depender de this em condições de corrida.
        this._pendingBoardText = text;
        if (this._boardRetryTimer !== null) return; // já há um retry rodando

        const self = this;
        this._boardRetryTimer = setInterval(function () {
            const m = (window as any).__boardManager;
            if (!m) return; // ainda não pronto
            const pending = self._pendingBoardText;
            if (pending !== null) {
                m.display(pending);
                self._pendingBoardText = null;
            }
            clearInterval(self._boardRetryTimer!);
            self._boardRetryTimer = null;
        }, 300);
    }

    loadPlayers = (players: any) => {

        Object.keys(players).forEach(id => {

            if(id === this.io.id) return;

            const { url: urlAvatar, name: playerName } = extractAvatarData(players[id]);
            if(urlAvatar && this.loading){

                Guest.loadModel(this.loading, urlAvatar, id, playerName).then(() => {
                    this.scene?.add(Guest.models[id].obj);
                    // Drone do guest também vive direto na Scene (evita jitter)
                    this.scene?.add(Guest.models[id].obj.droneGroup);
                    this.players[id] = Guest.models[id].obj;

                    // Aplica posição salva no servidor imediatamente após carregar.
                    // players:loaded já inclui x/y/z se o player se moveu antes.
                    const p = players[id];
                    if (p?.x !== undefined) {
                        Guest.setPosition(
                            new Vector3(p.x, p.y, p.z),
                            id
                        )
                        Guest.setQuaternion(
                            new Quaternion(p.qx ?? 0, p.qy ?? 0, p.qz ?? 0, p.qw ?? 1),
                            id
                        )
                        Guest.models[id].obj.visible = true;
                    } else {
                        // Sem posição ainda: mantém invisível até receivePlayerPosition
                        Guest.models[id].obj.visible = false;
                    }
                });

            } else {
                console.warn(`Sem avatar ou loading indefinido para ${id}`);
            }
        });
    }

    updateChairs = (assentos: string[]) => {
        Auditorio.chairs = assentos
    }

    getPlayerInfo = (data: any) => {
        infoPlayer.id = data.id;
        infoPlayer.role = data.role;
    }

    updatePlayerInfo = (players: any) => {
        Object.entries(players).forEach(([id, player]) => {
            let player_socket = player as any;

            if(this.io.id == id){
                infoPlayer.role = player_socket.role       
            }            
        });
    }

    joinInRoom = (player: any) => {

        console.log('-- Um novo player juntou a sala --')

        if(player.id != this.io.id && this.loading){

            const { url: urlAvatar, name: playerName } = extractAvatarData(player)

            if(urlAvatar)
            {
                const guestLoaded = Guest.loadModel(this.loading, urlAvatar, player.id, playerName)

                guestLoaded.then(() => {
                    if(this.io.id != undefined){
                        this.scene?.add(Guest.models[player.id].obj)
                        // Drone do guest também vive direto na Scene (evita jitter)
                        this.scene?.add(Guest.models[player.id].obj.droneGroup)
                        this.players[player.id] = Guest.models[player.id].obj

                        // Se o servidor ja enviou posicao deste player (via receivePlayerPosition
                        // disparado pelo fix do avatar:set), aplica imediatamente.
                        // Isso evita que o player fique em 0,0,0 ate se mover.
                        if (player.x !== undefined) {
                            Guest.setPosition(
                                new Vector3(player.x, player.y, player.z),
                                player.id
                            )
                            Guest.setQuaternion(
                                new Quaternion(player.qx ?? 0, player.qy ?? 0, player.qz ?? 0, player.qw ?? 1),
                                player.id
                            )
                            Guest.models[player.id].obj.visible = true
                        }
                    }
                })
            }
        }
    }


    exitTheRoom = (id: any) => {
        console.log('exit the room')
        this.scene?.remove(this.players[id])
        // Remove também o droneGroup do guest da Scene
        const droneGroup = Guest.models[id]?.obj?.droneGroup
        if (droneGroup) this.scene?.remove(droneGroup)
        Guest.dispose(id)          // libera geometria, material e collider
        delete this.players[id]
    }

    updatePosition = (data: any) => {
       
        if( this.players[data.id]){

            Guest.models[data.id].obj.visible = true

            Guest.setPosition(
                new Vector3(data.x, data.y, data.z),
                data.id
            )
    
            Guest.setQuaternion(
                new Quaternion(data.qx, data.qy, data.qz, data.qw),
                data.id
            )   
            
            // Usa as animações da instância específica (não o estático compartilhado)
            const instanceAnims = Guest.models[data.id]?.animationsAction
            Guest.setAnimation(
                instanceAnims?.[data.clip],
                data.id
            )

            // ── Sincroniza drone do guest ──────────────────────────────────
            // Guest.update() chama obj.updateDrone() a cada frame via PlayerModel nativo.
            // Aqui só liga/desliga conforme o estado recebido do servidor.
            const guestModel = Guest.models[data.id]?.obj
            if (guestModel) {
                const shouldBeOn = !!data.isLatern
                if (guestModel.IsDroneActive !== shouldBeOn) {
                    guestModel.toggleDrone(shouldBeOn)
                }
            }
        }

    }

    // Recebe estado do TeacherNPC e aplica no mesh local
    updateNpcState = (data: any) => {
        const npc = (window as any).__teacherNPC;
        if (!npc || !npc.npcMesh) return;

        // Se este cliente é o controlador do NPC (admin que emitiu npc:update),
        // ignora o estado recebido — o NPC já é gerenciado localmente pelo TeacherNPC.
        // O servidor usa socket.to() e não devolve para o emissor, mas ao entrar
        // na sala recebe o npcState salvo — esse caso deve ser ignorado também.
        if (npc.isControlledLocally) return;

        const mesh = npc.npcMesh;

        // Posição
        mesh.position.set(data.x, data.y, data.z);

        // Rotação
        mesh.quaternion.set(data.qx, data.qy, data.qz, data.qw);

        // Animação
        const anims  = npc["animationsAction"] as Record<string, any>;
        const action = anims?.[data.clip];
        if (action && action !== npc["activedClip"]) {
            npc["activedClip"]?.fadeOut(0.2);
            action.reset().fadeIn(0.1).play();
            npc["activedClip"] = action;
        }
    }

    // Recebe slide da aula e renderiza localmente
    receiveNpcSlide = (data: { lessonId: string; slideIndex: number }) => {
        const npc = (window as any).__teacherNPC;
        if (!npc) return;
        if (npc.isControlledLocally) return;  // admin já renderizou localmente
        npc.renderRemoteSlide(data.lessonId, data.slideIndex);
    }

    // Recebe fim de aula e remove o slide da tela
    receiveNpcSlideEnd = () => {
        const npc = (window as any).__teacherNPC;
        if (!npc) return;
        if (npc.isControlledLocally) return;  // admin já removeu localmente
        npc.removeRemoteSlide();
        window.HUD?.notify("🎓 Aula encerrada.", "info");
    }

    setHudStatus(status: boolean){
        const hud = (window as any).HUD;
        if (status) {
            hud?.notify('Servidor online', 'success');
        } else {
            hud?.notify('Conexão perdida com o servidor', 'error');
        }
    }

    sendRemoteAccess = (currentDir: string, dir: string , command: string, name?: string) => {
        this.io.emit("sendRemoteAccess", {
            currentDir,
            dir,
            command,
            name
        })
    }

    receiveRemoteAccess = (data: any) => {
        if(isRemotelyConnected)
        {
          let terminal =  document.getElementById("terminal") as HTMLDivElement
          rd.dirs = data.diretories
          
          if(terminal)
          {
            appendToTerminal(data.output, terminal)
            addNewCommandLine(terminal)
          }
         
        }
    }

    handleFileRemote = (command: string, currentDir: string, file: file) => {
        this.io.emit("handleFileRemote", {
            command,
            currentDir,
            file
        })
    }

    // Registra avatar e nome, avisa o servidor
    setAvatar(url: string, name: string) {
        this.avatarUrl  = url
        this.playerName = name
        this.io.emit('avatar:set', { url, name })
    }

    promotePlayerTo(targetId: string, role: string) {
        this.io.emit("role:set", { targetId, role });
    }

    // ── Phone / Chat integration ──────────────────────────────────────────────
    // Conecta o widget Phone ao socket e registra os listeners de chat.
    // Deve ser chamado em Experience.ts após o HUD carregar:
    //   SocketManager.connectPhone()
    connectPhone() {
        const phone = (window as any).Phone;
        if (!phone) {
            console.warn('SocketManager.connectPhone: window.Phone não encontrado.');
            return;
        }

        // Passa a instância do socket para o Phone (usado para enviar chat)
        phone.setSocket(this.io);

        // Passa o nome do jogador local para o Phone exibir corretamente nas mensagens enviadas
        if (this.playerName) phone.setPlayerName?.(this.playerName);

        // Os listeners de chat:message, joinInRoom e exitTheRoom
        // ja sao registrados dentro de phone.js via setSocket().
        // Nao registrar aqui para evitar duplicidade.
    }
}

declare global {
    interface Window {
        HUD?: any;
        Phone?: any;
    }
}

export default new SocketManager()