/**
 * Path.ts — Caminhos nomeados para NPCs + debug visual 3D
 *
 * ── DEBUG (console do browser) ────────────────────────────────────────────────
 *
 *   __pathDebug.show("teacher-to-stage")   // desenha 1 caminho
 *   __pathDebug.showAll()                  // desenha todos
 *   __pathDebug.hide()                     // remove da cena
 *
 * ── COMO AJUSTAR PONTOS ───────────────────────────────────────────────────────
 *
 *   1. Rode __pathDebug.showAll() no browser
 *   2. 🟢 Verde = início | 🔴 Vermelho = fim | cor do caminho = intermediários
 *   3. Labels mostram nome[índice] + coordenadas (x, y, z)
 *   4. Ajuste os Vector3 aqui, salve, recarregue, repita
 *
 * ── ESCADAS ───────────────────────────────────────────────────────────────────
 *
 *   Suba o Y gradualmente nos waypoints sobre os degraus:
 *
 *   new YUKA.Vector3(-5, 0.0, 10),   // chão antes da escada
 *   new YUKA.Vector3(-5, 0.5,  9),   // degrau 1
 *   new YUKA.Vector3(-5, 1.0,  8),   // degrau 2
 *   new YUKA.Vector3(-5, 1.5,  7),   // topo
 */

import * as YUKA from 'yuka'
import {
    Scene, Mesh, SphereGeometry, MeshBasicMaterial,
    BufferGeometry, LineBasicMaterial, Line,
    Vector3, Group
} from 'three'

// ─────────────────────────────────────────────────────────────────────────────
// Tipo de definição de caminho
// ─────────────────────────────────────────────────────────────────────────────

export type PathDef = {
    points:      YUKA.Vector3[]
    loop?:       boolean    // true = último ponto volta ao primeiro (patrulha)
    description: string     // texto exibido no console do debug
    color?:      string     // cor hex das esferas/linhas (default: #00ff9d)
}

// ─────────────────────────────────────────────────────────────────────────────
// Definição de todos os caminhos do jogo
// Edite aqui para ajustar rotas sem tocar em NPC.ts ou TeacherNPC.ts
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Utilitário: interpola pontos extras entre waypoints para movimento fluido.
// `steps` = quantos pontos intermediários inserir entre cada par de waypoints.
// ─────────────────────────────────────────────────────────────────────────────
function interpolatePath(points: YUKA.Vector3[], steps = 4): YUKA.Vector3[] {
    if (points.length < 2) return points;
    const result: YUKA.Vector3[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        result.push(new YUKA.Vector3(a.x, a.y, a.z));
        for (let s = 1; s < steps; s++) {
            const t = s / steps;
            result.push(new YUKA.Vector3(
                a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                a.z + (b.z - a.z) * t,
            ));
        }
    }
    result.push(points[points.length - 1].clone());
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitário: gera o caminho inverso automaticamente.
// Usado para "teacher-to-idle" — evita duplicar e manter dois arrays em sync.
// ─────────────────────────────────────────────────────────────────────────────
function reversePath(points: YUKA.Vector3[]): YUKA.Vector3[] {
    return [...points].reverse().map(p => new YUKA.Vector3(p.x, p.y, p.z));
}

// ── Waypoints base (sem interpolação) — edite apenas estes ───────────────────
// Depois de ajustar, rode __pathDebug.showAll() para visualizar na cena.
const STAGE_WAYPOINTS: YUKA.Vector3[] = [
    new YUKA.Vector3(-15, 0, 25),   // IDLE_POS — ponto de espera
    new YUKA.Vector3(-15, 0, 15),   // desvio pelo corredor esquerdo
    new YUKA.Vector3(-10, 0,  8),   // aproximando do corredor central
    new YUKA.Vector3( 5, 0,  3),   // entrada do palco
    new YUKA.Vector3( 0, .5,  0),   // STAGE_POS — palco
    new YUKA.Vector3( 0, 1,  0),   // STAGE_POS — palco
];

export const pathDefs: Record<string, PathDef> = {

    // ── Patrulha do NPC segurança (loop) ─────────────────────────────────────
    "patrol": {
        description: "Patrulha lateral — NPC segurança",
        loop:  true,
        color: "#ff3c3c",
        points: interpolatePath([
            new YUKA.Vector3(10, 0,  5),
            new YUKA.Vector3(10, 0, 10),
            new YUKA.Vector3(10, 0, 15),
            new YUKA.Vector3(10, 0, 20),
            new YUKA.Vector3(10, 0, 25),
            new YUKA.Vector3(10, 0, 30),
        ], 3),
    },

    // ── Prof. Chico: espera → palco ───────────────────────────────────────────
    // Edite STAGE_WAYPOINTS acima para ajustar o trajeto.
    // "teacher-to-idle" é gerado automaticamente como o reverso deste caminho.
    "teacher-to-stage": {
        description: "Prof. Chico: espera (-5,0,25) → palco (0,0,0)",
        color: "#f0b90b",
        points: interpolatePath(STAGE_WAYPOINTS, 4),
    },

    // ── Prof. Chico: palco → espera (reverso automático) ─────────────────────
    // NÃO edite este — edite STAGE_WAYPOINTS acima.
    "teacher-to-idle": {
        description: "Prof. Chico: palco (0,0,0) → espera (-5,0,25)",
        color: "#00cfff",
        points: interpolatePath(reversePath(STAGE_WAYPOINTS), 4),
    },

    // ── Exemplo com escada: Y cresce gradualmente nos degraus ────────────────
    // Ajuste X/Y/Z conforme a geometria real da escada no seu mapa.
    // Use __pathDebug.show("teacher-upstairs") para ver onde os pontos caem.
    "teacher-upstairs": {
        description: "Prof. Chico sobe escada até andar superior",
        color: "#b06aff",
        points: interpolatePath([
            new YUKA.Vector3( 0, 0.0,  0),  // base da escada
            new YUKA.Vector3( 1, 0.4, -1),  // degrau 1
            new YUKA.Vector3( 2, 0.8, -2),  // degrau 2
            new YUKA.Vector3( 3, 1.2, -3),  // degrau 3
            new YUKA.Vector3( 4, 1.6, -4),  // degrau 4
            new YUKA.Vector3( 5, 2.0, -5),  // topo da escada
            new YUKA.Vector3( 6, 2.0, -8),  // corredor superior
        ], 3),
    },
}

// ── Atalho: Record<name, YUKA.Vector3[]> compatível com NPC.ts ───────────────
export const npcPaths: Record<string, YUKA.Vector3[]> = Object.fromEntries(
    Object.entries(pathDefs).map(([k, v]) => [k, v.points])
)

// ─────────────────────────────────────────────────────────────────────────────
// PathDebugger — visualização 3D dos caminhos diretamente na cena
// ─────────────────────────────────────────────────────────────────────────────

export class PathDebugger {

    private scene:    Scene
    private root:     Group         = new Group()
    private labelEls: HTMLElement[] = []

    constructor(scene: Scene) {
        this.scene = scene
        scene.add(this.root)
    }

    // ── API pública ───────────────────────────────────────────────────────────

    /** Desenha um caminho pelo nome */
    show(name: string): this {
        const def = pathDefs[name]
        if (!def) {
            console.warn(`[PathDebugger] Caminho '${name}' não existe.`)
            console.log('[PathDebugger] Disponíveis:', Object.keys(pathDefs).join(', '))
            return this
        }
        this._drawPath(name, def)
        return this
    }

    /** Desenha todos os caminhos registrados em pathDefs */
    showAll(): this {
        Object.entries(pathDefs).forEach(([name, def]) => this._drawPath(name, def))
        return this
    }

    /** Remove todos os objetos de debug da cena e labels do DOM */
    hide(): this {
        while (this.root.children.length) {
            const child = this.root.children[0] as Mesh
            this.root.remove(child)
            child.geometry?.dispose()
            ;(child.material as MeshBasicMaterial)?.dispose()
        }
        this.labelEls.forEach(el => el.remove())
        this.labelEls = []
        console.log('[PathDebugger] Debug removido.')
        return this
    }

    /**
     * Atualiza posição 2D das labels — chame no loop do Experience:
     *   ;(window as any).__pathDebug?.update(this.camera)
     */
    update(camera: any): void {
        this.labelEls.forEach(el => {
            const wp: Vector3 = (el as any).__worldPos
            if (!wp || !camera) return
            const p = wp.clone().project(camera)
            const x = ( p.x * 0.5 + 0.5) * window.innerWidth
            const y = (-p.y * 0.5 + 0.5) * window.innerHeight
            el.style.display = p.z < 1 ? 'block' : 'none'
            el.style.left    = `${x + 4}px`
            el.style.top     = `${y}px`
        })
    }

    // ── Internos ──────────────────────────────────────────────────────────────

    private _drawPath(name: string, def: PathDef): void {
        const color  = def.color ?? '#00ff9d'
        const points = def.points

        // Linha conectando os waypoints
        const threePts = points.map(p => new Vector3(p.x, p.y + 0.06, p.z))
        if (def.loop && threePts.length > 1) threePts.push(threePts[0].clone())

        const lineGeo = new BufferGeometry().setFromPoints(threePts)
        const lineMat = new LineBasicMaterial({ color, linewidth: 2 })
        this.root.add(new Line(lineGeo, lineMat))

        // Esferas nos waypoints
        points.forEach((p, i) => {
            const isFirst     = i === 0
            const isLast      = i === points.length - 1
            const sphereColor = isFirst ? '#00ff00' : isLast ? '#ff4444' : color
            const radius      = (isFirst || isLast) ? 0.30 : 0.16

            const sphere = new Mesh(
                new SphereGeometry(radius, 8, 6),
                new MeshBasicMaterial({ color: sphereColor, transparent: true, opacity: 0.9 })
            )
            sphere.position.set(p.x, p.y + 0.06, p.z)
            this.root.add(sphere)

            // Label HTML 2D
            this._addLabel(
                `${name}[${i}]\n(${p.x}, ${p.y}, ${p.z})`,
                new Vector3(p.x, p.y + 0.6, p.z),
                sphereColor
            )
        })

        console.log(
            `%c[PathDebug] ${name}%c  ${def.description}  (${points.length} pontos)`,
            `color:${color};font-weight:bold;`, 'color:#888;'
        )
    }

    private _addLabel(text: string, worldPos: Vector3, color: string): void {
        const el = document.createElement('div')
        el.className = '__pathdebug-label'
        Object.assign(el.style, {
            position:      'fixed',
            pointerEvents: 'none',
            zIndex:        '9999',
            fontFamily:    "'Share Tech Mono', monospace",
            fontSize:      '10px',
            lineHeight:    '1.4',
            color,
            background:    'rgba(0,0,0,0.75)',
            padding:       '2px 6px',
            borderRadius:  '3px',
            whiteSpace:    'pre',
            display:       'none',
            border:        `1px solid ${color}`,
        })
        el.textContent = text
        ;(el as any).__worldPos = worldPos
        document.body.appendChild(el)
        this.labelEls.push(el)
    }
}