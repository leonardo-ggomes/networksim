import { AnimationAction, AnimationClip, AnimationMixer, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, PointLight, Quaternion, RingGeometry, SkinnedMesh, SpotLight, Vector3 } from 'three'
import Loading from './Loading'
import { colliders } from './Colliders'
import { gui } from './GuiControl'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';


export default class PlayerModel extends Group {

    loading: Loading
    mixer?: AnimationMixer
    animationsAction: { [key: string]: AnimationAction } = {}
    socketId?: string
    activedClip?: AnimationAction
    ring?: Mesh
    isVisibleIndicator = false
    model?: Object3D

    IsTurnOnFlashlight = false;
    lanternLight = new SpotLight(0xF4F8FF, 0, 10)
    pointLight = new PointLight(0xF4F8FF, 0, 5);
    directionlanternLight = new Vector3();
    handObject: Object3D = new Object3D()
    isGuest: boolean

    isLoadedModel: Promise<void>
    identity?: string
    urlAvatar: string

    constructor(loading: Loading, isGuest = true,  urlAvatar: string, identity?: string) {
        super()
        this.loading = loading
        this.urlAvatar = urlAvatar || "models/asian_male_animated_v2.glb"
        this.isGuest = isGuest
        this.identity = identity
        this.isLoadedModel = this.loadModel()
        this.showAnelIndicator(this.isVisibleIndicator)
        
        this.setFlashlight()
    }

    async loadModel() {
        return await new Promise<void>((resolve) => {
            this.loading.loader.load(this.urlAvatar, async (model) => {
                this.model = model.scene
                this.add(this.model)
                this.scale.set(1, 1, 1)

                const [
                    walk,
                    waving,
                    idle, 
                    running,
                    sitting, 
                    crouch, 
                    crouchIdle, 
                    backward, 
                    crouchBack, 
                    crouchRun,
                    walkCrouchRight,
                    walkCrouchLeft,
                    walkRight,
                    walkLeft
                ] = await Promise.all(
                    [
                        this.loading.loader.loadAsync("models/M_Walk_001.glb"),
                        this.loading.loader.loadAsync("models/M_Dances_011.glb"),
                        this.loading.loader.loadAsync("models/M_Standing_Idle_001.glb"),
                        this.loading.loader.loadAsync("models/M_Run_001.glb"),

                        this.loading.loader.loadAsync("models/M_Sitting.glb"),
                        this.loading.loader.loadAsync("models/asian_male_animated@crounch_flashlight.glb"),
                        this.loading.loader.loadAsync("models/M_Standing_Idle_01.glb"),
                        this.loading.loader.loadAsync("models/M_Walk_Backwards_001.glb"),
                        this.loading.loader.loadAsync("models/asian_male_animated@crouch_back.glb"),
                        this.loading.loader.loadAsync("models/asian_male_animated@crouch_run.glb"),
                        this.loading.loader.loadAsync("models/asian_male_animated@crouch_walk_right.glb"),
                        this.loading.loader.loadAsync("models/asian_male_animated@crouch_walk_left.glb"),
                        this.loading.loader.loadAsync("models/M_Walk_Strafe_Right_002.glb"),
                        this.loading.loader.loadAsync("models/M_Walk_Strafe_Left_002.glb"),
                    ]
                )

                sitting.scene.name = "sitting"

                //Animação
                this.mixer = new AnimationMixer(model.scene)                
                
                this.animationsAction["Waving"] = this.mixer.clipAction(waving.animations[0])

                this.animationsAction["Idle"] = this.mixer.clipAction(idle.animations[0])
                this.animationsAction["Walk"] = this.mixer.clipAction(walk.animations[0])
                this.animationsAction["Running"] = this.mixer.clipAction(running.animations[0])

                this.animationsAction["Sitting"] = this.mixer.clipAction(sitting.animations[0])
                this.animationsAction["Crouch"] = this.mixer.clipAction(crouch.animations[0])
                this.animationsAction["CrouchIdle"] = this.mixer.clipAction(crouchIdle.animations[0])
                this.animationsAction["Backward"] = this.mixer.clipAction(backward.animations[0])
                this.animationsAction["CrouchBack"] = this.mixer.clipAction(crouchBack.animations[0])
                this.animationsAction["CrouchRun"] = this.mixer.clipAction(crouchRun.animations[0])
                this.animationsAction["CrouchRight"] = this.mixer.clipAction(walkCrouchRight.animations[0])
                this.animationsAction["CrouchLeft"] = this.mixer.clipAction(walkCrouchLeft.animations[0])
                this.animationsAction["WalkRight"] = this.mixer.clipAction(walkRight.animations[0])
                this.animationsAction["WalkLeft"] = this.mixer.clipAction(walkLeft.animations[0])
                
                this.animationsAction["Idle"].play()
        
                if(this.isGuest)
                {
                    this.identity && (this.model.name = `guest.${this.identity}`)
                    colliders.push(this.model)
                }

                resolve()
            })
        })
    }

    showAnelIndicator(visible: boolean) {

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



        this.ring?.scale.set(scale, scale, scale);// Aplicando escala
        //this.ring?.material.opacity = opacity; // Aplicando opacidade
    }

    setPosition(newPosition: Vector3) {
        this.position.copy(newPosition)
    }

    setQuaternion(newQuaternion: Quaternion) {
        this.quaternion.copy(newQuaternion)
    }

    setAnimation(action?: AnimationAction) {
        if (action != this.activedClip) {
            if (action) {
                switch (action) {
                    case this.animationsAction["Sitting"]:
                        this.activedClip?.fadeOut(0);
                        action.reset().play();
                        break;
                    default:

                        if (this.activedClip == this.animationsAction["Sitting"]) {
                            this.activedClip?.fadeOut(0);
                        }
                        else {
                            this.activedClip?.fadeOut(0.2);
                        }

                        action?.reset().fadeIn(0.1).play();
                }
                this.activedClip = action;
            }

        }
    }

    setFlashlight() {
        this.lanternLight.angle = Math.PI / 4; // Ângulo do feixe
        this.lanternLight.penumbra = 0.4; // Suavização da borda da luz
        this.lanternLight.decay = .5; // Diminuição da intensidade com a distância
        this.lanternLight.distance = 10; // Alcance da luz
        this.lanternLight.castShadow = true; // Ativar sombras

        //this.lanternLight.add(this.pointLight); //Vicula o feixe ao ponto de luz

        this.lanternLight.position.set(
            this.position.x,  // Posição X do jogador
            this.position.y + 1.5,  // Um pouco acima da cabeça do jogador (ajuste a altura conforme necessário)
            this.position.z + .7  // Posição Z do jogador
        )


        this.isLoadedModel.then(async () => {
            let gltf = await this.loading.loader.loadAsync("models/iphone.glb")
            
            this.handObject = gltf.scene
            this.handObject.rotation.y = Math.PI / 2
            let handBone = this.model?.getObjectByName("mixamorigLeftHand")
            
            if (handBone) {

                this.handObject.position.set(0, 0, 0);
                this.handObject.rotation.set(0, 0, 0);
                //this.handObject.scale.set(.08, .08, .08)

                handBone.attach(this.handObject)
                this.handObject.position.set(3.9, 8.1, 3.2);  // Alinhar na palma da mão
                this.handObject.rotation.set(
                    1.28805298797182,
                    2.90911479722415,
                    -1.33831847042925
                );       

                // const f = gui.addFolder("Celular")

                // f .add(this.handObject.rotation,"x", -Math.PI, Math.PI)
                // f .add(this.handObject.rotation,"y", -Math.PI, Math.PI)
                // f .add(this.handObject.rotation,"z", -Math.PI, Math.PI)
                
                this.handObject.add(this.lanternLight)
                this.handObject.visible = false
            }
        })

        
    }

    turnFlashlight(isOn: boolean) {
        this.IsTurnOnFlashlight = isOn
        if (this.IsTurnOnFlashlight) {
            this.handObject.visible = true
            this.lanternLight.intensity = 6; // Liga a luz 
            this.pointLight.intensity = 0.5;
        } else {
            this.handObject.visible = false
            this.lanternLight.intensity = 0; // Desliga a luz 
            this.pointLight.intensity = 0;
        }
    }

    updateFlashlight() {

        if (this.IsTurnOnFlashlight) {
            // Obtém a direção para onde o jogador está olhando
            this.getWorldDirection(this.directionlanternLight);

            // Posição do target (5 unidades à frente do jogador)
            const targetPosition = this.position.clone().add(this.directionlanternLight.multiplyScalar(4));

            // Atualiza o target na cena
            this.lanternLight.target.position.copy(targetPosition);
            this.lanternLight.target.updateMatrixWorld(); // Atualiza a matriz do mundo

            // Ajusta a rotação da lanterna para que ela olhe para a direção correta
            this.lanternLight.rotation.set(0, 0, 0);  // Resetando rotação, pode ser necessário
            this.lanternLight.lookAt(targetPosition); // Faz a lanterna olhar para o target
        }
    }


    update(delta: number) {
        this.mixer?.update(delta)
        this.updateFlashlight()

        const anims = this.model?.getObjectByName("Hips")
    
        if(anims)
        {
          anims.position.set(0, anims.position.y, 0)
        }

        if (this.isVisibleIndicator)
            this.animateRing()
    }

}