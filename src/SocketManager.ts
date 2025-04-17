import {io, Socket} from 'socket.io-client'
import { Object3D, Quaternion, Scene, Vector3 } from 'three'
import { Faker, pt_BR } from '@faker-js/faker'
import Loading from './Loading'
import { addNewCommandLine, appendToTerminal, dir, file, isRemotelyConnected, remoteDiretories as rd } from './Actions'
import { Auditorio, infoPlayer } from './InfoPlayer'
import { colliders } from './Colliders'
import Guest from './Guest'

class SocketManager{
   
    loading?: Loading
    io: Socket
    players: { [key: string] : Object3D } = {}
    scene?: Scene
    faker = new Faker({locale: pt_BR})
    isConnected = false


    constructor(){
       
        this.io = io('https://networksim-server-production.up.railway.app/')

        this.io.on('connect', () => {
            console.log('Conectado')
            this.isConnected = true
            this.setHudStatus(true)
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
       
            const urlAvatar = players[id].url;
            if(urlAvatar && this.loading){

                Guest.loadModel(this.loading, urlAvatar, id).then(() => {
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

            const urlAvatar = player.url
           
            if(urlAvatar)
            {
                const guestLoaded = Guest.loadModel(this.loading, urlAvatar, player.id)

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
            
            Guest.setAnimation(
                Guest.animationsAction[data.clip],
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

    promotePlayerTo(targetId: string, role: string) {
        this.io.emit("role:set", { targetId, role });
    }
}

export default new SocketManager()
