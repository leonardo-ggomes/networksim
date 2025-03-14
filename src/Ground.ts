import { Mesh,  MeshBasicMaterial,  PlaneGeometry, RepeatWrapping, TextureLoader } from "three"

export default class Ground extends Mesh{  

    constructor()
    {   

        const textureLoader = new TextureLoader()
        const floorMap = textureLoader.load("textures/floor/laminate_floor_02_diff_1k.jpg")
       
        floorMap.wrapS =  floorMap.wrapT = RepeatWrapping;    
        floorMap.repeat.set(50, 50);

        const geometry = new PlaneGeometry(100,100)
        const material = new MeshBasicMaterial({              
            map: floorMap      
        })

        super(geometry, material)    

        this.rotation.x = -Math.PI / 2;
    }
}