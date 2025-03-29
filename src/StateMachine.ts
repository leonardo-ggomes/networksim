import { NPC } from './NPC';

// Definição da interface para os estados
export interface State {
    enter(owner: NPC): void;
    execute(owner: NPC, delta: number): void;
    exit(owner: NPC): void;
}

// Implementação da Máquina de Estados
export class StateMachine {
    private currentState!: State;
    private owner: NPC;

    constructor(owner: NPC) {
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
    }
}

export class WalkState implements State {
    enter(owner: NPC) {
        console.log(`${owner.name} entrou no estado de patrulha.`);
        owner.setSpeed(1);
    }

    execute(owner: NPC, delta: number) {
        owner.moveAlongPath(delta);
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
        owner.chasePlayer(delta);
    }

    exit(owner: NPC) {
        console.log(`${owner.name} parou de perseguir o jogador.`);
    }
}


