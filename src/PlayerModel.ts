import {
    AnimationAction,
    AnimationMixer,
    BoxGeometry,
    CylinderGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    Quaternion,
    RingGeometry,
    SpotLight,
    SphereGeometry,
    Vector3,
} from 'three'
import Loading from './Loading'
import { colliders } from './Colliders'


export default class PlayerModel extends Group {

    loading: Loading
    mixer?: AnimationMixer
    animationsAction: { [key: string]: AnimationAction } = {}
    socketId?: string
    activedClip?: AnimationAction
    ring?: Mesh
    isVisibleIndicator = false
    model?: Object3D

    // ── Drone ──────────────────────────────────────────────────────────────
    IsDroneActive        = false
    droneGroup           = new Group()
    droneLight           = new SpotLight(0xffffff, 0, 20)
    private droneHoverHeight = 3.2
    private droneFloatTimer  = 0
    private droneCurrentPos  = new Vector3()   // reutilizado todo frame
    private droneTarget      = new Vector3()   // reutilizado todo frame — zero alloc
    private droneFollowSpeed = 4.5

    isGuest: boolean
    isLoadedModel: Promise<void>
    identity?: string
    urlAvatar: string

    // ── Cache de objetos buscados por nome ─────────────────────────────────
    // getObjectByName() é O(n) recursivo — guardamos a referência na 1ª vez
    private hipsNode?: Object3D
    private ringTimer = 0   // acumulador de tempo para o anel (evita Date.now())

    constructor(loading: Loading, isGuest = true, urlAvatar: string, identity?: string) {
        super()
        this.loading   = loading
        this.urlAvatar = urlAvatar || "models/teacher_npc.glb"
        this.isGuest   = isGuest
        this.identity  = identity
        this.isLoadedModel = this.loadModel()
        this.showAnelIndicator(this.isVisibleIndicator)
        this.setupDrone()
    }

    // ── Carrega o modelo do personagem ──────────────────────────────────────

    async loadModel() {
        return await new Promise<void>((resolve) => {
            this.loading.loader.load(this.urlAvatar, async (model) => {
                this.model = model.scene
                this.add(this.model)
                this.scale.set(1, 1, 1)

                this.mixer = new AnimationMixer(model.scene)

                for (let animationKey in this.loading.globalAnimations) {
                    this.animationsAction[animationKey] = this.mixer.clipAction(
                        this.loading.globalAnimations[animationKey]
                    )
                }

                this.animationsAction["Idle"].play()

                if (this.isGuest) {
                    this.identity && (this.model.name = `guest.${this.identity}`)
                    colliders.push(this.model)
                }

                // Cache do Hips — evita getObjectByName() toda frame
                this.hipsNode = this.model.getObjectByName("Hips")

                resolve()
            })
        })
    }

    // ── Anel indicador ──────────────────────────────────────────────────────

    showAnelIndicator(visible: boolean) {
        this.isVisibleIndicator = visible

        const ringGeometry = new RingGeometry(1.2, 1.5, 32)
        const ringMaterial = new MeshBasicMaterial({
            color:       0x00ff00,
            transparent: true,
            opacity:     0.3,
            side:        DoubleSide,
            visible:     this.isVisibleIndicator,
        })

        this.ring = new Mesh(ringGeometry, ringMaterial)
        this.ring.rotation.x = -Math.PI / 2
        this.ring.position.y = 0.5
        this.add(this.ring)
    }

    private animateRing(delta: number) {
        this.ringTimer += delta
        const scale = 1 + 0.1 * Math.sin(this.ringTimer * 3)
        this.ring?.scale.set(scale, scale, scale)
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

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
                        this.activedClip?.fadeOut(0)
                        action.reset().play()
                        break
                    default:
                        if (this.activedClip == this.animationsAction["Sitting"]) {
                            this.activedClip?.fadeOut(0)
                        } else {
                            this.activedClip?.fadeOut(0.2)
                        }
                        action?.reset().fadeIn(0.1).play()
                }
                this.activedClip = action
            }
        }
    }

    // ── Drone ───────────────────────────────────────────────────────────────

    private setupDrone() {

        // ── Corpo central ─────────────────────────────────────────────────
        const bodyMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.8 })
        const body    = new Mesh(new BoxGeometry(0.28, 0.07, 0.28), bodyMat)
        this.droneGroup.add(body)

        // ── 4 braços diagonais ────────────────────────────────────────────
        const armMat    = new MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.6 })
        const armAngles = [Math.PI / 4, -Math.PI / 4, Math.PI * 3 / 4, -Math.PI * 3 / 4]
        armAngles.forEach(angle => {
            const arm = new Mesh(new BoxGeometry(0.22, 0.03, 0.05), armMat)
            arm.rotation.y = angle
            arm.position.set(Math.cos(angle) * 0.14, 0, Math.sin(angle) * 0.14)
            this.droneGroup.add(arm)
        })

        // ── 4 hélices (índices 5–8) ───────────────────────────────────────
        const propMat     = new MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.9, transparent: true, opacity: 0.75 })
        const propOffsets = [
            new Vector3( 0.22, 0.025,  0.22),
            new Vector3(-0.22, 0.025,  0.22),
            new Vector3( 0.22, 0.025, -0.22),
            new Vector3(-0.22, 0.025, -0.22),
        ]
        propOffsets.forEach(offset => {
            const prop = new Mesh(new CylinderGeometry(0.1, 0.1, 0.01, 12), propMat)
            prop.position.copy(offset)
            this.droneGroup.add(prop)
        })

        // ── 4 LEDs (índices 9–12) ─────────────────────────────────────────
        const ledColors = [0xff2200, 0xff2200, 0x00ff88, 0x00ff88]
        propOffsets.forEach((offset, i) => {
            const ledMat = new MeshStandardMaterial({ color: ledColors[i], emissive: ledColors[i], emissiveIntensity: 2 })
            const led    = new Mesh(new SphereGeometry(0.018, 6, 6), ledMat)
            led.position.copy(offset).add(new Vector3(0, 0.02, 0))
            this.droneGroup.add(led)
        })

        // ── Holofote embaixo (índice 13) ──────────────────────────────────
        const lampMat = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5, transparent: true, opacity: 0.9 })
        const lamp    = new Mesh(new CylinderGeometry(0.04, 0.04, 0.08, 8), lampMat)
        lamp.position.set(0, -0.07, 0)
        this.droneGroup.add(lamp)

        // ── SpotLight apontando para baixo ────────────────────────────────
        this.droneLight.angle                 = Math.PI / 7
        this.droneLight.penumbra              = 0.35
        this.droneLight.decay                 = 1.2
        this.droneLight.distance              = 12
        this.droneLight.intensity             = 0
        this.droneLight.castShadow            = true
        this.droneLight.shadow.mapSize.width  = 512
        this.droneLight.shadow.mapSize.height = 512

        this.droneGroup.add(this.droneLight)
        this.droneLight.position.set(0, 0, 0)

        const lightTarget = new Object3D()
        lightTarget.position.set(0, -3, 0)
        this.droneGroup.add(lightTarget)
        this.droneLight.target = lightTarget

        this.droneGroup.visible = false
    }

    toggleDrone(isOn: boolean) {
        this.IsDroneActive        = isOn
        this.droneGroup.visible   = isOn
        this.droneLight.intensity = isOn ? 8 : 0

        if (isOn) {
            // Inicializa posição acima do player — evita "voo" desde a origem
            this.getWorldPosition(this.droneCurrentPos)
            this.droneCurrentPos.y += this.droneHoverHeight
            this.droneGroup.position.copy(this.droneCurrentPos)
        }
    }

    /**
     * Lerp suave em world space + flutuação senoidal.
     * playerWorldPos é passado externamente — sem getWorldPosition() aqui.
     * droneTarget e droneCurrentPos são campos reutilizados — zero alloc por frame.
     */
    updateDrone(delta: number, playerWorldPos: Vector3) {
        if (!this.IsDroneActive) return

        this.droneFloatTimer += delta

        const t = this.droneFloatTimer
        this.droneTarget.set(
            playerWorldPos.x + Math.sin(t * 0.7) * 0.07,
            playerWorldPos.y + this.droneHoverHeight + Math.sin(t * 2.0) * 0.12,
            playerWorldPos.z + Math.cos(t * 0.5) * 0.07
        )

        // exp-decay lerp: framerate-independent, sem overshoot
        const alpha = 1 - Math.exp(-this.droneFollowSpeed * delta)
        this.droneCurrentPos.lerp(this.droneTarget, alpha)
        this.droneGroup.position.copy(this.droneCurrentPos)

        // Rotação do corpo
        this.droneGroup.rotation.y += delta * 0.4

        // Hélices (índices 5–8)
        for (let i = 5; i <= 8; i++) {
            const child = this.droneGroup.children[i]
            if (child) child.rotation.y += delta * 25
        }
    }

    // ── Update principal ────────────────────────────────────────────────────

    update(delta: number) {
        this.mixer?.update(delta)

        // hipsNode é cacheado em loadModel() — sem busca recursiva por frame
        const anims = this.hipsNode
        if (anims) {
            anims.position.x = 0
            anims.position.z = 0

            if (this.activedClip == this.animationsAction["Sitting"]) {
                anims.rotation.x = 0
                anims.position.y += 0.5
            }
        }

        if (this.isVisibleIndicator)
            this.animateRing(delta)
    }
}