/**
 * Guest.ts — Jogadores remotos com nome flutuante estilo GTA V
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
    AnimationMixer,
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
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Loading from './Loading';
import { colliders } from './Colliders';

const GUEST_COLORS = [
    '#4fc3f7', '#81c784', '#ffb74d', '#f06292',
    '#ce93d8', '#4db6ac', '#fff176', '#ff8a65',
];

// ── Cache GLTFs ───────────────────────────────────────────────────────────────
const gltfCache  = new Map<string, GLTF>();
const loadingMap = new Map<string, Promise<GLTF>>();

function loadGLTF(loading: Loading, url: string): Promise<GLTF> {
    if (gltfCache.has(url))  return Promise.resolve(gltfCache.get(url)!);
    if (loadingMap.has(url)) return loadingMap.get(url)!;
    const p = loading.loader.loadAsync(url).then(gltf => { gltfCache.set(url, gltf); return gltf; });
    loadingMap.set(url, p);
    return p;
}

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
    obj:              Object3D;
    mixer:            AnimationMixer;
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
    private static _tmpVec = new Vector3();

    // ── Carrega um guest ───────────────────────────────────────────────────────
    static async loadModel(
        loading:    Loading,
        urlAvatar:  string,
        socketId:   string,
        playerName: string = 'Jogador'
    ): Promise<void> {

        const modelUrl = urlAvatar || 'models/asian_male_animated@base.glb';
        const baseGltf = await loadGLTF(loading, modelUrl);
        const cloned   = SkeletonUtils.clone(baseGltf.scene) as Object3D;

        const colorIdx = Guest.colorCounter % GUEST_COLORS.length;
        Guest.colorCounter++;

        const mixer: AnimationMixer = new AnimationMixer(cloned);
        const animationsAction: { [key: string]: AnimationAction } = {};

        for (const key in loading.globalAnimations) {
            animationsAction[key] = mixer.clipAction(loading.globalAnimations[key]);
        }
        animationsAction['Idle']?.play();

        // Sprite de nome
        const sprite = Guest.createNameSprite(playerName, GUEST_COLORS[colorIdx]);

        Guest.models[socketId] = {
            obj: cloned, mixer, animationsAction,
            activeClip: animationsAction['Idle'],
            nameSprite: sprite,
            playerName,
        };
        Guest.animationsAction = animationsAction;

        cloned.name = `guest.${socketId}`;
        colliders.push(cloned);

        Guest.addRing(cloned, colorIdx);
        cloned.add(sprite);

        console.log(`[Guest] "${playerName}" (${socketId}) → ${modelUrl}`);
    }

    // ── Anel indicador ────────────────────────────────────────────────────────
    private static addRing(scene: Object3D, idx: number) {
        const ring = new Mesh(
            new RingGeometry(0.28, 0.38, 32),
            new MeshBasicMaterial({
                color: new Color(GUEST_COLORS[idx]),
                transparent: true, opacity: 0.45, side: DoubleSide,
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        scene.add(ring);
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
    private static updateSprites(camera: Camera) {
        camera.getWorldPosition(Guest._tmpVec);

        for (const id in Guest.models) {
            const { obj, nameSprite } = Guest.models[id];
            if (!nameSprite) continue;

            const dist = obj.position.distanceTo(Guest._tmpVec);

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

    // ── Interface pública — mesma de sempre ───────────────────────────────────

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

    // Aceita camera opcional — sem ela os sprites não ajustam escala
    static update(delta: number, camera?: Camera) {
        for (const id in Guest.models) {
            const { mixer, obj, activeClip, animationsAction } = Guest.models[id];
            mixer.update(delta);

            const hips = obj.getObjectByName('Hips');
            if (hips) {
                hips.position.set(0, hips.position.y, 0);
                if (activeClip === animationsAction['Sitting']) {
                    hips.rotation.x = 0;
                    hips.position.set(0, hips.position.y + 0.5, 0);
                }
            }
        }
        if (camera) Guest.updateSprites(camera);
    }

    static dispose(socketId: string) {
        const inst = Guest.models[socketId];
        if (!inst) return;

        inst.mixer.stopAllAction();

        if (inst.nameSprite) {
            (inst.nameSprite.material as SpriteMaterial).map?.dispose();
            inst.nameSprite.material.dispose();
        }

        inst.obj.traverse((child) => {
            const mesh = child as Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry?.dispose();
            const mat = mesh.material;
            if (Array.isArray(mat)) mat.forEach(m => m.dispose());
            else (mat as MeshStandardMaterial)?.dispose();
        });

        const idx = colliders.indexOf(inst.obj);
        if (idx !== -1) colliders.splice(idx, 1);

        delete Guest.models[socketId];
        console.log(`[Guest] ${socketId} removido`);
    }
}