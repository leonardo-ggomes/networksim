import { Vector3 } from 'three';
import { NPC } from './NPC';

// Definição da interface para os estados
export interface State {
    enter(owner: NPC): void;
    execute(owner: NPC, delta: number): void;
    exit(owner: NPC): void;
}

// Implementação da Máquina de Estados
export class StateMachine {
    private currentState: State;
    private owner: NPC;
    states = {
        lookAt: new LookAtPlayerState(),
        idle: new IdleState(),
        chase: new ChaseState(),
        walk: new WalkState()
    }

    constructor(owner: NPC) {
        this.currentState = new IdleState();
        this.owner = owner;
    }

    changeState(newState: State) {
        if (this.currentState) {
            this.currentState.exit(this.owner);
        }
        this.currentState = newState;
        this.currentState.enter(this.owner);
    }

    update(delta: number) {
        if (this.currentState) {
            this.currentState.execute(this.owner, delta);
        }

        if(this.owner.player && this.owner.npcMesh)
        {
            const distance = this.owner.npcMesh.position.distanceTo(this.owner.player.position);

            if(distance < 5)
            {
                if (!(this.currentState instanceof LookAtPlayerState)) {
                    this.changeState(this.states['lookAt']);
                }
            }
            else {
                if (this.currentState instanceof LookAtPlayerState) {
                    this.changeState(this.states['walk']);
                }
            }
        }
       
    }
}

export class IdleState implements State {
    enter(owner: NPC) {
        console.log(`${owner.name} está parado`);
    }

    execute(owner: NPC) {
        owner.playAnimation("Idle")
    }

    exit(owner: NPC) {
        console.log(`${owner.name} Não está mais parado`);
    }
}



export class WalkState implements State {
    enter(owner: NPC) {
        console.log(`${owner.name} entrou no estado de patrulha.`);
        owner.setSpeed(1);
    }

    execute(owner: NPC, delta: number) {
        owner.followPath(delta);
        owner.playAnimation("Walking")
    }

    exit(owner: NPC) {
        console.log(`${owner.name} saiu do estado de patrulha.`);
    }
}

export class ChaseState implements State {
    enter(owner: NPC) {
        console.log(`${owner.name} está perseguindo o jogador.`);
        owner.setSpeed(3);
    }

    execute(owner: NPC, delta: number) {
        owner.playAnimation("Running");
        owner.chasePlayer(delta);
    }

    exit(owner: NPC) {
        console.log(`${owner.name} parou de perseguir o jogador.`);
   
        owner.playAnimation("Idle");
        owner.setSpeed(0);
    }
}


export class LookAtPlayerState implements State {
    enter(owner: NPC) {
        console.log(`${owner.name} parou e está olhando para o jogador.`);
        owner.playAnimation("Idle");
        owner.setSpeed(0); 
    }

    execute(owner: NPC) {
        if (owner.player) { // Se o jogador existir
            const direction = new Vector3().subVectors(owner.player.position, owner.npcMesh!.position).normalize();
            
            const lookAtTarget = owner.npcMesh!.position.clone().add(direction);
            owner.npcMesh!.lookAt(lookAtTarget);
        }
    }

    exit(owner: NPC) {
        console.log(`${owner.name} parou de olhar para o jogador.`);
    }
}

