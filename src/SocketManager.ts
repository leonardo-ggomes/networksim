import {io, Socket} from 'socket.io-client'
import PlayerModel from './PlayerModel'
import { Mesh, MeshBasicMaterial, Quaternion, Scene, Vector3 } from 'three'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { Faker, pt_BR } from '@faker-js/faker'
import Loading from './Loading'

export default class SocketManager{

    loading: Loading
    io: Socket
    players: { [key: string] : PlayerModel } = {}
    scene: Scene
    faker = new Faker({locale: pt_BR})

    constructor(scene: Scene, loading: Loading){
        this.loading = loading
        this.scene = scene
        this.io = io('http://localhost:3000')

        
        this.io.on('connect', () => {
            console.log('Conectado')
            this.setHudStatus(true)
        })

        this.io.on('disconnect', () => {
            console.log('Conexão perdida')

            if(this.io.id != undefined){
                this.scene.remove(this.players[this.io.id])
                delete this.players[this.io.id]
            }
            
            this.setHudStatus(false)
        })

        this.io.on('joinInRoom', this.joinInRoom)
        this.io.on('receivePlayerPosition', this.updatePosition)
        this.io.on('exitTheRoom', this.exitTheRoom)
        this.io.on('didConnect', this.joinInRoom)


    }

    joinInRoom = (players: any) => {
      
        console.log('-- Um novo player juntou a sala --')
        const loader = new FontLoader()
        const textMaterial = new MeshBasicMaterial()
        Object.keys(players).forEach(async(player) => {            
            
            if(player != this.io.id){
                const newPlayer = new PlayerModel(this.loading)

                const font = await loader.loadAsync( 'fonts/helvetiker_regular.typeface.json')
                const name = this.faker.person.firstName()
                const nameGeometry = new TextGeometry(name, {
                    font: font,
                    size: 0.15 ,
                    depth: 0                  
                } );
        
                const meshName = new Mesh(nameGeometry, textMaterial)
                meshName.position.y = newPlayer.position.y + 2
                meshName.position.z = newPlayer.position.z - 0.2
                meshName.position.x = newPlayer.position.x - (name.length / 2 / 10 )
                
                // meshName.rotation.x = -Math.PI / 2
                newPlayer.add(meshName)

                if(this.io.id != undefined){                    
                    this.scene.add(newPlayer)
                    this.players[player] = newPlayer
                }
                
            }
        })

    }


    exitTheRoom = (id: any) => {
        console.log('exit the room')
        this.scene.remove(this.players[id])
        delete this.players[id]
    }

    updatePosition = (data: any) => {
       
        if( this.players[data.id]){
            
            this.players[data.id].setPosition(
                new Vector3(data.x, data.y, data.z)
            )
    
            this.players[data.id].setQuaternion(
                new Quaternion(data.qx, data.qy, data.qz, data.qw)
            )   
            
            this.players[data.id].setAnimation(
                this.players[data.id].animationsAction[data.clip]
            )   
                        
        }

    }

    setHudStatus(status: boolean){
        const hudStatus = document.getElementById("status-server") as HTMLDivElement
        
        if(status){
            hudStatus.innerHTML = '🟢 Online'
        }
        else{
            hudStatus.innerHTML = '🔴 Offline'
        }


    }


}