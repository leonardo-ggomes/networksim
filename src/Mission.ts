import { ArrowHelper, Box3, BoxHelper, DoubleSide, HemisphereLightHelper, Mesh, MeshBasicMaterial, Object3D, RingGeometry, Scene, Sprite, SpriteMaterial, TextureLoader, Vector3 } from "three";
import Items from "./Items";
import elementos, { eventEmitter } from "./Actions";
import { infoPlayer } from "./InfoPlayer";
import { gui } from "./GuiControl";
import Loading from "./Loading";


export default class Mission {

    local: Vector3
    missionPoint: Mesh
    title: string
    isCollided = false
    listeners: [string, EventListener][] = [];
    eventEmitter: EventTarget;
    reward: number
    isComplete: boolean
    helper: boolean
    missionHelper?: ArrowHelper
    loading: Loading

    constructor(title: string, position: Vector3, scene: Scene, event: EventTarget, reward: number, helper: boolean, loading: Loading) {
        
        this.loading = loading
        this.isComplete = false
        this.eventEmitter = event     
        this.reward = reward   
        this.title = title
        this.local = position
        this.helper = helper
        

        this.missionPoint = this.createMissionPoint(this.local, 0xff0000, this.helper)      
        scene.add(this.missionPoint)
      
        // const playerFolder = gui.addFolder("Mission Point 1")

        // playerFolder.add(this.missionPoint.position,"x", -100, 100)
        // playerFolder.add(this.missionPoint.position,"y", 0, 10)
        // playerFolder.add(this.missionPoint.position,"z", -100, 100)
        // playerFolder.add(this.missionPoint.scale,"x", -100, 100)
        // playerFolder.add(this.missionPoint.scale,"y", -100, 100)
        // playerFolder.add(this.missionPoint.scale,"z", -100, 100)
    }

    /**
     * 
     * @param scene 
     * @param position 
     * @param color 
     * @description O parâmetro {color} é do tipo hexadecimal. Ex: 0xff0000
     */
    private createMissionPoint(position: Vector3, color: any, hasHelper: boolean): Mesh {

        const ringGeometry = new RingGeometry(1.2, 1.5, 32);
        const ringMaterial = new MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,
            side: DoubleSide,
            visible: false
        });


        let ring = new Mesh(ringGeometry, ringMaterial);


        ring.rotation.x = -Math.PI / 2;
        ring.position.x = position.x
        ring.position.z = position.z
        ring.position.y = position.y;
        ring.scale.set(3,3,3)

        if(hasHelper)
        {
            const textureMap = this.loading.textureLoader.load("img/pin_local.png")
            const markerMaterial = new SpriteMaterial({
                map: textureMap,
                depthTest: false
            })

            const marker = new Sprite(markerMaterial)
            marker.scale.set(.2,.2,.2)
            marker.position.z += 0.6
            ring.add(marker)

            // this.missionHelper = new ArrowHelper(new Vector3(0,0,-1))
            // this.missionHelper.setLength(0.07)
            // this.missionHelper.setColor(0xffffff)
            // this.missionHelper.position.z += 0.6
            // ring.add(this.missionHelper)
        }
      

        return ring;
    }

    removeMissionPoint(object: Mesh, scene: Scene) {      
        scene.remove(object);
    }

    checkMissionZone(player: Vector3, ring: Vector3, radius: number) {
    
        if(!this.isComplete){
            const playerPos = player;
            const ringPos = ring;
        
            // Calcula a distância entre o jogador e o centro do anel
            const distance = playerPos.distanceTo(ringPos);
        
            // Verifica se o jogador está dentro do raio do anel
            this.isCollided = distance < radius;
            elementos.setIsCollided(this.isCollided)

            if(this.isCollided){
                eventEmitter.dispatchEvent(new CustomEvent("collided", {
                    detail: {
                        collided: this.isCollided
                    }
                }))
            }            

        }
        else{
            elementos.setIsCollided(false)
        }
    }

    addGameListener(event: string, callback: EventListener, isOnce: boolean) {
        this.eventEmitter.addEventListener(event, callback, {once: isOnce});
        this.listeners.push([event, callback]);
    }

    removeEvent(eventName: string, callback: EventListener) {
        this.eventEmitter.removeEventListener(eventName, callback);
    }
    
    clearAllListeners() {
        this.listeners.forEach(([event, callback]) => this.eventEmitter.removeEventListener(event, callback));
        this.listeners.length = 0;
    }

    rewardPlayer(){
        infoPlayer.energy += this.reward
    }

    finished(){
        this.isComplete = true
    }

    showInstruction(title: string, content: string){
        const instruction = document.getElementById("instruction") as HTMLDivElement
        instruction.innerHTML = `
            <div class="inst-title">${title}</div>
            <div class="inst-subtitle">
                ${content}
            </div>
        `
    }

    async addObject(position: Vector3, scale: number, name: string, scene: Scene){
        const [obj] = await Promise.all(
            [
                this.loading.loader.loadAsync(`models/${name}.glb`)
            ]
        )

        obj.scene.position.copy(position)
        obj.scene.scale.set(scale, scale, scale)
        scene.add(obj.scene)
    }
    
}