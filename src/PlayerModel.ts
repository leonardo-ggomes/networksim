import { AnimationAction, AnimationMixer, DoubleSide, Group, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, Vector3 } from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export default class PlayerModel extends Group{

    mixer?: AnimationMixer
    gltfLoader = new GLTFLoader()    
    animationsAction: { [key: string]: AnimationAction } = {}
    socketId?: string
    activedClip?: AnimationAction
    ring?: Mesh
    isVisibleIndicator = true

    constructor()
    {
        super()
        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath("draco/")
        this.gltfLoader.setDRACOLoader(dracoLoader) 

        this.loadModel()
        this.showAnelIndicator(this.isVisibleIndicator)
    }

    loadModel(){
        this.gltfLoader.load("models/asian_male_animated.glb", async (model) => {    
            this.add(model.scene)

            this.scale.set(1,1,1)

            const [sitting] = await Promise.all(
                [
                    this.gltfLoader.loadAsync("models/asian_male_animated@sitting.glb")
                ]
            )
  
            this.mixer = new AnimationMixer(model.scene)
       
            this.animationsAction["Idle"] = this.mixer.clipAction(model.animations[1])
            this.animationsAction["Running"] = this.mixer.clipAction(model.animations[3])
            this.animationsAction["Walk"] = this.mixer.clipAction(model.animations[4])
            this.animationsAction["Waving"] = this.mixer.clipAction(model.animations[5])
            this.animationsAction["Sitting"] = this.mixer.clipAction(sitting.animations[0])
            this.animationsAction["Idle"].play()   
        })
    }


    showAnelIndicator(visible: boolean){

        this.isVisibleIndicator = visible

        // Criando um anel (halo embaixo do personagem)
        const ringGeometry = new RingGeometry(1.2, 1.5, 32); // Raio interno 1.2, externo 1.5
        const ringMaterial = new MeshBasicMaterial({
            color: 0x00ff00, // Verde brilhante
            transparent: true,
            opacity: 0.3,
            side: DoubleSide, // Visível de ambos os lados
            visible: this.isVisibleIndicator
        });

        // Criando o mesh do anel
        this.ring = new Mesh(ringGeometry, ringMaterial);

        // Posicionando abaixo do jogador
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.y = 0.5;

        this.add(this.ring)
    }

    // Função para animar o anel (efeito de pulso)
    animateRing() {
        const time = Date.now() * 0.003; // Tempo contínuo
        const scale = 1 + 0.1 * Math.sin(time); // Escala oscilando entre 1.0 e 1.1
        //const opacity = 0.5 + 0.3 * Math.sin(time); // Opacidade variando entre 0.5 e 0.8



        this.ring?.scale.set(scale, scale,scale);// Aplicando escala
        //this.ring?.material.opacity = opacity; // Aplicando opacidade
    }


    setPosition(newPosition: Vector3){
        this.position.copy(newPosition)
    }

    setQuaternion(newQuaternion: Quaternion){        
        this.quaternion.copy(newQuaternion)
    }

    setAnimation(action?: AnimationAction) {
        if (action != this.activedClip) {            
            if(action){
                switch(action){
                    case this.animationsAction["Sitting"]:
                      this.activedClip?.fadeOut(0);
                      action.reset().play();
                      break;
                    default:
            
                      if(this.activedClip == this.animationsAction["Sitting"]){
                        this.activedClip?.fadeOut(0);
                      }
                      else{
                        this.activedClip?.fadeOut(0.2);
                      }
                      
                      action?.reset().fadeIn(0.1).play();
                  }
                  this.activedClip = action;      
            }

          }
    }

    update(delta: number){
        this.mixer?.update(delta)

        if(this.isVisibleIndicator)
            this.animateRing()
        
       
    }

}