import {
    AxesHelper,
    BufferGeometry,
    Euler,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    PointLight,
    Quaternion,
    Scene,
    SphereGeometry,
    SpotLight,
    Vector3,
} from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import Loading from "./Loading";
import SlideShow from "./SlideShow";
import SlideController from "./SlideControllers";
import { colliders } from "./Colliders";
import { SceneObjectUpdate } from "./types/EditorTypes";

// ─── Rotação da cadeira ───────────────────────────────────────────────────────
// Se a cadeira aparecer de cabeça para baixo, o modelo tem o eixo Y invertido.
// Corrigimos com uma rotação em X de 180° (Math.PI) junto com a rotação Y.
//
// Combinações para testar caso ainda não fique certo:
//   Caso A — só virada (padrão):       rotX=0,        rotY=Math.PI
//   Caso B — de cabeça para baixo:     rotX=Math.PI,  rotY=0
//   Caso C — de cabeça para baixo + virada (mais comum em GLTFs exportados do Blender):
//             rotX=Math.PI,  rotY=Math.PI   ← começa por este
const CHAIR_ROT_X = 0 //Math.PI; // corrige cabeça para baixo
const CHAIR_ROT_Y = Math.PI; // vira para o palco


export interface ChairInstance {
    name: string;
    instanceIndex: number;
    position: Vector3;
    quaternion: Quaternion;
}

export default class Items {
    loading: Loading;
    scene: Scene;

    items = [
        {
            name: "auditorio",
            path: "models/stage.glb",
            scales: [1],
            rotations: [{ x: 0, y: 0, z: 0 }],
            positions: [{ x: 0, y: 0, z: 0 }],
            isCollider: true,
            isGroup: true,
        },
        {
            name: "poltrona",
            path: "models/theater_chair.glb",
            scales: [2],
            rotations: [{ x: 0, y: 0, z: 0 }],
            positions: [{ x: 0, y: 0, z: 0 }],
            isCollider: true,
            isGroup: true,
        },
    ];

    lights: Mesh[] = [];
    raycasterView: Object3D[] = [];
    chairInstances: Map<string, ChairInstance> = new Map();
    chairInstancedMesh?: InstancedMesh;

    private editorObjects: Map<string, Object3D> = new Map();
    itemsLoaded: Promise<void>;
    private resolveItemsLoaded!: () => void;

    constructor(scene: Scene, loading: Loading) {
        this.itemsLoaded = new Promise((r) => (this.resolveItemsLoaded = r));
        this.loading = loading;
        this.scene = scene;
        this.setItems();

        const axes = new AxesHelper();
        axes.position.set(0, 1, 0);
        this.scene.add(axes);
    }

    public getEditableObjects(): Object3D[] {
        return Array.from(this.editorObjects.values());
    }

    updateItemTransform(data: SceneObjectUpdate) {
        const object = this.editorObjects.get(data.name);
        if (object) {
            object.position.set(data.position.x, data.position.y, data.position.z);
            object.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
            object.scale.set(data.scale.x, data.scale.y, data.scale.z);
        }
    }

    async setItems() {
        for (const item of this.items) {
            const obj = await this.loading.loader.loadAsync(item.path);
            obj.scene.name = item.name;

            if (!item.isGroup) continue;

            if (item.name === "poltrona") {
                const baseChair = obj.scene;
                baseChair.scale.setScalar(item.scales[0]);
                await this.createChairsGrid(
                    baseChair,
                    6,    // fileiras
                    12,   // cadeiras por fileira
                    2.0,  // espaço X
                    2.5,  // espaço Z
                    8,    // corredor a cada N
                    2.5,  // largura do corredor
                    -10,  // startX
                    10    // startZ
                );
            } else {
                obj.scene.traverse((child) => {
                    if (!(child as Mesh).isMesh) return;
                    const mesh = child as Mesh;

                    if (mesh.geometry) mesh.geometry.computeBoundsTree();

                    const ignoredNames = [                        
                        "house_ground",
                    ];

                    if (!ignoredNames.some((n) => mesh.name.includes(n))) {
                        colliders.push(mesh);
                        this.raycasterView.push(mesh);
                    }

                    if (mesh.name === "screen1_screen1_0") {
                        mesh.material = new MeshBasicMaterial({ color: 0xffffff });
                        const slide = new SlideShow(mesh, this.loading);
                        slide.loadSlidesFromUrls(["img/Slide1.jpg"]);
                        new SlideController(slide);
                    }
                });

                obj.scene.scale.setScalar(item.scales[0]);
                this.scene.add(obj.scene);
                obj.scene.userData.isEditable = true;
                this.editorObjects.set(item.name, obj.scene);
            }
        }

        this.resolveItemsLoaded();
        console.log("[Items] Todos os itens carregados.");
    }

    async createChairsGrid(
        baseMesh: Object3D,
        numRows: number,
        chairsPerRow: number,
        chairSpacingX: number,
        rowSpacingZ: number,
        corridorEvery: number,
        corridorWidth: number,
        startX = 0,
        startZ = 0
    ) {
        // ── 1. Coleta todos os sub-meshes e mescla em uma geometria só ───────────
        //
        // Modelos GLTF do Blender geralmente têm múltiplos sub-meshes
        // (encosto, assento, pernas, etc.). Pegar só o primeiro deixa
        // partes da cadeira faltando. Precisamos mesclar tudo.
        //
        // Usamos BufferGeometryUtils.mergeGeometries para juntar todos
        // os sub-meshes numa geometria única, aplicando a matrix local
        // de cada um para preservar posição/rotação/escala corretas.

        baseMesh.updateWorldMatrix(true, true);
        const baseMeshInvMatrix = baseMesh.matrixWorld.clone().invert();

        const geometriesToMerge: BufferGeometry[] = [];
        let originalMaterial: any = null;

        baseMesh.traverse((child) => {
            if (!(child as Mesh).isMesh) return;
            const mesh = child as Mesh;

            // Clona a geometria e aplica a matrix relativa ao baseMesh
            const geo = mesh.geometry.clone();
            const relativeMatrix = mesh.matrixWorld.clone().premultiply(baseMeshInvMatrix);
            geo.applyMatrix4(relativeMatrix);

            // Remove grupos de material — necessário para mergeGeometries sem índices de grupo
            geo.clearGroups();

            geometriesToMerge.push(geo);

            // Usa o material do primeiro sub-mesh encontrado
            if (!originalMaterial) {
                originalMaterial = Array.isArray(mesh.material)
                    ? mesh.material[0]
                    : mesh.material;
            }
        });

        if (geometriesToMerge.length === 0 || !originalMaterial) {
            console.warn("[Items] Nenhuma geometria encontrada na poltrona.");
            return;
        }

        // Mescla todas as partes em uma geometria única
        const geometry = BufferGeometryUtils.mergeGeometries(geometriesToMerge, false);

        if (!geometry) {
            console.warn("[Items] Falha ao mesclar geometrias da poltrona.");
            return;
        }

        geometry.computeBoundsTree();

        // Libera as geometrias temporárias
        geometriesToMerge.forEach((g) => g.dispose());

        const totalChairs = numRows * chairsPerRow;

        // ── 2. InstancedMesh com material original do GLTF ────────────────────
        // Não alteramos o material — a iluminação vem dos SpotLights e AmbientLight.
        const instancedMesh = new InstancedMesh(geometry, originalMaterial, totalChairs);
        instancedMesh.name = "poltrona_grid";
        instancedMesh.frustumCulled = true;
        this.chairInstancedMesh = instancedMesh;

        // Quaternion de rotação das cadeiras
        const chairQuaternion = new Quaternion().setFromEuler(
            new Euler(CHAIR_ROT_X, CHAIR_ROT_Y, 0, "XYZ")
        );

        // Escala neutra: a escala do baseMesh já foi "assada" na geometria
        // via applyMatrix4 acima — não aplicar duas vezes
        const neutralScale = new Vector3(1.4, 1.4, 1.4);
        const matrix = new Matrix4();
        let index = 0;

        for (let row = 0; row < numRows; row++) {
            let offsetX = startX;

            for (let col = 0; col < chairsPerRow; col++) {
                if (corridorEvery > 0 && col > 0 && col % corridorEvery === 0) {
                    offsetX += corridorWidth;
                }

                const position = new Vector3(
                    offsetX + col * chairSpacingX,
                    0,   // Y=1 mantido do seu arquivo
                    startZ + row * rowSpacingZ
                );

                matrix.compose(position, chairQuaternion, neutralScale);
                instancedMesh.setMatrixAt(index, matrix);

                const name = `poltrona_${row}_${col}`;
                this.chairInstances.set(name, {
                    name,
                    instanceIndex: index,
                    position: position.clone(),
                    quaternion: chairQuaternion.clone(),
                });

                index++;
            }
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(instancedMesh);
        colliders.push(instancedMesh);
        this.editorObjects.set("poltrona_grid", instancedMesh);

        // ── 4. SpotLights nos corredores ──────────────────────────────────────
        this.addChairSpotlights(
            numRows, chairsPerRow, chairSpacingX, rowSpacingZ,
            corridorEvery, corridorWidth, startX, startZ
        );

        console.log(`[Items] ${totalChairs} cadeiras — 1 draw call.`);
    }

    private addChairSpotlights(
        numRows: number,
        chairsPerRow: number,
        chairSpacingX: number,
        rowSpacingZ: number,
        corridorEvery: number,
        corridorWidth: number,
        startX: number,
        startZ: number
    ) {
        // Calcula o centro X de cada bloco entre corredores
        const blockCentersX: number[] = [];
        const numBlocks = Math.ceil(chairsPerRow / corridorEvery);

        for (let b = 0; b < numBlocks; b++) {
            const blockColStart = b * corridorEvery;
            const blockColEnd   = Math.min(blockColStart + corridorEvery, chairsPerRow) - 1;
            const xStart = startX + blockColStart * chairSpacingX + b * corridorWidth;
            const xEnd   = startX + blockColEnd   * chairSpacingX + b * corridorWidth;
            blockCentersX.push((xStart + xEnd) / 2);
        }

        const lightHeight = 5;
        const rowStep     = 2;

        for (const centerX of blockCentersX) {
            for (let row = 0; row < numRows; row += rowStep) {
                const centerZ = startZ + (row + rowStep / 2) * rowSpacingZ;

                const spot = new SpotLight(
                    0xffffff, // branco puro — ilumina a cor real do material
                    30,       // intensidade alta para compensar luz ambiente baixa
                    lightHeight + 6,
                    Math.PI / 4,
                    0.6,
                    1.0
                );

                spot.position.set(centerX, lightHeight, centerZ);
                spot.target.position.set(centerX, 0, centerZ);
                spot.castShadow = false;

                this.scene.add(spot.target);
                this.scene.add(spot);
            }
        }

        // NOTA: se as cadeiras ainda estiverem escuras, aumente a AmbientLight
        // no Experience.ts:
        //   this.ambientLight.intensity = 1.5  (era 0.2)
        // Ou adicione uma luz direcional apontando para a plateia:
        //   const fill = new DirectionalLight(0xffffff, 1)
        //   fill.position.set(0, 10, 20)
        //   this.scene.add(fill)
    }

    getNearestChair(playerPos: Vector3, maxDistance: number): ChairInstance | null {
        let nearest: ChairInstance | null = null;
        let nearestDist = maxDistance;

        for (const chair of this.chairInstances.values()) {
            const dist = playerPos.distanceTo(chair.position);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = chair;
            }
        }

        return nearest;
    }

    addLight(position: Vector3) {
        const lightGeometry = new SphereGeometry(0.1, 2, 2);
        const lightMaterial = new MeshStandardMaterial({
            emissive: 0xffd700,
            emissiveIntensity: 1.5,
        });
        const lightMesh = new Mesh(lightGeometry, lightMaterial);
        lightMesh.position.copy(position);

        const pointLight = new PointLight(0xffd700, 10, 2);
        lightMesh.add(pointLight);
        pointLight.position.y -= 1;

        const spotLight = new SpotLight(0xffff80, 100, 20, Math.PI / 3, 0.4, 2);
        spotLight.target.lookAt(0, 0, 0);
        lightMesh.add(spotLight);
        lightMesh.add(spotLight.target);

        this.scene.add(lightMesh);
        this.lights.push(lightMesh);
    }
}