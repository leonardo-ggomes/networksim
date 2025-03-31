import { Object3D, Scene, Vector3, AnimationMixer, AnimationClip } from "three";
import * as YUKA from "yuka";
import { StateMachine, WalkState } from "./StateMachine";
import Loading from "./Loading";

export class NPC extends YUKA.Vehicle {
    npcMesh?: Object3D;
    name: string;
    stateMachine: StateMachine;
    path: YUKA.Path;
    speed: number = 1;
    loading: Loading;
    scene: Scene;
    mixer?: AnimationMixer;
    animations: AnimationClip[] = [];
    currentAnimation: string
    player?: Object3D;
    pathNav: YUKA.Vector3[]
    paused: boolean = false;
    
    private targetRotation = new Object3D();    
    private reversePath = false;
    

    constructor(name: string, scene: Scene, loading: Loading, modelPath: string, pathNav: YUKA.Vector3[], playerModel: Object3D) {
        super();
        this.name = name;
        this.stateMachine = new StateMachine(this);
        this.stateMachine.changeState(new WalkState());
        this.loading = loading;
        this.scene = scene;
        this.player = playerModel
     
        this.path = new YUKA.Path();
        this.pathNav = pathNav;
        this.setPath();
        this.setModel(modelPath);
        this.currentAnimation = "Idle"
    }


    private setPath() {
    
        if(this.pathNav.length > 0)
        {
            this.path.clear(); // Limpa o caminho atual

            const points = this.reversePath ? [...this.pathNav].reverse() : [...this.pathNav];

            for (const point of points) {
                this.path.add(point);
            }

            this.position.copy(this.path.current());
        }
    }

    setModel(path: string) {
        this.loading.loader.load(
            path,
            async (model) => {
                this.npcMesh = model.scene;
                this.npcMesh.scale.set(1, 1, 1);
                this.npcMesh.position.copy(this.path.current());
                this.scene.add(this.npcMesh);

                // Configurar animações
                if (model.animations.length > 0) {
                    this.mixer = new AnimationMixer(this.npcMesh);
                    this.animations = model.animations;
                
                    this.playAnimation(this.currentAnimation); 
                }
            },
            undefined,
            (error) => console.error("Erro ao carregar modelo NPC:", error)
        );
    }

    playAnimation(name: string) {
        if (this.mixer && this.animations.length > 0) {
            if (name !== this.currentAnimation) {
                const clip = AnimationClip.findByName(this.animations, name);
                if (clip) {
                    const prevAction = this.mixer.clipAction(AnimationClip.findByName(this.animations, this.currentAnimation));
                    const newAction = this.mixer.clipAction(clip);
    
                    prevAction?.fadeOut(0.3);  // Suaviza a saída da animação anterior
                    newAction.reset().fadeIn(0.3).play(); // Suaviza entrada da nova animação
                    
                    this.currentAnimation = name;
                }
            }
        }
    }

    setSpeed(speed: number) {
        this.speed = speed;
    }

    chasePlayer(delta: number) {
        console.log(`${this.name} ${delta} está correndo atrás do jogador!`);
    }

    followPath(delta: number) {
        if (this.npcMesh && !this.paused) {
            const targetYuka = this.path.current(); // Obtém o próximo ponto do caminho
            if (!targetYuka) return; // Se não houver pontos, sai da função

            // Converter target de YUKA.Vector3 para THREE.Vector3
            const target = new Vector3(targetYuka.x, targetYuka.y, targetYuka.z);
      
            // Criar rotação alvo
            this.targetRotation.position.copy(this.npcMesh.position);
            this.targetRotation.lookAt(target);

            // Interpolação suave da rotação
            this.npcMesh.quaternion.slerp(this.targetRotation.quaternion, delta * 9.0);

            // Criar uma cópia da posição atual do NPC e interpolar
            const pos = this.npcMesh.position.clone().lerp(target, delta * this.speed * 0.3);

            if (pos.distanceTo(target) < 3.0) {
                if(this.path.finished())
                {
                    this.reversePath = !this.reversePath;
                    this.setPath();
                    this.stateMachine.changeState(this.stateMachine.states["idle"])

                    setTimeout(() => {
                        this.paused = false;
                        this.stateMachine.changeState(this.stateMachine.states["walk"])
                    }, 3000)
            
                }

                this.path.advance(); // Avança para o próximo ponto               
            }

            this.npcMesh.position.copy(pos); // Atualiza a posição no Three.js
            this.position.set(pos.x, pos.y, pos.z); // Atualiza a posição no YUKA
        }
    }

    override update(delta: number): this {
        super.update(delta);
        this.stateMachine.update(delta);

        // Atualizar animação
        if (this.mixer) {
            this.mixer.update(delta);
        }

        return this;
    }
}
