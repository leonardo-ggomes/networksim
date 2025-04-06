import { 
    AmbientLight,
    Audio,
    AudioListener,
    AudioLoader,
    Color, 
    DirectionalLight, 
    DirectionalLightHelper, 
    Fog, 
    Mesh, 
    MeshBasicMaterial, 
    PerspectiveCamera, 
    PositionalAudio, 
    Scene, 
    SphereGeometry, 
    Vector3, 
    WebGLRenderer 
} from "three";
import Ground from "./Ground";
import { Octree } from "three/examples/jsm/math/Octree.js";
import { OctreeHelper } from "three/examples/jsm/helpers/OctreeHelper.js";
import PlayerController from "./PlayerController";
import Items from "./Items";

import SocketManager from "./SocketManager";
import AudioStage from "./AudioStage";
import MinMap from "./MiniMap";
import MiniMap from "./MiniMap";
import Mission from "./Mission";
import elementos, { eventEmitter } from "./Actions";
import { gui } from "./GuiControl";
import Loading from "./Loading";
import { infoPlayer } from "./InfoPlayer";
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import { NPC } from "./NPC";
import { EntityManager } from "yuka";
import { npcPaths } from "./Path";

export default class Experience{

    scene = new Scene()
    renderer = new WebGLRenderer({antialias: true})
    camera = new PerspectiveCamera()
    octree = new Octree();
    playerController: PlayerController
    listener = new AudioListener();
    items: Items
    socket = SocketManager
    miniMap: MinMap
    currentMission?: Mission
    loading: Loading
    audioLoader: AudioLoader
    ambientLight = new AmbientLight(0xFFCC88, 2)
    entityManager: EntityManager 

    constructor(loading: Loading)
    {
        this.loading = loading
        this.audioLoader = new AudioLoader(this.loading.manager)
        this.setScene()
        this.setRenderer()
        this.setCamera()
        // this.setGround()
        this.setLight()    
        this.setAmbientLight()
        this.camera.add(this.listener)
        this.setAmbienceAudio()
        this.items = new Items(this.scene, this.loading)

        this.socket.scene = this.scene
        this.socket.loading = this.loading

        //const audioStage = new AudioStage(this.camera, this.loading)   

        this.playerController = new PlayerController(
            this.scene, 
            this.camera,
            this.octree,
            this.items,
            this.loading
        )

        //Inicia a posição do personagem
        this.playerController.playerModel.setPosition(
            new Vector3(Math.random() * 10, 0, 0)
        )


        this.miniMap = new MiniMap(this.scene, this.renderer, this.playerController.playerModel.position)

        
        const playerFolder = gui.addFolder("Player")
        playerFolder.add(this.playerController.playerModel.rotation,"x", -Math.PI, Math.PI)
        playerFolder.add(this.playerController.playerModel.rotation,"y", -Math.PI, Math.PI)
        playerFolder.add(this.playerController.playerModel.rotation,"z", -Math.PI, Math.PI)
        
        playerFolder.add(this.playerController.playerModel.position,"x", 0, 10)
        playerFolder.add(this.playerController.playerModel.position,"y", 0, 10)
        playerFolder.add(this.playerController.playerModel.position,"z", 0, 10)

        this.setOctree()
        window.addEventListener('resize', this.onResize)

        //NPC
        this.entityManager = new EntityManager();
        this.setNpc()

        //Missão
        this.startFirstMission()
    }
  
    setScene(){      
        this.scene.background = new Color( 0x34495E );
        this.scene.fog = new Fog( 0x34495E, 0, 80 );
    }
    
    setRenderer(){
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement)
    }

    setCamera(){
        this.camera.fov = 45
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.near = 0.1
        this.camera.far = 1000        
        this.camera.position.set(0, 5, 8)
        this.camera.updateProjectionMatrix()   
    }

    setAmbientLight(){
        this.ambientLight.intensity = .2
        this.scene.add(this.ambientLight)
    }

    setGround(){
        this.scene.add(new Ground())
        //this.scene.add(new GridHelper(100,100))
    }

    setAmbienceAudio(){
        const sound = new Audio(this.listener);
        this.audioLoader.load("audio/auditorio.mp3", (buffer) => {
            sound.setBuffer(buffer);
            sound.setLoop(true); // Faz o som tocar continuamente
            sound.setVolume(0.5); // Ajuste o volume (0.0 a 1.0)
            sound.play(); // Começa a tocar
        });
    }

    beep(){     
        const sound = new Audio(this.listener);    

        this.audioLoader.load("audio/beep.mp3", (buffer) => {
            sound.setBuffer(buffer);
            sound.setLoop(false); // Toca apenas 1 vez
            sound.setVolume(0.8); 
            sound.play(); 
        });
    }
  
    setLight(){
        const directionalLight = new DirectionalLight( 0x000000, .1 );
        directionalLight.position.set( - 5, 25, - 1 );
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.near = 0.01;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.right = 30;
        directionalLight.shadow.camera.left = - 30;
        directionalLight.shadow.camera.top	= 30;
        directionalLight.shadow.camera.bottom = - 30;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        directionalLight.shadow.radius = 4;
        directionalLight.shadow.bias = - 0.00006;
        this.scene.add(directionalLight);

        this.scene.add(new DirectionalLightHelper(directionalLight, 1));
    }

    setSoundStage(sound: PositionalAudio, object: Mesh){
        object.add(sound)
    }

    setOctree(helper = false){
       helper && new OctreeHelper(this.octree);
    }  

    onResize = () => {        
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight); 
    }

    setDriver(title: string, content: string){
        const driverObj = driver();
        driverObj.highlight({
          element: "#instruction",
          popover: {
            title: title,
            description: content
          }
        });
    }

    setNpc(){
        const npc = new NPC(
            "Hacker", 
            this.scene, 
            this.loading, 
            "models/asian_male_animated_v2.glb",
            npcPaths["patrol"],
            this.playerController.playerModel
        );
        this.entityManager.add(npc);
    }

    startFirstMission(){

        let reward = 3
        let mission1 = new Mission(
            "Encontre o dispositivo",
            new Vector3(11.4, 1.15, 55.8),
            this.scene,
            eventEmitter,
            reward,
            true,
            this.loading
        )
        
        setTimeout(() => {
            mission1.showInstruction(
                "Encontre o dispositivo",
                "Foi visto um homem deixando um notebook na lixeira da WasteClean logo a frente."
            )

            this.setDriver("🎯Caixa de mensagem","Aqui você encontrará instruções básicas, fique de olho!" )
        }, 3000);    

       // mission1.addObject(new Vector3(11.4, 1.15, 55.8), .5,"laptop", this.scene)
        

        //Verifica se o processo foi removido
        mission1.addGameListener('collided', (event) => {
            const {detail} = event as CustomEvent;
            
           const foundDevice = detail.collided as boolean

           if(foundDevice){
                mission1.rewardPlayer()
                infoPlayer.hasTerminal = true //Habilita o terminal
                this.beep()
                elementos.showMsg('✅ Dispositivo encontrado')
                mission1.removeMissionPoint(mission1.missionPoint, this.scene)
                mission1.showInstruction(
                    "Dispositivo habilitado",
                    "Pressione a tecla T para usar o dispositivo."
                )
                mission1.finished()
               
                this.startSecondMission()
           }           
                    
        }, true)
            
        this.currentMission = mission1
        elementos.setCurrentMission(this.currentMission.title) 
    }

    startSecondMission(){

        let reward = 3
        let mission2 = new Mission(
            `  
            -- [12:30]: Novo acesso: IP <201.200.928.21>[desconhecido] 
            -- [12:58]: Aplicação instalada com sucesso
            -- [13:01]: Aplicação em execução           
            -- [13:04]: Alto consumo de memória
            -- [13:05]: Alto consumo de memória
            -- [13:15]: Sua máquina precisa de atenção
            -- [13:17]: Alto consumo de memória
            `,
            new Vector3(11.4, 1.15, 55.8),
            this.scene,
            eventEmitter,
            reward,
            true,
            this.loading
        )
    
        //Adiciona o processo suspeito
        let process ={
            name: "anomimo",
            pid: 7777,
            memory: 849.90,
            cpu: 47
        } 
        elementos.setProcesses(process.name, process.pid, process.memory, process.cpu)
        
        setTimeout(() => {
            mission2.showInstruction(
                "Elimine o Malware",
                "Há uma suspeita que o hacker executou um programa malicioso antes do blackout"
            )
        }, 15000);        
      

        //Verifica se o processo foi removido
        mission2.addGameListener('remove_pid', (event) => {
            const {detail} = event as CustomEvent;
            
           const removido = (detail.processes as any[]).findIndex(i => i.pid == 7777) //malware.exe

           if(removido === -1 && detail.isCollided){
                mission2.rewardPlayer()
                elementos.showMsg('✅ Missão Concluída')
                mission2.removeMissionPoint(mission2.missionPoint, this.scene)
                mission2.showInstruction(
                    "Progresso",
                    "A energia parece que está voltando"
                )
                this.ambientLight.intensity = 0.4                
                mission2.finished()
                
                this.startThirdMission()
           }
           else if(removido === -1){
            //Adiciona o processo suspeito novamente se apagar fora da missão
            elementos.setProcesses(process.name, process.pid, process.memory, process.cpu)
           }
                    
        }, false)
            
        this.currentMission = mission2
        elementos.setCurrentMission(this.currentMission.title) 
    }
    
    startThirdMission(){

        let reward = 2
        let mission3 = new Mission(
            `
                \n
                -- [13:50]: O App EstacionaSyS parou inesperadamente.
                -- [13:51]: ReferenceError: pos is not defined.               
            `,
            new Vector3(-54.8, 0.5, -13),
            this.scene,
            eventEmitter,
            reward,
            true,
            this.loading
        )

        setTimeout(() => {
            mission3.showInstruction(
                "Sistema parado",
                "O hacker implantou uma falha no código, corrija o mais rápido possível."
            )
        }, 15000);        

        //Adiciona o processo suspeito
        let file ={
            name: "app.js", 
            content: `
            1 #Código
            2 function guardarCarro(vaga = 1){
            3
            4   while(pos <= 20){
            5       if(vaga == pos){
            6            console.log("Vaga reservada: "+pos)
            7        }            
            8        pos++
            9   }
            10 }            
            `
        } 

        elementos.setFilesInMission("/",file.name, file.content)

        //Verifica se o processo foi removido
        mission3.addGameListener('new_code', (event) => {
            const {detail} = event as CustomEvent;
            
           const linhaCorreta = detail.line == 3
           const codigoCorreto = String(detail.code).includes("let pos = 0")
           
           if(codigoCorreto && linhaCorreta && detail.isCollided){
                mission3.rewardPlayer()
                elementos.showMsg('✅ Missão Concluída')
                mission3.removeMissionPoint(mission3.missionPoint, this.scene)
                mission3.finished()
           }  
        }, false)
            
        this.currentMission = mission3
        elementos.setCurrentMission(this.currentMission.title) 
    }

    updatePlayers(delta: number){
      Object.keys(this.socket.players).forEach(i => {
        this.socket.players[i].update(delta)
        //this.items.colliders.push(this.socket.players[i]) colisão
      })
    }

    update(delta: number){      
        this.playerController.update(delta)   
        this.updatePlayers(delta)   


        this.currentMission?.checkMissionZone(
            this.playerController.playerModel.position,
            this.currentMission?.missionPoint.position,
            2
        )

        this.entityManager.update(delta)

        //Renderiza os mapas
        this.miniMap.update()
        this.renderer.render(this.scene, this.camera)
    }
}