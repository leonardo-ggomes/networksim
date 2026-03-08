/**
 * Guest.ts — Jogadores remotos com nome flutuante estilo GTA V
 *
 * Usa PlayerModel como instância de cada guest, garantindo que
 * droneGroup, toggleDrone() e updateDrone() funcionem nativamente —
 * sem precisar de casts "as any" no SocketManager.
 *
 * Nome sobre a cabeça:
 *   - Canvas 2D → CanvasTexture → SpriteMaterial → Sprite (Three.js nativo)
 *   - Billboard automático: Sprite sempre vira para a câmera sem código extra
 *   - Estilo: fundo escuro + borda colorida por guest + texto branco
 *   - depthTest: false → sempre visível mesmo atrás de paredes
 *   - Escala ajustada pela distância para não ficar gigante de perto
 */

import {
    AnimationAction,
    Camera,
    CanvasTexture,
    Color,
    DoubleSide,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    Quaternion,
    RingGeometry,
    Sprite,
    SpriteMaterial,
    Vector3,
} from 'three';
import Loading from './Loading';
import { colliders } from './Colliders';
import PlayerController from './PlayerController';
import PlayerModel from './PlayerModel';

const GUEST_COLORS = [
    '#4fc3f7', '#81c784', '#ffb74d', '#f06292',
    '#ce93d8', '#4db6ac', '#fff176', '#ff8a65',
];

// ── Textura de nome via Canvas 2D ─────────────────────────────────────────────
function makeNameTexture(name: string, accentColor: string): CanvasTexture {
    const W = 512, H = 112;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const pad = 14, bh = 68, by = (H - bh) / 2;
    ctx.clearRect(0, 0, W, H);

    // Fundo
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundRect(ctx, pad, by, W - pad * 2, bh, 10);
    ctx.fill();

    // Borda colorida esquerda
    ctx.fillStyle = accentColor;
    roundRect(ctx, pad, by, 5, bh, [10, 0, 0, 10]);
    ctx.fill();

    // Linha superior sutil
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, pad, by, W - pad * 2, 2, [10, 10, 0, 0]);
    ctx.fill();

    // Nome
    ctx.font = 'bold 38px "Arial Narrow", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 5;
    ctx.fillText(name.toUpperCase(), W / 2 + 8, H / 2, W - pad * 3 - 16);

    return new CanvasTexture(canvas);
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    r: number | [number, number, number, number]
) {
    const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
}

// ── Instância ─────────────────────────────────────────────────────────────────
interface GuestInstance {
    obj:              PlayerModel;          // PlayerModel completo (tem drone nativo)
    animationsAction: { [key: string]: AnimationAction };
    activeClip?:      AnimationAction;
    nameSprite?:      Sprite;
    playerName:       string;
}

// ═══════════════════════════════════════════════════════════════════════════════
export default class Guest {

    static models: { [socketId: string]: GuestInstance } = {};
    static animationsAction: { [key: string]: AnimationAction } = {};

    private static colorCounter = 0;
    private static _camPos     = new Vector3(); // reutilizado em update() — zero alloc
    private static _tmpVec     = new Vector3(); // reutilizado em cálculos de distância

    // Máximo de drones de guests que projetam LUZ simultânea.
    // Drones além desse limite ficam visíveis mas com luz desligada.
    // Cada SpotLight ativa = pressão extra no shader de todos os objetos iluminados.
    static MAX_ACTIVE_DRONE_LIGHTS = 5;

    // ── Carrega um guest ───────────────────────────────────────────────────────
    static async loadModel(
        loading:    Loading,
        urlAvatar:  string,
        socketId:   string,
        playerName: string = 'Jogador'
    ): Promise<void> {

        const colorIdx   = Guest.colorCounter % GUEST_COLORS.length;
        Guest.colorCounter++;

        // Instancia um PlayerModel completo (isGuest = true).
        // Isso garante droneGroup, toggleDrone() e updateDrone() sem casts.
        const playerModel = new PlayerModel(loading, true, urlAvatar, socketId);
        await playerModel.isLoadedModel;

        const animationsAction = playerModel.animationsAction;

        // Sprite de nome flutuante
        const sprite = Guest.createNameSprite(playerName, GUEST_COLORS[colorIdx]);
        playerModel.add(sprite);

        // Anel colorido por guest (substituindo o anel verde padrão do PlayerModel)
        Guest.addColoredRing(playerModel, colorIdx);

        Guest.models[socketId] = {
            obj:              playerModel,
            animationsAction,
            activeClip:       animationsAction['Idle'],
            nameSprite:       sprite,
            playerName,
        };
        Guest.animationsAction = animationsAction;

        // Reconstrói o BVH para incluir o novo guest na colisão física
        PlayerController.instance?.refreshBVH();

        console.log(`[Guest] "${playerName}" (${socketId}) → ${urlAvatar}`);
    }

    // ── Anel colorido por guest ───────────────────────────────────────────────
    // Substitui o anel verde padrão do PlayerModel por um com a cor do guest.
    private static addColoredRing(model: PlayerModel, idx: number) {
        // Remove o anel padrão se existir
        if (model.ring) {
            (model.ring.material as MeshBasicMaterial).color.set(GUEST_COLORS[idx]);
            (model.ring.material as MeshBasicMaterial).opacity = 0.45;
        } else {
            const ring = new Mesh(
                new RingGeometry(0.28, 0.38, 32),
                new MeshBasicMaterial({
                    color: new Color(GUEST_COLORS[idx]),
                    transparent: true, opacity: 0.45, side: DoubleSide,
                })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.05;
            model.add(ring);
        }
    }

    // ── Sprite de nome ────────────────────────────────────────────────────────
    private static createNameSprite(name: string, color: string): Sprite {
        const mat = new SpriteMaterial({
            map:         makeNameTexture(name, color),
            transparent: true,
            depthTest:   false,   // sempre visível, mesmo parcialmente ocluído
            depthWrite:  false,
        });
        const sprite = new Sprite(mat);
        sprite.position.set(0, 2.25, 0); // acima da cabeça
        sprite.scale.set(1.6, 0.4, 1);   // proporção 4:1 do canvas
        return sprite;
    }

    // ── Ajusta escala dos sprites por distância ───────────────────────────────
    private static updateSprites(camPos: Vector3) {
        for (const id in Guest.models) {
            const { obj, nameSprite } = Guest.models[id];
            if (!nameSprite) continue;

            const dist = obj.position.distanceTo(camPos);

            // Oculta se muito perto (câmera passando pelo modelo) ou longe demais
            if (dist < 1.2 || dist > 28) {
                nameSprite.visible = false;
                continue;
            }
            nameSprite.visible = true;

            // Mantém tamanho aparente razoavelmente constante com a distância
            const s = Math.max(0.5, Math.min(1.6, dist * 0.07));
            nameSprite.scale.set(s * 4, s, 1);
        }
    }

    // ── Interface pública ─────────────────────────────────────────────────────

    static setPosition(pos: Vector3, socketId: string) {
        Guest.models[socketId]?.obj.position.copy(pos);
    }

    static setQuaternion(q: Quaternion, socketId: string) {
        Guest.models[socketId]?.obj.quaternion.copy(q);
    }

    static setAnimation(action?: AnimationAction, socketId = '') {
        const inst = Guest.models[socketId];
        if (!inst || !action || action === inst.activeClip) return;

        const toSit  = action === inst.animationsAction['Sitting'];
        const wasSit = inst.activeClip === inst.animationsAction['Sitting'];

        inst.activeClip?.fadeOut(toSit || wasSit ? 0 : 0.2);
        action.reset().fadeIn(toSit ? 0 : 0.1).play();
        inst.activeClip = action;
    }

    // Distância máxima para renderizar guests (além disso: invisible + mixer pausado)
    static CULL_DISTANCE = 60;

    static update(delta: number, camera?: Camera) {
        // Reutiliza o mesmo Vector3 — zero alloc por frame
        if (camera) camera.getWorldPosition(Guest._camPos);

        // ── Gestão de luzes de drone: só os N mais próximos iluminam ──────
        // Coleta guests com drone ativo ordenados por distância
        const activeDrones: { id: string; dist: number }[] = [];
        for (const id in Guest.models) {
            const obj = Guest.models[id].obj;
            if (obj.IsDroneActive) {
                const dist = camera ? obj.position.distanceTo(Guest._camPos) : 0;
                activeDrones.push({ id, dist });
            }
        }
        activeDrones.sort((a, b) => a.dist - b.dist);

        for (const id in Guest.models) {
            const inst = Guest.models[id];
            const { obj, activeClip, animationsAction } = inst;
            const mixer = obj.mixer;
            if (!mixer) continue;

            // ── Culling por distância ──────────────────────────────────────
            if (camera) {
                const dist = obj.position.distanceTo(Guest._camPos);
                const visible = dist < Guest.CULL_DISTANCE;

                if (obj.visible !== visible) obj.visible = visible;

                if (!visible) {
                    mixer.timeScale = 0;
                    continue;
                }

                // LOD de mixer: 3 níveis de frequência de atualização
                //   < 15u  → timeScale 1.0 (full)
                //   15–35u → timeScale 0.5 (metade da CPU de skinning)
                //   35–60u → timeScale 0.25 (quase parado, só para não congelar)
                if      (dist < 15) mixer.timeScale = 1.0;
                else if (dist < 35) mixer.timeScale = 0.5;
                else                mixer.timeScale = 0.25;
            }

            mixer.update(delta);

            // Drone update: só para os N mais próximos com luz ativa
            if (obj.IsDroneActive) {
                obj.updateDrone(delta, obj.position);

                // Liga/desliga a luz do drone conforme o ranking de proximidade
                const rank = activeDrones.findIndex(d => d.id === id);
                const shouldLight = rank < Guest.MAX_ACTIVE_DRONE_LIGHTS;
                if (shouldLight !== (obj.droneLight.intensity > 0)) {
                    obj.droneLight.intensity = shouldLight ? 3 : 0;
                }
            }

            // PlayerModel cacheia hipsNode em loadModel() — acesso direto, zero busca recursiva
            const hipsNode = (obj as any).hipsNode as Object3D | undefined;
            if (hipsNode) {
                hipsNode.position.set(0, hipsNode.position.y, 0);
                if (activeClip === animationsAction['Sitting']) {
                    hipsNode.rotation.x = 0;
                    hipsNode.position.set(0, hipsNode.position.y + 0.5, 0);
                }
            }
        }

        if (camera) Guest.updateSprites(Guest._camPos);
    }

    static dispose(socketId: string) {
        const inst = Guest.models[socketId];
        if (!inst) return;

        const { obj } = inst;
        obj.mixer?.stopAllAction();

        if (inst.nameSprite) {
            (inst.nameSprite.material as SpriteMaterial).map?.dispose();
            inst.nameSprite.material.dispose();
        }

        obj.traverse((child) => {
            const mesh = child as Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry?.dispose();
            const mat = mesh.material;
            if (Array.isArray(mat)) mat.forEach(m => m.dispose());
            else (mat as MeshStandardMaterial)?.dispose();
        });

        // Remove o model interno do colliders (PlayerModel adiciona model, não o Group)
        const modelObj = obj.model;
        if (modelObj) {
            const idx = colliders.indexOf(modelObj);
            if (idx !== -1) {
                colliders.splice(idx, 1);
                PlayerController.instance?.refreshBVH();
            }
        }

        delete Guest.models[socketId];
        console.log(`[Guest] ${socketId} removido`);
    }
}