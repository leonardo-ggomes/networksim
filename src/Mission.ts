import {
    AdditiveBlending,
    ArrowHelper,
    BufferGeometry,
    CylinderGeometry,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    Points,
    PointsMaterial,
    RingGeometry,
    Scene,
    TorusGeometry,
    Vector3,
} from "three";
import Items from "./Items";
import elementos, { eventEmitter } from "./Actions";
import { infoPlayer } from "./InfoPlayer";
import { gui } from "./GuiControl";
import Loading from "./Loading";


export default class Mission {

    local: Vector3
    missionPoint: Group
    title: string
    isCollided = false
    listeners: [string, EventListener][] = [];
    eventEmitter: EventTarget;
    reward: number
    isComplete: boolean
    helper: boolean
    missionHelper?: ArrowHelper
    private _markerTime = 0  // acumulador de tempo para animação
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
    private createMissionPoint(position: Vector3, color: any, hasHelper: boolean): Group {

        // ══════════════════════════════════════════════════════════════════
        // MARCADOR CYBER — estilo GTA V / ctOS
        // ══════════════════════════════════════════════════════════════════
        // Estrutura (todos procedurais, zero PNGs externos):
        //
        //  ┌── group (raiz, posicionado no mundo)
        //  │   ├── groundPlane  — disco flat no chão (fill transparente)
        //  │   ├── outerRing    — anel externo giratório (chunky, GTA-style)
        //  │   ├── innerRing    — anel interno contra-giratório
        //  │   ├── cornerTicks  — 4 segmentos nos cantos (▐ estilo HUD)
        //  │   ├── pillar       — cilindro vertical fino (destaca a zona)
        //  │   ├── topRing      — anel no topo do pillar
        //  │   └── particles    — pontos flutuantes ao redor (ambient)
        // ══════════════════════════════════════════════════════════════════

        const group = new Group();
        group.position.set(position.x, position.y, position.z);

        const C   = color;        // cor principal
        const R   = 1.6;          // raio base
        const mat = (c: number, op = 1.0) => new MeshBasicMaterial({
            color: c, transparent: op < 1, opacity: op,
            side: DoubleSide, depthWrite: false,
            blending: AdditiveBlending,
        });

        // ── Disco de chão (fill) ──────────────────────────────────────────
        const discGeo = new RingGeometry(0, R * 0.95, 64);
        const disc    = new Mesh(discGeo, mat(C, 0.08));
        disc.rotation.x = -Math.PI / 2;
        disc.name = "disc";
        group.add(disc);

        // ── Anel externo — grosso, 8 segmentos, GTA-style ─────────────────
        const outerGeo = new TorusGeometry(R, 0.07, 4, 8);
        const outer    = new Mesh(outerGeo, mat(C, 0.95));
        outer.rotation.x = Math.PI / 2;
        outer.name = "outerRing";
        group.add(outer);

        // ── Anel intermediário ────────────────────────────────────────────
        const midGeo = new TorusGeometry(R * 0.72, 0.035, 4, 32);
        const mid    = new Mesh(midGeo, mat(C, 0.55));
        mid.rotation.x = Math.PI / 2;
        mid.name = "midRing";
        group.add(mid);

        // ── Anel interno fino ─────────────────────────────────────────────
        const innerGeo = new TorusGeometry(R * 0.45, 0.025, 4, 32);
        const inner    = new Mesh(innerGeo, mat(C, 0.70));
        inner.rotation.x = Math.PI / 2;
        inner.name = "innerRing";
        group.add(inner);

        // ── Corner ticks — 4 arcos curtos nos eixos cardinais ─────────────
        // Simula o ícone ◎ / waypoint dos jogos de ação
        for (let i = 0; i < 4; i++) {
            const tickGeo = new TorusGeometry(R, 0.055, 4, 3, Math.PI * 0.22);
            const tick    = new Mesh(tickGeo, mat(C, 1.0));
            tick.rotation.x = Math.PI / 2;
            tick.rotation.z = (Math.PI / 2) * i + Math.PI * 0.11;
            group.add(tick);
        }

        // ── Pillar — cilindro vertical fino (beacon) ──────────────────────
        const PILLAR_H = 4.5;
        const pillarGeo = new CylinderGeometry(0.022, 0.022, PILLAR_H, 6);
        const pillar    = new Mesh(pillarGeo, mat(C, 0.35));
        pillar.position.y = PILLAR_H / 2;
        pillar.name = "pillar";
        group.add(pillar);

        // ── Top ring — anel no topo do beacon ────────────────────────────
        const topRingGeo = new TorusGeometry(0.28, 0.04, 4, 16);
        const topRing    = new Mesh(topRingGeo, mat(C, 0.9));
        topRing.position.y = PILLAR_H;
        topRing.name = "topRing";
        group.add(topRing);

        // ── Diamond — losango achatado no topo (ícone GTA) ────────────────
        const diamondGeo = new RingGeometry(0.0, 0.22, 4); // quad = 4 segmentos → losango
        const diamond    = new Mesh(diamondGeo, mat(C, 0.95));
        diamond.position.y = PILLAR_H + 0.32;
        diamond.rotation.z = Math.PI / 4; // rotaciona 45° → ◆
        diamond.name = "diamond";
        group.add(diamond);

        // ── Particles — pontos flutuantes ao redor (ambiente) ─────────────
        const NPTS = 28;
        const ptPositions = new Float32Array(NPTS * 3);
        for (let i = 0; i < NPTS; i++) {
            const angle  = (i / NPTS) * Math.PI * 2;
            const radius = R * (0.55 + Math.random() * 0.65);
            const height = Math.random() * PILLAR_H * 0.7;
            ptPositions[i * 3]     = Math.cos(angle) * radius;
            ptPositions[i * 3 + 1] = height;
            ptPositions[i * 3 + 2] = Math.sin(angle) * radius;
        }
        const ptGeo = new BufferGeometry();
        ptGeo.setAttribute('position', new Float32BufferAttribute(ptPositions, 3));
        const pts = new Points(ptGeo, new PointsMaterial({
            color: C, size: 0.045, transparent: true, opacity: 0.7,
            blending: AdditiveBlending, depthWrite: false,
        }));
        pts.name = "particles";
        group.add(pts);

        return group;
    }

    removeMissionPoint(object: Object3D, scene: Scene) {      
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

    // ── Animação do marcador — chame no update() do game loop ──────────────
    // delta: tempo desde último frame (segundos)
    // Anima rotação dos anéis, pulso do disco e flutuação do beacon.
    tickMarker(delta: number) {
        this._markerTime += delta;
        const t = this._markerTime;

        const outer   = this.missionPoint.getObjectByName("outerRing");
        const mid     = this.missionPoint.getObjectByName("midRing");
        const inner   = this.missionPoint.getObjectByName("innerRing");
        const disc    = this.missionPoint.getObjectByName("disc");
        const pillar  = this.missionPoint.getObjectByName("pillar");
        const topRing = this.missionPoint.getObjectByName("topRing");
        const diamond = this.missionPoint.getObjectByName("diamond");

        // Anéis giratórios — velocidades e direções diferentes
        if (outer)   (outer as Mesh).rotation.z   =  t * 0.6;
        if (mid)     (mid   as Mesh).rotation.z   = -t * 1.1;
        if (inner)   (inner as Mesh).rotation.z   =  t * 1.8;
        if (topRing) (topRing as Mesh).rotation.z =  t * 2.2;

        // Diamond — pulsa escala (◆ pisca suavemente)
        if (diamond) {
            const pulse = 0.85 + Math.sin(t * 3.5) * 0.15;
            diamond.scale.setScalar(pulse);
        }

        // Disco de chão — pulsa opacidade (respiração)
        if (disc) {
            const discMat = (disc as Mesh).material as MeshBasicMaterial;
            discMat.opacity = 0.04 + Math.abs(Math.sin(t * 1.2)) * 0.10;
        }

        // Pillar — pulsa opacidade (beacon piscando)
        if (pillar) {
            const pillarMat = (pillar as Mesh).material as MeshBasicMaterial;
            pillarMat.opacity = 0.15 + Math.abs(Math.sin(t * 2.0)) * 0.25;
        }

        // Grupo inteiro — leve flutuação vertical (Y ±0.06)
        this.missionPoint.position.y = this.local.y + Math.sin(t * 1.5) * 0.06;
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