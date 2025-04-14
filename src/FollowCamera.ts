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
    
    mouseMoveActived = false
    raycaster = new Raycaster()
    
    constructor(camera: Camera) {
        this.camera = camera;
        
        document.addEventListener("mousedown", () => (this.mousePressed = true));
        document.addEventListener("mouseup", () => (this.mousePressed = false));
        
        document.addEventListener("mousemove", (e) => {
            if (this.mousePressed || this.mouseMoveActived) {   
                this.yaw -= e.movementX * this.rotationSpeed;  
                this.pitch = Math.max(-0.2, Math.min(0.2, this.pitch - e.movementY * this.rotationSpeed));
            }         
        });


        
        // const playerFolder = gui.addFolder("Follow Camera")
             
        // playerFolder.add(this.offset,"x", -100, 100)
        // playerFolder.add(this.offset,"y", -100, 100)
        // playerFolder.add(this.offset,"z", -100, 100)
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
        const rotationMatrix = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromEuler(
            new Euler(this.pitch, this.yaw, 0, "YXZ")
        ));
    
        const cameraOffset = this.offset.clone().applyMatrix4(rotationMatrix);
        const desiredPosition = target.position.clone().add(cameraOffset);
    
        const origin = target.position.clone().add(new Vector3(0, 1.5, 0)); // evita chão
        const direction = desiredPosition.clone().sub(origin).normalize();
        const distance = desiredPosition.distanceTo(origin);
    
        this.raycaster.set(origin, direction);
        this.raycaster.far = distance;
    
        const intersects = this.raycaster.intersectObjects(sceneObjects, true);
    
        let finalPosition = desiredPosition;
    
        if (intersects.length > 0) {
            const collisionPoint = intersects[0].point;
            collisionPoint.y = desiredPosition.y; // mantém altura
            finalPosition = collisionPoint;
        }
    
        // 🟢 A câmera continua se movendo a cada frame, mesmo colidida
        this.camera.position.lerp(finalPosition, this.smoothFactor);
    
        const lookAtTarget = target.position.clone().add(this.lookAtOffset);
        this.camera.lookAt(lookAtTarget);
    }
    
}
