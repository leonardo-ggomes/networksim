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
 *   1. string pura:        'models/asian_male_animated@base.glb'  (servidor antigo)
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
       
        this.io = io('http://localhost:3000') //io('https://networksim-server-production.up.railway.app/')

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
    }

    loadPlayers = (players: any) => {

        Object.keys(players).forEach(id => {

            if(id === this.io.id) return;

            const { url: urlAvatar, name: playerName } = extractAvatarData(players[id]);
            if(urlAvatar && this.loading){

                Guest.loadModel(this.loading, urlAvatar, id, playerName).then(() => {
                    this.scene?.add(Guest.models[id].obj);
                    Guest.models[id].obj.visible = false
                    this.players[id] = Guest.models[id].obj;
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
                        this.players[player.id] = Guest.models[player.id].obj
                    }
                })
            }
        }
    }


    exitTheRoom = (id: any) => {
        console.log('exit the room')
        this.scene?.remove(this.players[id])
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
                        
        }

    }

    setHudStatus(status: boolean){
        const hudStatus = document.getElementById("status-server") as HTMLDivElement
        
        if(status){
            hudStatus.innerText = 'Online'
            hudStatus.style.borderLeftColor = "#8BC34A"
        }
        else{
            hudStatus.innerText = 'Offline'
            hudStatus.style.borderLeftColor = "#FF0000"
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
}

export default new SocketManager()