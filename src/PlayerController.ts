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

export default class PlayerController {
  static instance: PlayerController | null = null;

  playerImpulse   = new Vector3(0, 0, 0);
  playerDirection = new Vector3(0, 0, 0);
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

  prevPlayerPosition  = new Vector3();
  prevPlayerQuaternion = new Quaternion();

  // ── Física ───────────────────────────────────────────────────────────────
  velocityY       = 0;
  gravity         = -18;
  groundSnapSpeed = 12;
  isOnGround      = false;

  // ── Cápsula debug ────────────────────────────────────────────────────────
  playerCapsule: Mesh;
  capsuleHeight = 1.5;
  capsuleRadius = 0.3;

  // ── BVH ──────────────────────────────────────────────────────────────────
  bvh: BVHCollision;
  private bvhReady = false;

  socket    = SocketManager;
  clipName  = "Idle";
  actions: any = {};
  loading:  Loading;
  urlAvatar: string;

  chair        = "";
  lastPosition = new Vector3();
  lastClip     = "";
  private lastEmitTime = 0;
  private lastQx = 0;
  private lastQy = 0;
  private lastQz = 0;
  private lastQw = 1;
  private lastIsLatern = false;

  // ── Vetores reutilizáveis — zero alloc por frame ──────────────────────────
  private _camPos    = new Vector3();
  private _modelPos  = new Vector3();
  private _forward   = new Vector3();
  private _right     = new Vector3();
  private _left      = new Vector3();
  private _axisY     = new Vector3(0, 1, 0);
  private _guestPos  = new Vector3();
  private _pushVec   = new Vector3();
  private _slideX    = new Vector3();
  private _slideZ    = new Vector3();
  private _slideXDir = new Vector3();
  private _slideZDir = new Vector3();
  private _droneWorldPos = new Vector3();

  // ── Estado de palco: evita disparar CustomEvent toda frame ───────────────
  private _wasOnStage = false;

  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    items: Items,
    loading: Loading,
    urlAvatar: string
  ) {
    this.loading   = loading;
    this.urlAvatar = urlAvatar;
    this.camera    = camera;
    this.followCamera = new FollowCamera(this.camera);
    this.items = items;
    this.scene = scene;

    this.playerModel = new PlayerModel(this.loading, false, this.urlAvatar);
    this.playerModel.position.set(0, 0, 0);
    this.scene.add(this.playerModel);

    // Drone vive na Scene (não na hierarquia do player) para evitar jitter
    this.scene.add(this.playerModel.droneGroup);

    // ── Cápsula debug ────────────────────────────────────────────────────
    const capsuleGeometry = new CapsuleGeometry(
      this.capsuleRadius,
      this.capsuleHeight - 2 * this.capsuleRadius,
      8,
      16
    );
    const capsuleMaterial = new MeshBasicMaterial({
      color:     0xff0000,
      wireframe: true,
      visible:   false,
    });
    this.playerCapsule = new Mesh(capsuleGeometry, capsuleMaterial);
    this.playerCapsule.position.set(0, this.capsuleHeight / 2, 0);
    this.playerModel.add(this.playerCapsule);

    this.bvh = new BVHCollision(scene);
    this.initBVH();

    document.addEventListener("keydown", this.onKeydown);
    document.addEventListener("keyup",   this.onKeydown);
    this.actions["terminal"] = false;
    PlayerController.instance = this;
    // Expõe em window para phone.js e módulos não-TypeScript acessarem
    // phone.js busca: window.PlayerController?.instance
    (window as any).PlayerController = PlayerController;
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

    // ── Tecla L: toggle do drone holofote ─────────────────────────────────
    if (event.type === "keydown" && event.code === "KeyL") {
      const isOn = !this.playerModel.IsDroneActive;
      this.playerModel.toggleDrone(isOn);
      this.lastEmitTime = 0;
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

    if (Auditorio.chairs.includes(chair.name)) {
      console.log(`[PlayerController] Cadeira "${chair.name}" já está ocupada.`);
      return;
    }

    const SEAT_RADIUS = 0.6;
    for (const obj of colliders) {
      if (!obj.name.startsWith('guest.')) continue;
      obj.getWorldPosition(this._guestPos);
      if (this._guestPos.distanceTo(chair.position) < SEAT_RADIUS) {
        console.log(`[PlayerController] Guest detectado na cadeira "${chair.name}".`);
        return;
      }
    }

    this.prevPlayerPosition.copy(this.playerModel.position);
    this.prevPlayerQuaternion.copy(this.playerModel.quaternion);

    setTimeout(() => {
      this.isSitting = true;
      this.followCamera.mouseMoveActived = true;

      this.playerModel.quaternion.copy(chair.quaternion);
      this.followCamera.setFollowMode(false);

      const seatOffset = new Vector3(0, 0.17, 0.2)
        .applyQuaternion(chair.quaternion);

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
    const INTERACT_RADIUS = 1.0;

    const nearestChair = this.items.getNearestChair(pos, INTERACT_RADIUS);
    if (nearestChair) {
      this.toSit(nearestChair);
      return;
    }

    for (const obj of colliders) {
      if (!obj.name.includes("guest.")) continue;

      obj.getWorldPosition(this._guestPos);

      if (pos.distanceTo(this._guestPos) <= INTERACT_RADIUS * 1.5) {
        const id = obj.name.split(".")[1];
        this.toInteract(id);
        return;
      }
    }

    othersPlayers.collideId = "";
  }

  toInteract(id: string) {
    othersPlayers.collideId = id;
  }

  private resolvePlayerCollisions() {
    const PLAYER_RADIUS = 0.45;
    const myPos = this.playerModel.position;

    for (const obj of colliders) {
      if (!obj.name.startsWith('guest.')) continue;

      obj.getWorldPosition(this._guestPos);
      this._guestPos.y = myPos.y;

      const dist    = myPos.distanceTo(this._guestPos);
      const minDist = PLAYER_RADIUS * 2;

      if (dist < minDist && dist > 0.001) {
        this._pushVec.subVectors(myPos, this._guestPos).normalize();
        this.playerModel.position.addScaledVector(this._pushVec, (minDist - dist) * 0.5);
      }
    }
  }

  // ── Update principal ─────────────────────────────────────────────────────

  update(delta: number) {
    if (this.isSitting) {
      this.updateSitting();
    } else {
      this.updateMovement(delta);
    }

    this.playerModel.update(delta);

    // Drone: lerp suave sem alloc — reutiliza _droneWorldPos
    if (this.playerModel.IsDroneActive) {
      this._droneWorldPos.copy(this.playerModel.position);
      this.playerModel.updateDrone(delta, this._droneWorldPos);
    }

    this.followCamera.updateCamera(this.playerModel, this.items.raycasterView, delta);
    this.emitPositionIfChanged();
  }

  // ── Movimento ────────────────────────────────────────────────────────────

  private updateMovement(delta: number) {
    // Reutiliza vetores pré-alocados — sem new Vector3() por frame
    this.camera.getWorldPosition(this._camPos);
    this.playerModel.getWorldPosition(this._modelPos);

    this._forward.set(
      this._modelPos.x - this._camPos.x,
      0,
      this._modelPos.z - this._camPos.z
    ).normalize();

    if (this._forward.lengthSq() < 0.001) {
      this.camera.getWorldDirection(this._forward);
      this._forward.y = 0;
      this._forward.normalize();
    }

    this.playerDirection.copy(this._forward);

    this._right.set(-this._forward.z, 0,  this._forward.x);
    this._left.set( this._forward.z,  0, -this._forward.x);

    const angle = Math.atan2(this._forward.x, this._forward.z);
    this.quaternion.setFromAxisAngle(this._axisY, angle);

    let moveInput = false;

    // ── Input ──────────────────────────────────────────────────────────────
    if (this.keyBoard["KeyW"] && !this.keyBoard["ShiftLeft"]) {
      this.setAction(this.playerModel.animationsAction["Walk"]);
      this.clipName = "Walk";
      this.smoothRotate(delta);
      this.playerImpulse.addScaledVector(this._forward, this.velocity * delta);
      moveInput = true;
    } else if (this.keyBoard["KeyW"] && this.keyBoard["ShiftLeft"]) {
      this.setAction(this.playerModel.animationsAction["Running"]);
      this.clipName = "Running";
      this.smoothRotate(delta);
      this.playerImpulse.addScaledVector(this._forward, this.velocity * 2.4 * delta);
      moveInput = true;
    } else if (this.keyBoard["KeyS"]) {
      this.setAction(this.playerModel.animationsAction["Backward"]);
      this.clipName = "Backward";
      this.smoothRotate(delta);
      this.playerImpulse.addScaledVector(this._forward, -(this.velocity - 1) * delta);
      moveInput = true;
    } else if (this.keyBoard["KeyA"]) {
      this.setAction(this.playerModel.animationsAction["WalkLeft"]);
      this.clipName = "WalkLeft";
      this.smoothRotate(delta);
      this.playerImpulse.addScaledVector(this._left, (this.velocity - 1) * delta);
      moveInput = true;
    } else if (this.keyBoard["KeyD"]) {
      this.setAction(this.playerModel.animationsAction["WalkRight"]);
      this.clipName = "WalkRight";
      this.smoothRotate(delta);
      this.playerImpulse.addScaledVector(this._right, (this.velocity - 1) * delta);
      moveInput = true;
    } else if (this.keyBoard["KeyV"]) {
      this.setAction(this.playerModel.animationsAction["Waving"]);
      this.clipName = "Waving";
    } else {
      this.setAction(this.playerModel.animationsAction["Idle"]);
      this.clipName = "Idle";
    }

    // ── Física BVH ────────────────────────────────────────────────────────
    if (!this.bvhReady) {
      this.playerModel.position.add(this.playerImpulse);
      if (this.playerModel.position.y < 0) this.playerModel.position.y = 0;
      this.playerImpulse.set(0, 0, 0);
      return;
    }

    // candidatePos reutiliza _slideX temporariamente para evitar alloc
    const candidatePos = this._slideX.copy(this.playerModel.position).add(this.playerImpulse);
    const moveDir      = this.playerImpulse.clone().normalize(); // necessário para BVH

    const result = this.bvh.check(candidatePos, moveDir);

    // ── Snap suave ao chão ─────────────────────────────────────────────
    if (result.onGround && result.groundY !== null) {
      const targetY = result.groundY + this.bvh.skinWidth;

      this.playerModel.position.y = this.lerp(
        this.playerModel.position.y,
        targetY,
        Math.min(1, this.groundSnapSpeed * delta)
      );

      this.velocityY  = 0;
      this.isOnGround = true;

      // Dispara evento de palco apenas quando o estado MUDA — não toda frame
      const onStage = targetY > 0.5;
      if (onStage !== this._wasOnStage) {
        this._wasOnStage = onStage;
        const isPresenter = infoPlayer.role === roles.PRESENTER || infoPlayer.role === roles.ADMIN;
        if (isPresenter) {
          eventEmitter.dispatchEvent(new CustomEvent("init_micro", { detail: onStage }));
        }
        if (!onStage) othersPlayers.collideId = "";
      }
    } else {
      this.velocityY += this.gravity * delta;
      this.playerModel.position.y += this.velocityY * delta;
      this.isOnGround = false;

      if (this.playerModel.position.y <= 0) {
        this.playerModel.position.y = 0;
        this.velocityY  = 0;
        this.isOnGround = true;
      }
    }

    // ── Movimento XZ com verificação de parede ─────────────────────────
    if (!result.wallBlocked || !moveInput) {
      this.playerModel.position.x = candidatePos.x;
      this.playerModel.position.z = candidatePos.z;
    } else {
      // Slide: testa X e Z separadamente para deslizar ao longo de paredes.
      //
      // CORREÇÃO lateral de palco:
      // Se wallBlocked=true E o groundY está ACIMA do player (lateral de plataforma),
      // bloqueamos o slide inteiro — o player não deve atravessar a lateral.
      // Só permitimos o slide quando a parede é vertical real (sem superfície
      // acima acessível), não a borda de uma plataforma.
      const platformTop  = result.groundY ?? 0;
      const playerY      = this.playerModel.position.y;
      const platformAbove = result.groundY !== null && platformTop > playerY + this.bvh.skinWidth * 2;

      if (platformAbove) {
        // Player está na lateral de uma plataforma/palco — não desliza
        // O snap de Y vai subindo o player gradualmente pelo groundY
        // conforme ele se aproxima pela escada ou rampa lateral
      } else {
        // Parede vertical normal — permite slide em X ou Z
        this._slideX.copy(this.playerModel.position);
        this._slideX.x += this.playerImpulse.x;
        this._slideZ.copy(this.playerModel.position);
        this._slideZ.z += this.playerImpulse.z;

        this._slideXDir.set(Math.sign(this.playerImpulse.x), 0, 0);
        this._slideZDir.set(0, 0, Math.sign(this.playerImpulse.z));

        const rx = this.bvh.check(this._slideX, this._slideXDir);
        const rz = this.bvh.check(this._slideZ, this._slideZDir);

        if (!rx.wallBlocked) this.playerModel.position.x = this._slideX.x;
        if (!rz.wallBlocked) this.playerModel.position.z = this._slideZ.z;
      }
    }

    this.playerImpulse.set(0, 0, 0);

    this.checkInteractionByProximity();
    this.resolvePlayerCollisions();
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
    const now = performance.now();
    if (now - this.lastEmitTime < 50) return;

    const q = this.playerModel.quaternion;
    const p = this.playerModel.position;

    const posChanged   = p.distanceTo(this.lastPosition) > 0.02;
    const clipChanged  = this.lastClip !== this.clipName;
    const rotChanged   =
      Math.abs(q.x - this.lastQx) > 0.005 ||
      Math.abs(q.y - this.lastQy) > 0.005 ||
      Math.abs(q.w - this.lastQw) > 0.005;
    const laternChanged = this.playerModel.IsDroneActive !== this.lastIsLatern;

    if (!posChanged && !clipChanged && !rotChanged && !laternChanged) return;

    this.socket.io.emit("updatePosition", {
      x:       Math.fround(p.x),
      y:       Math.fround(p.y),
      z:       Math.fround(p.z),
      qx:      +q.x.toFixed(3),
      qy:      +q.y.toFixed(3),
      qz:      +q.z.toFixed(3),
      qw:      +q.w.toFixed(3),
      clip:    this.clipName,
      isLatern: this.playerModel.IsDroneActive,
    });

    this.lastPosition.copy(p);
    this.lastClip = this.clipName;
    this.lastQx = q.x; this.lastQy = q.y;
    this.lastQz = q.z; this.lastQw = q.w;
    this.lastIsLatern = this.playerModel.IsDroneActive;
    this.lastEmitTime = now;
  }
}