import {
  AnimationAction,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  Mesh,
  MeshBasicMaterial,
  CapsuleGeometry,
} from "three";
import FollowCamera from "./FollowCamera";
import PlayerModel from "./PlayerModel";
import SocketManager from "./SocketManager";
import elementos, { eventEmitter } from "./Actions";
import Loading from "./Loading";
import { Auditorio, infoPlayer, othersPlayers, roles } from "./InfoPlayer";
import Items, { ChairInstance } from "./Items";
import { colliders } from "./Colliders";
import { BVHCollision } from "./BVHCollision";

// Eixo Y global — reutilizado para evitar alocações
const UP = new Vector3(0, 1, 0);

export default class PlayerController {
  playerImpulse = new Vector3(0, 0, 0);
  playerDirection = new Vector3(0, 0, 0); // forward (câmera, sem Y)
  playerModel: PlayerModel;
  keyBoard: any = {};
  camera: PerspectiveCamera;
  velocity = 3;
  followCamera: FollowCamera;
  quaternion = new Quaternion();
  activedClip?: AnimationAction;
  items: Items;
  scene: Scene;

  isSitting = false;

  prevPlayerPosition = new Vector3();
  prevPlayerQuaternion = new Quaternion();

  // ── Física ───────────────────────────────────────────────────────────────
  velocityY = 0;
  gravity = -18;
  groundSnapSpeed = 12;
  isOnGround = false;

  // ── Cápsula (visual debug) ───────────────────────────────────────────────
  playerCapsule: Mesh;
  capsuleHeight = 1.5;
  capsuleRadius = 0.3;

  // ── BVH ─────────────────────────────────────────────────────────────────
  bvh: BVHCollision;
  private bvhReady = false;

  socket = SocketManager;
  clipName = "Idle";
  actions: any = {};
  loading: Loading;
  urlAvatar: string;

  chair = "";
  lastPosition = new Vector3();
  lastClip = "";

  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    items: Items,
    loading: Loading,
    urlAvatar: string
  ) {
    this.loading = loading;
    this.urlAvatar = urlAvatar;
    this.camera = camera;
    this.followCamera = new FollowCamera(this.camera);
    this.items = items;
    this.scene = scene;

    this.playerModel = new PlayerModel(this.loading, false, this.urlAvatar);
    this.playerModel.position.set(0, 0, 0);
    this.scene.add(this.playerModel);

    const capsuleGeometry = new CapsuleGeometry(
      this.capsuleRadius,
      this.capsuleHeight - 2 * this.capsuleRadius,
      8,
      16
    );
    const capsuleMaterial = new MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true,
      visible: false,
    });
    this.playerCapsule = new Mesh(capsuleGeometry, capsuleMaterial);
    this.playerCapsule.position.set(0, this.capsuleHeight / 2, 0);
    this.playerModel.add(this.playerCapsule);

    this.bvh = new BVHCollision(scene);
    this.initBVH();

    document.addEventListener("keydown", this.onKeydown);
    document.addEventListener("keyup", this.onKeydown);
    this.actions["terminal"] = false;
  }

  private async initBVH() {
    await new Promise((r) => setTimeout(r, 3000));
    this.bvh.buildFromColliders(colliders);
    this.bvhReady = true;
    console.log("[PlayerController] BVH pronto.");
  }

  refreshBVH() {
    this.bvh.rebuild(colliders);
  }

  // ── Teclado ──────────────────────────────────────────────────────────────

  onKeydown = (e: KeyboardEvent) => {
    this.keyBoard[e.code] = e.type === "keydown";
    this.callAction(e);
  };

  callAction(event: KeyboardEvent) {
    if (this.keyBoard["KeyT"]) {
      if (!this.actions["terminal"] && infoPlayer.hasTerminal) {
        event.preventDefault();
        elementos.showTerminal();
        this.actions["terminal"] = true;
      } else {
        elementos.hideTerminal();
        this.actions["terminal"] = false;
      }
    }
  }

  // ── Animações ────────────────────────────────────────────────────────────

  setAction(action: AnimationAction) {
    if (action !== this.activedClip) {
      if (this.activedClip === this.playerModel.animationsAction["Sitting"]) {
        this.activedClip?.fadeOut(0);
      } else {
        this.activedClip?.fadeOut(0.2);
      }

      if (action === this.playerModel.animationsAction["Sitting"]) {
        this.activedClip?.fadeOut(0);
        action.reset().play();
      } else {
        action.reset().fadeIn(0.1).play();
      }

      this.activedClip = action;
    }
  }

  // ── Cadeira ──────────────────────────────────────────────────────────────

  toSit(chair: ChairInstance) {
    if (this.isSitting) return;
    if (!this.keyBoard["KeyF"]) return;
    if (Auditorio.chairs.includes(chair.name)) return; // cadeira ocupada no servidor

    this.prevPlayerPosition.copy(this.playerModel.position);
    this.prevPlayerQuaternion.copy(this.playerModel.quaternion);

    setTimeout(() => {
      this.isSitting = true;
      this.followCamera.mouseMoveActived = true;

      // Copia a rotação da cadeira (já está virada para o palco)
      this.playerModel.quaternion.copy(chair.quaternion);
      this.followCamera.setFollowMode(false);

      // Offset no espaço local da cadeira → world space
      const seatOffset = new Vector3(0, 0.17, 0.2).applyQuaternion(chair.quaternion);
      this.playerModel.position.copy(chair.position.clone().add(seatOffset));

      this.chair = chair.name;
      SocketManager.io.emit("chair:add", this.chair);
    }, 300);
  }

  private leaveSit() {
    setTimeout(() => {
      this.isSitting = false;
      this.followCamera.mouseMoveActived = false;
      this.playerModel.position.copy(this.prevPlayerPosition);
      this.playerModel.quaternion.copy(this.prevPlayerQuaternion);
      this.followCamera.setFollowMode(true);
      SocketManager.io.emit("chair:remove", this.chair);
      this.chair = "";
    }, 300);
  }

  private checkInteractionByProximity() {
    const pos = this.playerModel.position;

    // Cadeira mais próxima — O(n) mas sem alocar objetos
    const nearestChair = this.items.getNearestChair(pos, 1.0);
    if (nearestChair) {
      this.toSit(nearestChair);
      return;
    }

    // Outros players (guests)
    for (const obj of colliders) {
      if (!obj.name.includes("guest.")) continue;
      const objPos = new Vector3();
      obj.getWorldPosition(objPos);
      if (pos.distanceTo(objPos) <= 1.5) {
        this.toInteract(obj.name.split(".")[1]);
        return;
      }
    }

    othersPlayers.collideId = "";
  }

  toInteract(id: string) {
    othersPlayers.collideId = id;
  }

  // ── Update principal ─────────────────────────────────────────────────────

  update(delta: number) {
    if (this.isSitting) {
      this.updateSitting();
    } else {
      this.updateMovement(delta);
    }

    this.playerModel.update(delta);
    this.followCamera.updateCamera(this.playerModel, this.items.raycasterView);
    this.emitPositionIfChanged();
  }

  // ── Movimento ────────────────────────────────────────────────────────────

  private updateMovement(delta: number) {

    // ── Vetores de direção derivados da câmera ──────────────────────────────
    //
    //   forward  =  direção para onde a câmera aponta, projetada no plano XZ
    //   right    =  forward × UP  (produto vetorial)
    //               → sempre perpendicular ao forward,
    //                 independente de qualquer rotação da câmera
    //   left     =  −right
    //
    //   Regra de ouro: NUNCA troque os componentes X/Z manualmente.
    //   Use sempre crossVectors — é a única forma correta de calcular
    //   a direção lateral no espaço 3D.

    this.camera.getWorldDirection(this.playerDirection);
    this.playerDirection.y = 0;
    this.playerDirection.normalize();

    //  right = forward × UP
    //  Em Three.js com Y para cima: right = ( fz, 0, −fx )
    const right = new Vector3().crossVectors(this.playerDirection, UP).normalize();

    // Quaternion alvo: personagem vira para onde a câmera aponta
    const angle = Math.atan2(this.playerDirection.x, this.playerDirection.z);
    this.quaternion.setFromAxisAngle(UP, angle);

    const isCrouch = this.playerModel.IsTurnOnFlashlight;
    let moveInput = false;

    // ── Input ───────────────────────────────────────────────────────────────

    if (this.keyBoard["KeyW"] && !this.keyBoard["ShiftLeft"]) {
      const clip = isCrouch ? "Crouch" : "Walk";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
      this.smoothRotate(delta);
      this.playerImpulse.addScaledVector(this.playerDirection, this.velocity * delta);
      moveInput = true;

    } else if (this.keyBoard["KeyW"] && this.keyBoard["ShiftLeft"]) {
      const clip = isCrouch ? "CrouchRun" : "Running";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
      this.smoothRotate(delta);
      this.playerImpulse.addScaledVector(this.playerDirection, this.velocity * 2.4 * delta);
      moveInput = true;

    } else if (this.keyBoard["KeyS"]) {
      const clip = isCrouch ? "CrouchBack" : "Backward";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
      this.smoothRotate(delta);
      // Backward = −forward
      this.playerImpulse.addScaledVector(this.playerDirection, -(this.velocity - 1) * delta);
      moveInput = true;

    } else if (this.keyBoard["KeyA"]) {
      const clip = isCrouch ? "CrouchLeft" : "WalkLeft";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
      this.smoothRotate(delta);
      // Strafe esquerda = −right  (sempre correto independente da câmera)
      this.playerImpulse.addScaledVector(right, -(this.velocity - 1) * delta);
      moveInput = true;

    } else if (this.keyBoard["KeyD"]) {
      const clip = isCrouch ? "CrouchRight" : "WalkRight";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
      this.smoothRotate(delta);
      // Strafe direita = +right  (sempre correto independente da câmera)
      this.playerImpulse.addScaledVector(right, (this.velocity - 1) * delta);
      moveInput = true;

    } else if (this.keyBoard["KeyV"]) {
      this.playerModel.turnFlashlight(false);
      this.setAction(this.playerModel.animationsAction["Waving"]);
      this.clipName = "Waving";

    } else {
      const clip = isCrouch ? "CrouchIdle" : "Idle";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
    }

    // ── Física BVH ──────────────────────────────────────────────────────────

    if (!this.bvhReady) {
      this.playerModel.position.add(this.playerImpulse);
      if (this.playerModel.position.y < 0) this.playerModel.position.y = 0;
      this.playerImpulse.set(0, 0, 0);
      return;
    }

    const candidatePos = this.playerModel.position.clone().add(this.playerImpulse);
    const moveDir = this.playerImpulse.clone().normalize();

    const result = this.bvh.check(candidatePos, moveDir);

    // ── Y: snap suave ao chão ────────────────────────────────────────────────
    if (result.onGround && result.groundY !== null) {
      const targetY = result.groundY + this.bvh.skinWidth;
      this.playerModel.position.y = this.lerp(
        this.playerModel.position.y,
        targetY,
        Math.min(1, this.groundSnapSpeed * delta)
      );
      this.velocityY = 0;
      this.isOnGround = true;

      if (targetY > 0.5) {
        if (infoPlayer.role === roles.PRESENTER || infoPlayer.role === roles.ADMIN) {
          eventEmitter.dispatchEvent(new CustomEvent("init_micro", { detail: true }));
        }
      } else {
        othersPlayers.collideId = "";
        if (infoPlayer.role === roles.PRESENTER || infoPlayer.role === roles.ADMIN) {
          eventEmitter.dispatchEvent(new CustomEvent("init_micro", { detail: false }));
        }
      }
    } else {
      this.velocityY += this.gravity * delta;
      this.playerModel.position.y += this.velocityY * delta;
      this.isOnGround = false;

      if (this.playerModel.position.y <= 0) {
        this.playerModel.position.y = 0;
        this.velocityY = 0;
        this.isOnGround = true;
      }
    }

    // ── XZ: movimento ou wall-slide ──────────────────────────────────────────
    if (!result.wallBlocked || !moveInput) {
      this.playerModel.position.x = candidatePos.x;
      this.playerModel.position.z = candidatePos.z;
    } else {
      const slideX = this.playerModel.position.clone().add(new Vector3(this.playerImpulse.x, 0, 0));
      const slideZ = this.playerModel.position.clone().add(new Vector3(0, 0, this.playerImpulse.z));

      const rx = this.bvh.check(slideX, new Vector3(Math.sign(this.playerImpulse.x), 0, 0));
      const rz = this.bvh.check(slideZ, new Vector3(0, 0, Math.sign(this.playerImpulse.z)));

      if (!rx.wallBlocked) this.playerModel.position.x = slideX.x;
      if (!rz.wallBlocked) this.playerModel.position.z = slideZ.z;
    }

    this.playerImpulse.set(0, 0, 0);
    this.checkInteractionByProximity();
  }

  private updateSitting() {
    this.setAction(this.playerModel.animationsAction["Sitting"]);
    this.clipName = "Sitting";
    if (this.keyBoard["KeyF"]) {
      this.leaveSit();
    }
  }

  private smoothRotate(delta: number) {
    this.playerModel.quaternion.slerpQuaternions(
      this.playerModel.quaternion,
      this.quaternion,
      delta * 4
    );
  }

  private lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  private emitPositionIfChanged() {
    if (
      this.playerModel.position.distanceTo(this.lastPosition) > 0.2 ||
      this.lastClip !== this.clipName
    ) {
      this.socket.io.emit("updatePosition", {
        x: this.playerModel.position.x,
        y: this.playerModel.position.y,
        z: this.playerModel.position.z,
        qx: this.playerModel.quaternion.x,
        qy: this.playerModel.quaternion.y,
        qz: this.playerModel.quaternion.z,
        qw: this.playerModel.quaternion.w,
        clip: this.clipName,
        visible: true,
      });
      this.lastPosition.copy(this.playerModel.position);
      this.lastClip = this.clipName;
    }
  }
}