import * as THREE from "three";
import * as YUKA from "yuka";
import { StateMachine, WalkState } from "./StateMachine";

export class NPC extends YUKA.Vehicle {
    mesh: THREE.Mesh;
    name: string;
    stateMachine: StateMachine;
    path: YUKA.Path;
    speed: number = 150;

    constructor(name: string, mesh: THREE.Mesh) {
        super();
        this.mesh = mesh;
        this.name = name;
        this.stateMachine = new StateMachine(this);
        this.stateMachine.changeState(new WalkState());

        // Criar um caminho de patrulha
        this.path = new YUKA.Path();
        this.path.add(new YUKA.Vector3(0, 1, 0));
        this.path.add(new YUKA.Vector3(5, 1, 5));
        this.path.add(new YUKA.Vector3(10, 1, 0));
        this.path.add(new YUKA.Vector3(5, 1, -5));
        this.path.loop = true;

        // Definir posição inicial
        this.position.copy(this.path.current());
    }

    setSpeed(speed: number) {
        this.speed = speed;
    }

    moveAlongPath(delta: number) {
        this.followPath(delta);
    }

    chasePlayer(delta: number) {
        console.log(`${this.name} está correndo atrás do jogador!`);
    }

    followPath(delta: number) {
        const targetYuka = this.path.current(); // Obtém o próximo ponto do caminho
        if (!targetYuka) return; // Se não houver pontos, sai da função

        // Converter target de YUKA.Vector3 para THREE.Vector3
        const target = new THREE.Vector3(targetYuka.x, targetYuka.y, targetYuka.z);

        // Criar uma cópia da posição atual do NPC e interpolar
        const pos = this.mesh.position.clone().lerp(target, delta * this.speed * 0.1);

        if (pos.distanceTo(target) < 0.5) {
            this.path.advance(); // Avança para o próximo ponto
        }

        this.mesh.position.copy(pos); // Atualiza a posição no Three.js
        this.position.set(pos.x, pos.y, pos.z); // Atualiza a posição no YUKA
    }

    override update(delta: number): this {
        super.update(delta);
        this.stateMachine.update(delta);
        return this;
    }
}
