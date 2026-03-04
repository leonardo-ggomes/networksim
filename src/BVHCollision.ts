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

    // ── Ray para baixo ────────────────────────────────────────────────────────
    const rayOrigin = playerPos.clone();
    rayOrigin.y += this.stepHeight;

    this.downRay.set(rayOrigin, new Vector3(0, -1, 0));
    this.downRay.far = this.stepHeight + this.groundSnapDist;

    const downHits = this.downRay.intersectObject(this.colliderMesh, false);

    let onGround = false;
    let groundY: number | null = null;

    if (downHits.length > 0) {
      groundY = downHits[0].point.y;
      onGround = true;
    }

    // ── Ray frontal (paredes) ─────────────────────────────────────────────────
    let wallBlocked = false;

    if (moveDir.lengthSq() > 0.001) {
      const frontOrigin = playerPos.clone();
      frontOrigin.y += 0.9; // altura do peito

      this.frontRay.set(frontOrigin, moveDir.clone().normalize());
      this.frontRay.far = this.wallCheckDist;

      const frontHits = this.frontRay.intersectObject(this.colliderMesh, false);

      if (frontHits.length > 0) {
        const hitY = frontHits[0].point.y;
        const isStep = hitY - playerPos.y <= this.stepHeight;
        wallBlocked = !isStep;
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