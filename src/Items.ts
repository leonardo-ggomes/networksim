import {
    AxesHelper,
    BoxGeometry,
    BoxHelper,
    BufferGeometry,
    InstancedMesh,
    Material,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    MeshToonMaterial,
    Object3D,
    PointLight,
    Scene,
    SphereGeometry,
    SpotLight,
    Vector3
} from "three";
import Loading from "./Loading";
import { gui } from "./GuiControl";
import SlideShow from "./SlideShow";
import SlideController from "./SlideControllers";
import { colliders } from "./Colliders";

export default class Items {

    loading: Loading
    scene: Scene
    items = [
        {
            instances: 1,
            name: "auditorio",
            path: "models/auditorio_v6.glb",
            positions: [
                { x: 0, y: 0, z: 0 }
            ],
            scales: [...new Array(1).fill(1)],
            rotations: [
                { x: 0, y: 0, z: 0 }
            ],
            isCollider: true,
            isGroup: true
        },
        {
            instances: 1,
            name: "poltrona",
            path: "models/poltrona_v2.glb",
            positions: [
                { x: 0, y: 0, z: 0 }
            ],
            scales: [...new Array(1).fill(1.5)],
            rotations: [
                { x: 0, y: 0, z: 0 }
            ],
            isCollider: true,
            isGroup: true
        }
    ]
    lights: Mesh[] = []
    raycasterView: Object3D[] = []
  
    constructor(scene: Scene, loading: Loading) {
        this.loading = loading
        this.scene = scene
        this.setItems()
        // this.addLight(new Vector3(10.8, 9.5, -3)) //Adiciona luz
      
        // const axes = new AxesHelper()
        // axes.position.set(0, 1, 0)
        // this.scene.add(axes)

        // const axesFolder = gui.addFolder("Axes Folder")

        // axesFolder.add(axes.position, "x", -100, 100)
        // axesFolder.add(axes.position, "y", -100, 100)
        // axesFolder.add(axes.position, "z", -100, 100)
    }

    createLadder() {

        const totalOfStairs = 3
        for (let i = 1; i <= totalOfStairs; i++) {

            const degraus = new Mesh(
                new BoxGeometry(2, 0.3),
                new MeshToonMaterial({ color: 0x000 })
            )

            degraus.name = "degrau"

            // const axes = new BoxHelper(degraus)
            // degraus.add(axes)

            degraus.position.x = -24
            degraus.position.z = 21 + (0.53 * i)
            degraus.position.y = 0.2 * i

            if (i === 3) {

                const palcoChao = new Mesh(
                    new BoxGeometry(8, 0.2, 13),
                    new MeshBasicMaterial({ transparent: true, opacity: 0 })
                )

                palcoChao.name = "degrau"


                // const chaoPalcoHelper = new BoxHelper(palcoChao)
                // palcoChao.add(chaoPalcoHelper)

                palcoChao.position.x = -24.5
                palcoChao.position.z = 30
                palcoChao.position.y = 0.8

                this.scene.add(palcoChao)
                colliders.push(palcoChao)

                let auxChaoPalco = palcoChao.clone()
                auxChaoPalco.name = "aux_chao"
                auxChaoPalco.position.x = -24.5
                auxChaoPalco.position.z = 30
                auxChaoPalco.position.y = 0
                colliders.push(auxChaoPalco)

            }

            this.scene.add(degraus)
            colliders.push(degraus)
        }
    }

    setItems() {

        this.items.forEach(async (item) => {
            const obj = await this.loading.loader.loadAsync(item.path)
            obj.scene.name = item.name

            // const axes = new BoxHelper(obj.scene)
            // obj.scene.add(axes)

            if (item.isGroup) {

                if (item.name === "poltrona") {
                    const baseChair = obj.scene

                    baseChair.scale.set(
                        item.scales[0],
                        item.scales[0],
                        item.scales[0]
                    )

                    this.createChairsGrid(
                        baseChair,
                        8,          // número de fileiras
                        12,         // cadeiras por fileira
                        1.2,        // espaço entre cadeiras (x)
                        2.5,        // espaço entre fileiras (z)
                        4,          // corredor a cada 4 cadeiras
                        2.5,        // largura do corredor
                        -10,        // posição inicial X
                        10          // posição inicial Z
                    )
                }
                else {
                    obj.scene.traverse((child) => {
                        if ((child as Mesh).isMesh) {

                            if (child.name.includes("house_house")) {

                                if (child.name !== "house_house_0004" && child.name !== "house_house_0005") //Chao e teto
                                {
                                    colliders.push(child)
                                    this.raycasterView.push(child)
                                }
                            }

                            // if (child.name.includes("screen1_screen1_0")) 
                            // {
                            //     console.log(child.name)
                            //     this.colliders.push(child)
                            //     this.raycasterView.push(child)                                
                            // }

                            if (child.name.includes("stage_stage2_0")) 
                            {
                                child.name = "degrau"
                                colliders.push(child)
                                                
                            }

                            if (child.name.includes("backwall_backwall")) 
                            {
                                colliders.push(child)
                                this.raycasterView.push(child)       
                            }

                            if (child.name.includes("dec_dec")) 
                            {
                                colliders.push(child)
                                this.raycasterView.push(child)       
                            }

                            if (child.name == "screen1_screen1_0") 
                            {
                                const mesh = child as Mesh;
                                // Limpa a textura original do GLTF
                                mesh.material = new MeshBasicMaterial({color: 0xffffff})

                                
                                const slide = new SlideShow(mesh, this.loading)
                                slide.loadSlidesFromUrls([
                                    'img/Slide1.PNG'
                                  ]);
                           
                                new SlideController(slide);
                          
                                this.raycasterView.push(child)
                            }

                          
                
                        }
                    })

                    obj.scene.scale.set(
                        item.scales[0],
                        item.scales[0],
                        item.scales[0]
                    )

                    // obj.scene.position.set(
                    //     item.positions[0].x,
                    //     item.positions[0].y,
                    //     item.positions[0].z
                    // )

                    this.scene.add(obj.scene)
                }


            }

        })
    }

    addLight(position: Vector3) {
        const lightGeometry = new SphereGeometry(.1, 2, 2)
        const lightMaterial = new MeshStandardMaterial({
            emissive: 0xFFD700,
            emissiveIntensity: 1.5
        })

        const lightMesh = new Mesh(lightGeometry, lightMaterial)
        lightMesh.position.copy(position)


        const pointLight = new PointLight(0xFFD700, 10, 2)
        lightMesh.add(pointLight)
        pointLight.position.y -= 1

        const spotLight = new SpotLight(0xFFFF80, 100, 20, Math.PI / 3, .4, 2)
        spotLight.target.lookAt(0, 0, 0)

        lightMesh.add(spotLight)
        lightMesh.add(spotLight.target)

        this.scene.add(lightMesh)
        this.lights.push(lightMesh)

    }

    createChairsGrid = (
        baseMesh: Object3D,
        numRows: number,               // número de fileiras
        chairsPerRow: number,         // número de cadeiras por fileira
        chairSpacing: number,         // espaçamento entre cadeiras (x)
        rowSpacing: number,           // espaçamento entre fileiras (z)
        corridorEvery: number,        // a cada quantas cadeiras adicionar um corredor
        corridorWidth: number,        // largura do corredor
        startX = 0,                   // posição inicial em X
        startZ = 0                    // posição inicial em Z
    ) => {
        let chairIndex = 0

        for (let row = 0; row < numRows; row++) {
            let offsetX = startX

            for (let col = 0; col < chairsPerRow; col++) {

                // Adiciona espaço para corredor
                if (corridorEvery > 0 && col > 0 && col % corridorEvery === 0) {
                    offsetX += corridorWidth
                }

                // Clona a cadeira
                const chair = baseMesh.clone()
                chair.name = `poltrona_${row}_${col}`

                // Define posição da cadeira
                chair.position.set(
                    offsetX + (col * chairSpacing),
                    0,
                    startZ + (row * rowSpacing)
                )

                // Adiciona ao cenário
                this.scene.add(chair)
                colliders.push(chair)

                chairIndex++
            }
        }
    }

}