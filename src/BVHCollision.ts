/**
 * BVHCollision.ts
 *
 * Sistema de colisão baseado em three-mesh-bvh.
 *  - Ray para baixo  → detecta chão, rampas e degraus
 *  - Ray frontal     → detecta paredes e bloqueia movimento
 *
 * CORREÇÃO: suporte a InstancedMesh.
 * O StaticGeometryGenerator ignora instâncias — cada instância precisa ser
 * expandida em um Mesh individual com a matrix correta antes de mesclar.
 */

import {
  BufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Raycaster,
  Scene,
  Vector3,
} from "three";
import {
  MeshBVHHelper,
  StaticGeometryGenerator,
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";

// Patch global
Mesh.prototype.raycast = acceleratedRaycast;
(BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;

export interface BVHCollisionResult {
  onGround: boolean;
  groundY: number | null;
  wallBlocked: boolean;
}

export class BVHCollision {
  private colliderMesh: Mesh | null = null;
  private scene: Scene;

  private downRay = new Raycaster();
  private frontRay = new Raycaster();

  readonly stepHeight    = 0.6;
  readonly groundSnapDist = 1.5;
  readonly wallCheckDist  = 0.45;
  readonly skinWidth      = 0.05;

  private bvhHelper: MeshBVHHelper | null = null;

  // Meshes temporários criados para expandir instâncias — descartados no rebuild
  private expandedMeshes: Mesh[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
  }

  buildFromColliders(colliders: Object3D[], showHelper = false): void {
    // Descarta build anterior
    if (this.colliderMesh) {
      (this.colliderMesh.geometry as any).disposeBoundsTree?.();
      this.scene.remove(this.colliderMesh);
      this.colliderMesh = null;
    }
    if (this.bvhHelper) {
      this.scene.remove(this.bvhHelper);
      this.bvhHelper = null;
    }
    // Descarta meshes temporários de instâncias anteriores
    this.expandedMeshes.forEach((m) => {
      m.geometry.dispose();
    });
    this.expandedMeshes = [];

    // Coleta todos os Meshes, expandindo InstancedMesh corretamente
    const meshes: Mesh[] = [];

    for (const obj of colliders) {
      obj.updateWorldMatrix(true, true);

      obj.traverse((child) => {
        // ── InstancedMesh: expande cada instância num Mesh com matrix aplicada ──
        if ((child as InstancedMesh).isInstancedMesh) {
          const instanced = child as InstancedMesh;
          const instanceMatrix = new Matrix4();

          for (let i = 0; i < instanced.count; i++) {
            instanced.getMatrixAt(i, instanceMatrix);

            // Clona a geometria e aplica a matrix da instância (world-space)
            const geo = instanced.geometry.clone();
            geo.applyMatrix4(instanceMatrix);

            const mesh = new Mesh(geo, new MeshBasicMaterial());
            // Não adiciona à cena — é apenas para o BVH
            meshes.push(mesh);
            this.expandedMeshes.push(mesh); // guarda para dispose posterior
          }

          return; // não precisa processar filhos do InstancedMesh
        }

        // ── Mesh comum ──────────────────────────────────────────────────────
        if ((child as Mesh).isMesh) {
          meshes.push(child as Mesh);
        }
      });
    }

    if (meshes.length === 0) {
      console.warn("[BVHCollision] Nenhum Mesh encontrado.");
      return;
    }

    // Mescla tudo num único buffer e computa BVH
    const generator = new StaticGeometryGenerator(meshes);
    generator.attributes = ["position"];
    const merged = generator.generate();
    (merged as any).computeBoundsTree();

    this.colliderMesh = new Mesh(merged, new MeshBasicMaterial({ visible: false }));
    this.colliderMesh.name = "__bvh_collider__";
    this.scene.add(this.colliderMesh);

    console.log(
      `[BVHCollision] BVH gerado: ${meshes.length} meshes (inclui instâncias expandidas).`
    );

    if (showHelper) {
      this.bvhHelper = new MeshBVHHelper(this.colliderMesh, 10);
      this.scene.add(this.bvhHelper);
    }
  }

  check(playerPos: Vector3, moveDir: Vector3): BVHCollisionResult {
    if (!this.colliderMesh) {
      return { onGround: true, groundY: null, wallBlocked: false };
    }

    // ── Ray para baixo — detecta chão, rampas e topo de plataformas ──────────
    // Partimos de playerPos.y + stepHeight para que degraus pequenos
    // não bloqueiem o ray antes de atingir o chão.
    const downOrigin = playerPos.clone();
    downOrigin.y += this.stepHeight;

    this.downRay.set(downOrigin, new Vector3(0, -1, 0));
    this.downRay.far = this.stepHeight + this.groundSnapDist;

    const downHits = this.downRay.intersectObject(this.colliderMesh, false);

    let onGround = false;
    let groundY: number | null = null;

    if (downHits.length > 0) {
      groundY = downHits[0].point.y;
      onGround = true;
    }

    // ── Ray de plataforma — detecta topo de palco/plataforma acima do player ──
    // Problema: quando o player está na LATERAL de um palco suspenso (ex: Y=0,
    // palco em Y=1.0), o ray para baixo acerta o chão real (Y=0) embaixo do palco
    // e não o topo do palco. O player fica em Y=0 e atravessa a lateral.
    //
    // Solução: ray adicional partindo de mais alto (playerPos.y + PLATFORM_PROBE_H)
    // que varre para baixo uma distância maior. Se achar uma superfície acima
    // do groundY já encontrado, prefere ela — é o topo do palco.
    const PLATFORM_PROBE_H = 2.5; // altura máxima de plataforma detectável
    const probeOrigin = playerPos.clone();
    probeOrigin.y += PLATFORM_PROBE_H;

    const probeRay = new Raycaster();
    probeRay.set(probeOrigin, new Vector3(0, -1, 0));
    probeRay.far = PLATFORM_PROBE_H + this.groundSnapDist;

    const probeHits = probeRay.intersectObject(this.colliderMesh, false);

    if (probeHits.length > 0) {
      const probeY = probeHits[0].point.y;
      // Só usa o resultado da probe se encontrou algo ACIMA do chão já detectado
      // E o player está abaixo desse nível (está na lateral, não em cima)
      // E a superfície está dentro de alcance de snap (não é o teto)
      const playerIsBelow  = probeY > playerPos.y + this.skinWidth;
      const isReachableSnap = probeY - playerPos.y <= PLATFORM_PROBE_H;
      const isBetterGround  = groundY === null || probeY > groundY;

      if (playerIsBelow && isReachableSnap && isBetterGround) {
        groundY  = probeY;
        onGround = true;
      }
    }

    // ── Ray frontal — detecta paredes em múltiplas alturas ───────────────────
    // Checamos em 3 alturas: tornozelo, cintura e peito.
    // Isso garante que paredes baixas (rodapés) e altas (palcos) sejam detectadas.
    let wallBlocked  = false;
    let wallHitY     = -Infinity; // altura mais alta de colisão frontal

    if (moveDir.lengthSq() > 0.001) {
      const dir      = moveDir.clone().normalize();
      const heights  = [0.15, 0.6, 0.95]; // tornozelo, cintura, peito

      for (const h of heights) {
        const frontOrigin = playerPos.clone();
        frontOrigin.y += h;

        this.frontRay.set(frontOrigin, dir);
        this.frontRay.far = this.wallCheckDist;

        const frontHits = this.frontRay.intersectObject(this.colliderMesh, false);

        if (frontHits.length > 0) {
          const hitY = frontHits[0].point.y;
          if (hitY > wallHitY) wallHitY = hitY;
        }
      }

      if (wallHitY > -Infinity) {
        // É degrau se o topo da colisão está dentro do stepHeight do player
        const isStep = wallHitY - playerPos.y <= this.stepHeight;
        wallBlocked  = !isStep;
      }
    }

    return { onGround, groundY, wallBlocked };
  }

  rebuild(colliders: Object3D[]): void {
    this.buildFromColliders(colliders);
  }

  dispose(): void {
    if (this.colliderMesh) {
      (this.colliderMesh.geometry as any).disposeBoundsTree?.();
      this.scene.remove(this.colliderMesh);
      this.colliderMesh = null;
    }
    if (this.bvhHelper) {
      this.scene.remove(this.bvhHelper);
      this.bvhHelper = null;
    }
    this.expandedMeshes.forEach((m) => m.geometry.dispose());
    this.expandedMeshes = [];
  }
}
