import { Object3D, Scene, Vector3, AnimationMixer, AnimationClip } from "three";
import * as YUKA from "yuka";
import { StateMachine, WalkState } from "./StateMachine";
import Loading from "./Loading";

export class NPC extends YUKA.Vehicle {
    npcMesh?: Object3D;
    name: string;
    stateMachine: StateMachine;
    path: YUKA.Path;
    speed: number = 2;
    loading: Loading;
    scene: Scene;
    mixer?: AnimationMixer;
    animations: AnimationClip[] = [];

    constructor(name: string, scene: Scene, loading: Loading, modelPath: string) {
        super();
        this.name = name;
        this.stateMachine = new StateMachine(this);
        this.stateMachine.changeState(new WalkState());
        this.loading = loading;
        this.scene = scene;

        this.path = new YUKA.Path();
        this.setPath();
        this.setModel(modelPath);
    }

    setPath() {
        // Criar um caminho de patrulha       
        this.path.add(new YUKA.Vector3(10, .5, 26));
        this.path.add(new YUKA.Vector3(10,.5, 30));
        this.path.add(new YUKA.Vector3(10,.5, 35));
        this.path.add(new YUKA.Vector3(10,.5, 45));
        this.path.add(new YUKA.Vector3(10,.5, 50));
        this.path.add(new YUKA.Vector3(10,.5, 55));
        this.path.add(new YUKA.Vector3(10,.5, 60));
        this.path.add(new YUKA.Vector3(10,.5, 65));
        this.path.add(new YUKA.Vector3(10,.5, 70));
        this.path.add(new YUKA.Vector3(10,.5, 75));
        this.path.loop = true;

        // Definir posição inicial
        this.position.copy(this.path.current());
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
                    
                    this.playAnimation("Walking"); // Reproduzir animação inicial
                }
            },
            undefined,
            (error) => console.error("Erro ao carregar modelo NPC:", error)
        );
    }

    playAnimation(name: string) {
        if (this.mixer && this.animations.length > 0) {
            const clip = AnimationClip.findByName(this.animations, name);
            if (clip) {
                const action = this.mixer.clipAction(clip);
                action.reset().play();
            }
        }
    }

    setSpeed(speed: number) {
        this.speed = speed;
    }

    moveAlongPath(delta: number) {
        this.followPath(delta);
    }

    chasePlayer(delta: number) {
        console.log(`${this.name} ${delta} está correndo atrás do jogador!`);
        this.playAnimation("Run"); // Muda para animação de corrida (se houver)
    }

    followPath(delta: number) {
        if (this.npcMesh) {
            const targetYuka = this.path.current(); // Obtém o próximo ponto do caminho
            if (!targetYuka) return; // Se não houver pontos, sai da função

            // Converter target de YUKA.Vector3 para THREE.Vector3
            const target = new Vector3(targetYuka.x, targetYuka.y, targetYuka.z);

            // Criar uma cópia da posição atual do NPC e interpolar
            const pos = this.npcMesh.position.clone().lerp(target, delta * this.speed * 0.3);

            if (pos.distanceTo(target) < 2.0) {
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
