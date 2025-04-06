import { Camera, Matrix4, Object3D, Vector3, Quaternion, Euler, Raycaster } from "three";
import { gui } from "./GuiControl";

export default class FollowCamera {
    
    private yaw: number = 0;
    private pitch: number = 0;
    private mousePressed = false;
    private camera: Camera;
    private offset = new Vector3(0, 4, -5.74); 
    private lookAtOffset = new Vector3(0, 2, 0);
    private isFollowWalking = true;
    private rotationSpeed = 0.006;
    private smoothFactor = 0.1; // Ajustável para suavidade

    raycaster = new Raycaster()
    
    constructor(camera: Camera) {
        this.camera = camera;
        
        document.addEventListener("mousedown", () => (this.mousePressed = true));
        document.addEventListener("mouseup", () => (this.mousePressed = false));
        
        document.addEventListener("mousemove", (e) => {
            if (this.mousePressed) {   
                this.yaw -= e.movementX * this.rotationSpeed;  
                this.pitch = Math.max(-0.2, Math.min(0.2, this.pitch - e.movementY * this.rotationSpeed));
            }         
        });


        
        const playerFolder = gui.addFolder("Follow Camera")
             
        playerFolder.add(this.offset,"x", -100, 100)
        playerFolder.add(this.offset,"y", -100, 100)
        playerFolder.add(this.offset,"z", -100, 100)
    }

    setFollowMode(walking: boolean) {
        this.isFollowWalking = walking;
        if (walking) {
            this.offset.set(0, 4, -5.74);
            this.lookAtOffset.set(0, 2, 0);
        } else {
            this.offset.set(0, 2, 1.16);
            this.lookAtOffset.set(0, 2, 0);
        }
    }

    updateCamera(target: Object3D, sceneObjects: Object3D[]) {
        // Calcular a posição da câmera com base na rotação Yaw
        const rotationMatrix = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromEuler(new Euler(
           this.pitch,
            this.yaw,
            0,
            "YXZ"
        )));
    
        const cameraOffset = this.offset.clone().applyMatrix4(rotationMatrix);
        let desiredPosition = target.position.clone().add(cameraOffset);
    
        // Raycasting para detectar obstáculos
        this.raycaster.set(target.position, desiredPosition.clone().sub(target.position).normalize());
        const intersects = this.raycaster.intersectObjects(sceneObjects, true);
    
        if (intersects.length > 0) {
            const collisionPoint = intersects[0].point;
    
            // 🟢 Mantemos a altura original da câmera para evitar ângulos estranhos
            collisionPoint.y = desiredPosition.y;  
    
            // Ajustamos a posição suavemente
            this.camera.position.lerp(collisionPoint, this.smoothFactor);
        } else {
            this.camera.position.lerp(desiredPosition, this.smoothFactor);
        }
    
        // 🔵 Garante que a câmera olhe para o jogador de forma natural
        const lookAtTarget = target.position.clone().add(this.lookAtOffset);
        this.camera.lookAt(lookAtTarget);
    }
    
}
