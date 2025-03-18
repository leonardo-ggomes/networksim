import { AxesHelper, BoxGeometry, BoxHelper, Mesh, MeshBasicMaterial, MeshToonMaterial, Object3D, Scene } from "three";
import Loading from "./Loading";

export default class Items{
    
    loading: Loading
    scene: Scene
    items = [            
        {
            instances: 1,
            name:"city",
            path: "models/city.glb",
            positions: [
                { x: 0, y: 0, z: 0}                          
            ],
            scales: [...new Array(1).fill(3)],
            rotations: [
                {x: 0, y: 0, z: 0}                              
            ],
            isCollider: true,
            isGroup: true
        }  
    ]
    colliders: Object3D[] = []
    
    constructor(scene: Scene, loading: Loading)
    {
        this.loading = loading
        this.scene = scene       
        this.setItems() 
        //this.createLadder()

        const axes = new AxesHelper()
        axes.position.set(0,1,0)
        this.scene.add(axes)
    }

    createLadder(){

        const totalOfStairs = 3
        for(let i = 1; i <= totalOfStairs; i++ ){

            const degraus = new Mesh(
                new BoxGeometry(2,0.3),
                new MeshToonMaterial({color:0x000})
            )

            degraus.name = "degrau"

            const axes = new BoxHelper(degraus)
            degraus.add(axes)

            degraus.position.x = -24
            degraus.position.z = 21 + (0.53*i)
            degraus.position.y = 0.2 * i

            if(i === 3){
                
                const palcoChao = new Mesh(
                    new BoxGeometry(8,0.2, 13),
                    new MeshBasicMaterial({transparent: true, opacity: 0})
                )

                palcoChao.name = "degrau"
             
    
                const chaoPalcoHelper = new BoxHelper(palcoChao)
                palcoChao.add(chaoPalcoHelper)
    
                palcoChao.position.x = -24.5
                palcoChao.position.z = 30
                palcoChao.position.y = 0.8
                
                this.scene.add(palcoChao)
                this.colliders.push(palcoChao)

                let auxChaoPalco = palcoChao.clone()
                auxChaoPalco.name = "aux_chao"
                auxChaoPalco.position.x = -24.5
                auxChaoPalco.position.z = 30
                auxChaoPalco.position.y = 0
                this.colliders.push(auxChaoPalco)
    
            }

            this.scene.add(degraus)
            this.colliders.push(degraus)
        }
    }
  
    setItems(){
       
        this.items.forEach(async (item) => {
            const obj = await this.loading.loader.loadAsync(item.path)
            obj.scene.name = item.name
            
            const axes = new BoxHelper(obj.scene)
            obj.scene.add(axes)

            if(item.isGroup){
                obj.scene.traverse((child) => {
             
                    if((child as Mesh).isMesh)
                    {
                       
                        if(child.name.includes("Cadeira")){
                            //console.log(child)
                            if(item.isCollider){
                                if(child.parent){
                                    if(child.parent.name.includes('Cadeira')){
                                        this.colliders.push(child.parent)
                                    }
                                    else{
                                        this.colliders.push(child)
                                    }

                                    // const axes = new AxesHelper()                                
                                    // child.add(axes)
                                               
                                }                              
                            }
                        }

                        if(
                            child.name.includes("Object_102") ||
                            child.name == "Object_188" ||
                            child.name == "Object_206" 
                        ){ //102 > Ruas
                            this.colliders.push(child)
                        }

                        /***
                         * 132, 4, 134> Carro
                         * 
                         */
                        if(
                            child.name == "Object_132" || 
                            child.name == "Object_4" ||
                            child.name == "Object_134"
                        ){ 
                            this.colliders.push(child)                            
                        }
                                               
                    }
                })

                obj.scene.scale.set(
                    item.scales[0],
                    item.scales[0],
                    item.scales[0]
                )

                obj.scene.position.set(
                    item.positions[0].x,
                    item.positions[0].y,
                    item.positions[0].z
                )

                this.scene.add(obj.scene) 
            }
            else{
                for(let i = 0; i < item.instances; i++){
                    let instance = obj.scene.clone()
    
                    instance.position.set(
                        item.positions[i].x, 
                        item.positions[i].y, 
                        item.positions[i].z, 
                    )
        
                    instance.scale.set(
                        item.scales[i],
                        item.scales[i],
                        item.scales[i]
                    )
        
                    instance.rotation.set(
                        item.rotations[i].x, 
                        item.rotations[i].y, 
                        item.rotations[i].z, 
                    )
        
                    this.scene.add(instance) 
                }
            }
        })
    }
    
}