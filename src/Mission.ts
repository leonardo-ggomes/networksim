import {
    CanvasTexture,
    Group,
    Object3D,
    PerspectiveCamera,
    Scene,
    Sprite,
    SpriteMaterial,
    Vector3,
} from "three";
import elementos, { eventEmitter } from "./Actions";
import { infoPlayer } from "./InfoPlayer";
import Loading from "./Loading";

// ─────────────────────────────────────────────────────────────────────────────
// Marcador de missão — sprite flutuante com distância
//
//   • Canvas 2D renderiza ícone ◆ + título + "Xm"
//   • Sprite sempre virado para a câmera (sizeAttenuation)
//   • Sem geometria no chão — 1 draw call
//   • tickMarker(delta, playerPos, camera) atualiza a distância
// ─────────────────────────────────────────────────────────────────────────────

const W = 320   // largura do canvas (px)
const H = 112   // altura do canvas (px)

export default class Mission {

    local:         Vector3
    missionPoint:  Group
    title:         string
    isCollided     = false
    listeners:     [string, EventListener][] = []
    eventEmitter:  EventTarget
    reward:        number
    isComplete:    boolean
    helper:        boolean
    loading:       Loading

    private _sprite:    Sprite | null = null
    private _canvas:    HTMLCanvasElement | null = null
    private _ctx:       CanvasRenderingContext2D | null = null
    private _tex:       CanvasTexture | null = null
    private _markerTime = 0

    constructor(
        title: string,
        position: Vector3,
        scene: Scene,
        event: EventTarget,
        reward: number,
        helper: boolean,
        loading: Loading
    ) {
        this.loading      = loading
        this.isComplete   = false
        this.eventEmitter = event
        this.reward       = reward
        this.title        = title
        this.local        = position
        this.helper       = helper

        this.missionPoint = this._buildMarker(position)
        scene.add(this.missionPoint)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constrói o sprite — canvas reutilizável, redesenhado a cada frame
    // ─────────────────────────────────────────────────────────────────────────
    private _buildMarker(position: Vector3): Group {
        const group = new Group()
        group.position.copy(position)

        const cv  = document.createElement('canvas')
        cv.width  = W
        cv.height = H
        const ctx = cv.getContext('2d')!
        const tex = new CanvasTexture(cv)

        this._canvas = cv
        this._ctx    = ctx
        this._tex    = tex

        this._drawSprite('--')

        const mat    = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
        const sprite = new Sprite(mat)

        // Escala world-space: W/H mantém proporção do canvas
        sprite.scale.set(1.1, 1.1 * (H / W), 1)
        sprite.position.y = 1.8   // flutua ~1.6m acima do chão
        sprite.name = "waypoint"
        group.add(sprite)

        this._sprite = sprite
        return group
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Desenha o canvas: ◆ + título + distância
    // ─────────────────────────────────────────────────────────────────────────
    private _drawSprite(dist: string, pulse = 1.0) {
        const ctx = this._ctx!
        ctx.clearRect(0, 0, W, H)

        // ── ◆ losango central ─────────────────────────────────────────────
        const cx = W / 2
        const cy = 28
        const S  = 14 * pulse   // tamanho pulsa com a animação

        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(Math.PI / 4)
        ctx.shadowColor = '#00cfff'
        ctx.shadowBlur  = 16 * pulse
        ctx.strokeStyle = `rgba(0,207,255,${0.6 + pulse * 0.4})`
        ctx.fillStyle   = `rgba(0,207,255,${0.12 * pulse})`
        ctx.lineWidth   = 2
        ctx.beginPath()
        ctx.rect(-S / 2, -S / 2, S, S)
        ctx.fill()
        ctx.stroke()
        ctx.restore()

        // ── Título ────────────────────────────────────────────────────────
        ctx.font         = '13px "Share Tech Mono", monospace'
        ctx.textAlign    = 'center'
        ctx.fillStyle    = `rgba(0,207,255,0.65)`
        ctx.shadowColor  = '#00cfff'
        ctx.shadowBlur   = 6
        ctx.fillText(this.title.toUpperCase(), cx, 58)

        // ── Distância ─────────────────────────────────────────────────────
        ctx.font        = 'bold 18px "Share Tech Mono", monospace'
        ctx.fillStyle   = `rgba(255,255,255,${0.7 + pulse * 0.3})`
        ctx.shadowBlur  = 10 * pulse
        ctx.fillText(dist, cx, 82)

        this._tex!.needsUpdate = true
    }

    // ─────────────────────────────────────────────────────────────────────────
    // tickMarker — chame no game loop:
    //   mission.tickMarker(delta, player.position, camera)
    // ─────────────────────────────────────────────────────────────────────────
    tickMarker(delta: number, playerPos?: Vector3) {
        if (this.isComplete || !this._sprite) return

        this._markerTime += delta
        const t = this._markerTime

        // Flutuação vertical suave
        this._sprite.position.y = 1.8 + Math.sin(t * 1.8) * 0.07

        // Pulso de escala (0.92 → 1.08)
        const pulse = 0.92 + Math.abs(Math.sin(t * 1.4)) * 0.16
        const BASE  = 2
        this._sprite.scale.set(BASE * pulse, BASE * pulse * (H / W), 1)

        // Distância formatada
        let distStr = '--'
        if (playerPos) {
            const d = playerPos.distanceTo(this.local)
            distStr = d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`
        }

        // Redesenha canvas com nova distância e pulso
        this._drawSprite(distStr, pulse)

        // Fade quando o player entra na zona
        const mat = this._sprite.material as SpriteMaterial
        mat.opacity = this.isCollided ? 0.3 : 1.0
    }

    // ─────────────────────────────────────────────────────────────────────────

    removeMissionPoint(object: Object3D, scene: Scene) {
        scene.remove(object)
        this._cleanup()
    }

    private _cleanup() {
        this._tex?.dispose()
        this._tex    = null
        this._canvas = null
        this._ctx    = null
        this._sprite = null
    }

    checkMissionZone(player: Vector3, ring: Vector3, radius: number) {
        if (!this.isComplete) {
            this.isCollided = player.distanceTo(ring) < radius
            elementos.setIsCollided(this.isCollided)
            if (this.isCollided) {
                eventEmitter.dispatchEvent(new CustomEvent("collided", {
                    detail: { collided: true }
                }))
            }
        } else {
            elementos.setIsCollided(false)
        }
    }

    addGameListener(event: string, callback: EventListener, isOnce: boolean) {
        this.eventEmitter.addEventListener(event, callback, { once: isOnce })
        this.listeners.push([event, callback])
    }

    removeEvent(eventName: string, callback: EventListener) {
        this.eventEmitter.removeEventListener(eventName, callback)
    }

    clearAllListeners() {
        this.listeners.forEach(([e, cb]) => this.eventEmitter.removeEventListener(e, cb))
        this.listeners.length = 0
    }

    rewardPlayer() { infoPlayer.energy += this.reward }

    finished() {
        this.isComplete = true
        // Esconde o sprite imediatamente ao completar
        if (this._sprite) (this._sprite.material as SpriteMaterial).opacity = 0
    }

    async addObject(position: Vector3, scale: number, name: string, scene: Scene) {
        const obj = await this.loading.loader.loadAsync(`models/${name}.glb`)
        obj.scene.position.copy(position)
        obj.scene.scale.set(scale, scale, scale)
        scene.add(obj.scene)
    }
}