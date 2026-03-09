import { Camera, Matrix4, Object3D, Vector3, Quaternion, Euler, Raycaster } from "three";

export default class FollowCamera {

    private yaw:   number = 0;
    private pitch: number = 0;
    private mousePressed   = false;
    private camera: Camera;
    private offset         = new Vector3(0, 4, -5.74);
    private lookAtOffset   = new Vector3(0, 2, 0);
    private isFollowWalking = true;
    private rotationSpeed   = 0.006;

    // ── Câmera suave: velocidade de follow em "unidades de decaimento" ────────
    // Valor mais alto = câmera mais apertada (menos lag)
    // Ex: 8 → lag mínimo mas suave; 4 → câmera mais "flutuante"
    private followSpeed = 8;

    mouseMoveActived = false;
    raycaster = new Raycaster();

    // ── Reutilizáveis — zero alloc por frame ──────────────────────────────────
    private _rotationMatrix  = new Matrix4();
    private _quat            = new Quaternion();
    private _euler           = new Euler();
    private _cameraOffset    = new Vector3();
    private _desiredPosition = new Vector3();
    private _origin          = new Vector3();
    private _direction       = new Vector3();
    private _lookAtTarget    = new Vector3();
    private _up              = new Vector3(0, 1, 0);

    constructor(camera: Camera) {
        this.camera = camera;

        const uiOpen = () => !!document.getElementById("framescreen");

        document.addEventListener("mousedown", () => {
            if (uiOpen()) return;
            this.mousePressed = true;
        });
        document.addEventListener("mouseup", () => (this.mousePressed = false));

        document.addEventListener("mousemove", (e) => {
            if (uiOpen()) { this.mousePressed = false; return; }
            if (this.mousePressed || this.mouseMoveActived) {
                this.yaw   -= e.movementX * this.rotationSpeed;
                this.pitch  = Math.max(-0.2, Math.min(0.2, this.pitch - e.movementY * this.rotationSpeed));
            }
        });
    }

    setFollowMode(walking: boolean) {
        this.isFollowWalking = walking;
        if (walking) {
            this.offset.set(0, 4, -5.74);
            this.lookAtOffset.set(0, 2, 0);
        } else {
            this.offset.set(0, 1.8, -1.2);
            this.lookAtOffset.set(0, 1.6, 0);
        }
    }

    /**
     * delta é obrigatório para o exp-decay ser framerate-independent.
     * O smoothFactor antigo (0.1 fixo) causava jitter em framerates variáveis.
     */
    updateCamera(target: Object3D, sceneObjects: Object3D[], delta = 1 / 60) {
        // Reutiliza _quat e _euler sem alocar
        this._euler.set(this.pitch, this.yaw, 0, "YXZ");
        this._quat.setFromEuler(this._euler);
        this._rotationMatrix.makeRotationFromQuaternion(this._quat);

        // Offset rotacionado
        this._cameraOffset.copy(this.offset).applyMatrix4(this._rotationMatrix);
        this._desiredPosition.copy(target.position).add(this._cameraOffset);

        // Raycaster de oclusão
        this._origin.copy(target.position).add(this._up.clone().multiplyScalar(1.5));
        this._direction.subVectors(this._desiredPosition, this._origin).normalize();
        const distance = this._desiredPosition.distanceTo(this._origin);

        this.raycaster.set(this._origin, this._direction);
        this.raycaster.far = distance;

        const intersects = this.raycaster.intersectObjects(sceneObjects, true);
        let finalPosition = this._desiredPosition;

        if (intersects.length > 0) {
            const cp = intersects[0].point;
            cp.y = this._desiredPosition.y;
            finalPosition = cp;
        }

        // ── exp-decay lerp: framerate-independent, sem jitter ─────────────
        // Substitui o antigo .lerp(pos, 0.1) que causava trepidação
        const alpha = 1 - Math.exp(-this.followSpeed * delta);
        this.camera.position.lerp(finalPosition, alpha);

        this._lookAtTarget.copy(target.position).add(this.lookAtOffset);
        this.camera.lookAt(this._lookAtTarget);
    }
}