import { 
    AmbientLight,
    Audio,
    AudioListener,
    AudioLoader,
    Color, 
    DirectionalLight, 
    Fog, 
    Mesh,  
    Object3D, 
    PerspectiveCamera, 
    PositionalAudio, 
    Scene, 
    Vector3, 
    WebGLRenderer 
} from "three";
import Ground from "./Ground";
import { Octree } from "three/examples/jsm/math/Octree.js";
import { OctreeHelper } from "three/examples/jsm/helpers/OctreeHelper.js";
import PlayerController from "./PlayerController";
import Items from "./Items";

import SocketManager from "./SocketManager";
import elementos, { eventEmitter, showInstruction } from "./Actions";
import { gui } from "./GuiControl";
import Loading from "./Loading";
import { infoPlayer } from "./InfoPlayer";
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import { NPC } from "./NPC";
import { EntityManager } from "yuka";
import { npcPaths } from "./Path";
import VoiceChatManager from "./VoiceChatManager";
import Guest from "./Guest";
import {MissionManagers} from "./MissionManager";
import VitalSystem from "./VitalSystem";
import TeacherNPC from "./Teachernpc";

export default class Experience{

    scene: Scene
    renderer = new WebGLRenderer({antialias: true})
    camera = new PerspectiveCamera()
    octree = new Octree();
    playerController: PlayerController
    listener = new AudioListener();
    items: Items
    socket = SocketManager
    loading: Loading
    audioLoader: AudioLoader
    ambientLight = new AmbientLight(0xFFCC88, 2)
    entityManager: EntityManager 
    voiceChatManager: VoiceChatManager
    urlAvatar:      string
    playerName:     string
    missionManager: MissionManagers
    vitalSystem:    VitalSystem
    teacherNPC:     TeacherNPC

    constructor(loading: Loading, avatarUrl: string, scene: Scene, playerName = 'Agente')
    {
        this.scene = scene
        this.urlAvatar  = avatarUrl
        this.playerName = playerName
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
        this.setInteractionAudio()
        this.items = new Items(this.scene, this.loading)
        
        // Registra avatar + nome — persiste para reconexões
        this.socket.setAvatar(this.urlAvatar, this.playerName)

        // Inicializa o HUD com os dados do jogador local
        if (typeof (window as any).HUD !== 'undefined') {
            (window as any).HUD.setPlayer(this.playerName, this.urlAvatar, 'player')
        }

        // Atualiza o role no HUD quando o servidor confirmar
        this.socket.io.on('player:info', (data: any) => {
            if (typeof (window as any).HUD !== 'undefined') {
                (window as any).HUD.setPlayer(this.playerName, this.urlAvatar, data.role)
            }
        })
        this.socket.io.on('players:update', (players: any) => {
            const me = players[this.socket.io.id as string]
            if (me && typeof (window as any).HUD !== 'undefined') {
                (window as any).HUD.setPlayer(this.playerName, this.urlAvatar, me.role)
            }
        })

        //Gerenciador de Voz
        this.voiceChatManager = new VoiceChatManager(this.listener);

        eventEmitter.addEventListener("init_micro", async (e) => {
            const status = (e as any).detail as boolean;
          
            try {
              if (status) {
                await this.voiceChatManager.initMicrophone();
              } else {
                this.voiceChatManager.stopMicrophone();
              }
            } catch (error) {
              console.error("Erro ao lidar com microfone:", error);
            }
          });
        
        const audioSourceObject = new Object3D();
        audioSourceObject.position.set(0, 3, -5); // posição fixa na cena
        this.scene.add(audioSourceObject);
        this.voiceChatManager.handleIncomingAudio(audioSourceObject);


        this.playerController = new PlayerController(
            this.scene, 
            this.camera,
            this.items,
            this.loading,
            this.urlAvatar
        )

        this.items.itemsLoaded.then(() => {
            this.playerController.refreshBVH()
            console.log("[Experience] BVH buildado após loading completo.")
        })

        //Inicia a posição do personagem

        const X = Math.random() * (20 - -10) + -10
        const Y = 0
        const Z = -(Math.random() * (20 - 15) + 15)
        this.playerController.playerModel.setPosition(new Vector3(X,Y,Z))

    


        
        // const playerFolder = gui.addFolder("Player")
        // playerFolder.add(this.playerController.playerModel.rotation,"x", -Math.PI, Math.PI)
        // playerFolder.add(this.playerController.playerModel.rotation,"y", -Math.PI, Math.PI)
        // playerFolder.add(this.playerController.playerModel.rotation,"z", -Math.PI, Math.PI)
        
        // playerFolder.add(this.playerController.playerModel.position,"x", 0, 10)
        // playerFolder.add(this.playerController.playerModel.position,"y", 0, 10)
        // playerFolder.add(this.playerController.playerModel.position,"z", 0, 10)

        this.setOctree()
        window.addEventListener('resize', this.onResize)

        //NPC
        this.entityManager = new EntityManager();
        //this.setNpc()

        // ── Expõe luz ambiente para MissionManager usar ──────────────────
        (window as any).__experienceAmbientLight = this.ambientLight;

        // ── VitalSystem: drena energia/vida, bloqueia terminal ─────────────
        this.vitalSystem = new VitalSystem(this.playerController);

        // ── MissionManager: sequência de missões centralizada ─────────────
        this.missionManager = new MissionManagers(this.scene, this.loading);
        this.missionManager.start();

        // ── TeacherNPC: professor que entrega notebook e ministra aulas ──────
        this.teacherNPC = new TeacherNPC(this.scene, this.loading);
        this.teacherNPC.setPlayerModel(this.playerController.playerModel);
        this.entityManager.add(this.teacherNPC);  // Yuka gerencia o update()

        // Expõe globalmente para o comando "teach" do terminal acessar
        (window as any).__teacherNPC = this.teacherNPC;

    }
  
    setScene(){      
        this.scene.background = new Color( 0x000 );
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

    setAmbienceAudio() {
        const soundSource = new Object3D();
        soundSource.position.set(0, 2.5, -2.5);
        this.scene.add(soundSource);

        const sound = new PositionalAudio(this.listener);
        soundSource.add(sound);

        const audioLoader = this.audioLoader;

        // Causa 1 do bug: AudioContext fica suspended até um gesto do usuário.
        // Solução: resumir o contexto antes de qualquer play(), e só chamar
        // play() dentro do .then() para garantir que está running.
        const resumeAndPlay = async () => {
            const ctx = this.listener.context;
            if (ctx.state === "suspended") {
                await ctx.resume();
            }
        };

        const playSound = (file: string) => {
            audioLoader.load(file, async (buffer) => {
                if (sound.isPlaying) sound.stop();
                sound.setBuffer(buffer);
                sound.setLoop(true);
                sound.setVolume(0.5);
                sound.setRefDistance(5);
                sound.setMaxDistance(30);
                sound.setRolloffFactor(1);

                await resumeAndPlay();
                sound.play();
            });
        };

        // Causa 2 do bug: playSound() chamado imediatamente na construção,
        // antes de qualquer interação do usuário — AudioContext ainda suspended.
        // Solução: aguardar o primeiro clique/tecla antes de iniciar o áudio.
        let currentTrack = "audio/auditorio.mp3";
        let started = false;

        const startOnInteraction = () => {
            if (started) return;
            started = true;
            playSound(currentTrack);
            window.removeEventListener("click",   startOnInteraction);
            window.removeEventListener("keydown", startOnInteraction);
        };

        window.addEventListener("click",   startOnInteraction, { once: true });
        window.addEventListener("keydown", startOnInteraction, { once: true });

        SocketManager.io.on("music:play", () => {
            currentTrack = (currentTrack === "audio/auditorio.mp3")
                ? "audio/music_1.mp3"
                : "audio/auditorio.mp3";
            playSound(currentTrack);
        });
    }

    setInteractionAudio() {
        const soundSource = new Object3D();
        soundSource.position.set(0, 1, 1);
        this.scene.add(soundSource);

        const sound = new PositionalAudio(this.listener);
        soundSource.add(sound);

        const audioLoader = this.audioLoader;

        const playSound = async (file: string) => {
            const ctx = this.listener.context;
            if (ctx.state === "suspended") {
                await ctx.resume();
            }
            audioLoader.load(file, (buffer) => {
                if (sound.isPlaying) sound.stop();
                sound.setBuffer(buffer);
                sound.setVolume(0.5);
                sound.setRefDistance(5);
                sound.setMaxDistance(30);
                sound.setRolloffFactor(1);
                sound.play();
            });
        };
    
        let currentTrack = "audio/aplausos.mp3";
    
        SocketManager.io.on("music:aplausos", () => {
            playSound(currentTrack);
        })
    }
    
    

    async beep() {
        const ctx = this.listener.context;
        if (ctx.state === "suspended") {
            await ctx.resume();
        }

        const sound = new Audio(this.listener);
        this.audioLoader.load("audio/beep.mp3", (buffer) => {
            sound.setBuffer(buffer);
            sound.setLoop(false);
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

        // this.scene.add(new DirectionalLightHelper(directionalLight, 1));
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
            "Inspetor", 
            this.scene, 
            this.loading, 
            "models/asian_male_animated_v2.glb",
            npcPaths["patrol"],
            this.playerController.playerModel
        );
        this.entityManager.add(npc);
    }

    update(delta: number){
        this.playerController.update(delta)

        Guest.update(delta, this.camera)

        // Drena energia/vida e controla cooldown do terminal
        this.vitalSystem.update(delta)

        // Verifica zona da missão ativa
        this.teacherNPC.tick(this.camera)  // label 2D (update() é pelo entityManager)
        this.missionManager.checkZone(this.playerController.playerModel.position)

        this.entityManager.update(delta)

        this.renderer.render(this.scene, this.camera)
    }
}