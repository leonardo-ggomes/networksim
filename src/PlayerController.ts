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
import { BVHCollision } from "./BVHCollision"; // ← NOVO

export default class PlayerController {
  // Referência estática — permite que Guest.ts reconstrua o BVH
  // quando um jogador remoto entra ou sai da cena
  static instance: PlayerController | null = null;

  playerImpulse = new Vector3(0, 0, 0);
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

  prevPlayerPosition = new Vector3();
  prevPlayerQuaternion = new Quaternion();

  // ── Física ───────────────────────────────────────────────────────────────
  velocityY = 0;
  gravity = -18;                  // mais forte → personagem não "flutua"
  groundSnapSpeed = 12;           // velocidade de snap suave ao chão (lerp)
  isOnGround = false;

  // ── Cápsula (visual debug) ───────────────────────────────────────────────
  playerCapsule: Mesh;
  capsuleHeight = 1.5;
  capsuleRadius = 0.3;

  // ── BVH ─────────────────────────────────────────────────────────────────
  bvh: BVHCollision;             // ← substitui checkCollision / Box3
  private bvhReady = false;

  socket = SocketManager;
  clipName = "Idle";
  actions: any = {};
  loading: Loading;
  urlAvatar: string;

  chair = "";
  lastPosition = new Vector3();
  lastClip = "";
  private lastEmitTime = 0;
  private lastQx = 0;
  private lastQy = 0;
  private lastQz = 0;
  private lastQw = 1;

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

    // ── Cápsula debug ────────────────────────────────────────────────────
    const capsuleGeometry = new CapsuleGeometry(
      this.capsuleRadius,
      this.capsuleHeight - 2 * this.capsuleRadius,
      8,
      16
    );
    const capsuleMaterial = new MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true,
      visible: false, // mude para true para debugar
    });
    this.playerCapsule = new Mesh(capsuleGeometry, capsuleMaterial);
    this.playerCapsule.position.set(0, this.capsuleHeight / 2, 0);
    this.playerModel.add(this.playerCapsule);

    // ── BVH: cria instância e aguarda colliders carregarem ───────────────
    this.bvh = new BVHCollision(scene);
    this.initBVH();

    document.addEventListener("keydown", this.onKeydown);
    document.addEventListener("keyup", this.onKeydown);
    this.actions["terminal"] = false;
    PlayerController.instance = this;
  }

  /**
   * Aguarda todos os GLTFs assíncronos carregarem antes de buildar o BVH.
   * Ajuste o delay conforme o tempo de loading da sua cena.
   */
  private async initBVH() {
    // Aguarda modelos carregarem (o setItems usa loadAsync internamente)
    await new Promise((r) => setTimeout(r, 3000));
    this.bvh.buildFromColliders(colliders);
    this.bvhReady = true;
    console.log("[PlayerController] BVH pronto.");
  }

  /**
   * Chame após carregar novos GLTFs em runtime para manter o BVH atualizado.
   */
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
    PlayerController.instance = this;
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

  /**
   * Senta o personagem na cadeira.
   * A cadeira já tem rotação correta (CHAIR_ROTATION_Y aplicado em Items.ts),
   * então apenas copiamos o quaternion dela.
   */
  toSit(chair: ChairInstance) {
    if (this.isSitting) return;
    if (!this.keyBoard["KeyF"]) return;

    // Cadeira ocupada — verifica lista do servidor (atualizada via socket chair:list)
    if (Auditorio.chairs.includes(chair.name)) {
      console.log(`[PlayerController] Cadeira "${chair.name}" já está ocupada.`);
      return;
    }

    // Segurança extra: verifica se há algum guest sentado na mesma posição
    const SEAT_RADIUS = 0.6;
    for (const obj of colliders) {
      if (!obj.name.startsWith('guest.')) continue;
      const guestPos = new Vector3();
      obj.getWorldPosition(guestPos);
      if (guestPos.distanceTo(chair.position) < SEAT_RADIUS) {
        console.log(`[PlayerController] Guest detectado na cadeira "${chair.name}".`);
        return;
      }
    }

    this.prevPlayerPosition.copy(this.playerModel.position);
    this.prevPlayerQuaternion.copy(this.playerModel.quaternion);

    setTimeout(() => {
      this.isSitting = true;
      this.followCamera.mouseMoveActived = true;

      // Copia a rotação da cadeira (já está virada para o palco)
      this.playerModel.quaternion.copy(chair.quaternion);

      this.followCamera.setFollowMode(false);

      // Posiciona o personagem levemente acima e à frente do assento
      // O offset (0, 0.17, -0.4) é no espaço LOCAL da cadeira
      const seatOffset = new Vector3(0, 0.17, 0.2)
        .applyQuaternion(chair.quaternion); // converte para world-space

      this.playerModel.position.copy(chair.position.clone().add(seatOffset));

      this.chair = chair.name;
      SocketManager.io.emit("chair:add", this.chair);
    }, 300); // reduzido de 1000ms para resposta mais rápida
  }

  /**
   * Levanta da cadeira.
   */
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

  /**
   * Verifica interações por proximidade (cadeiras e outros players).
   * Usa items.getNearestChair() que itera chairInstances internamente.
   */
  private checkInteractionByProximity() {
    const pos = this.playerModel.position;
    const INTERACT_RADIUS = 1.0; // metros — ajuste conforme o tamanho do modelo

    // ── Cadeiras ──────────────────────────────────────────────────────────────
    // getNearestChair já itera chairInstances internamente e retorna a mais próxima
    const nearestChair = this.items.getNearestChair(pos, INTERACT_RADIUS);
    if (nearestChair) {
      this.toSit(nearestChair);
      return;
    }

    // ── Outros players (guests) ───────────────────────────────────────────────
    for (const obj of colliders) {
      if (!obj.name.includes("guest.")) continue;

      const objPos = new Vector3();
      obj.getWorldPosition(objPos);

      if (pos.distanceTo(objPos) <= INTERACT_RADIUS * 1.5) {
        const id = obj.name.split(".")[1];
        this.toInteract(id);
        return;
      }
    }

    // Nenhuma colisão de interação
    othersPlayers.collideId = "";
  }

  toInteract(id: string) {
    othersPlayers.collideId = id;
  }

  /**
   * Separa o player local de guests que estejam sobrepostos.
   * Roda após a física BVH — aplica um impulso de separação suave.
   */
  private resolvePlayerCollisions() {
    const PLAYER_RADIUS = 0.45; // raio da cápsula do player em metros
    const myPos = this.playerModel.position;

    for (const obj of colliders) {
      if (!obj.name.startsWith('guest.')) continue;

      const guestPos = new Vector3();
      obj.getWorldPosition(guestPos);
      guestPos.y = myPos.y; // compara só no plano XZ

      const dist = myPos.distanceTo(guestPos);
      const minDist = PLAYER_RADIUS * 2;

      if (dist < minDist && dist > 0.001) {
        // Vetor de separação: empurra o player local para longe do guest
        const push = myPos.clone().sub(guestPos).normalize();
        const overlap = (minDist - dist) * 0.5; // divide separação entre os dois
        this.playerModel.position.addScaledVector(push, overlap);
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
    this.followCamera.updateCamera(this.playerModel, this.items.raycasterView);
    this.emitPositionIfChanged();
  }

  // ── Movimento ────────────────────────────────────────────────────────────

  private updateMovement(delta: number) {
    // ── Extrai o yaw (rotação horizontal) da câmera ───────────────────────
    // Usa a posição da câmera relativa ao player: ignora pitch completamente.
    // Isso garante que forward/right/left são sempre vetores horizontais puros,
    // independente do ângulo vertical da câmera.
    const camPos   = new Vector3();
    const modelPos = new Vector3();
    this.camera.getWorldPosition(camPos);
    this.playerModel.getWorldPosition(modelPos);

    // forward = direção do player para a câmera, projetada no plano XZ, invertida
    // (câmera fica atrás — queremos para onde o player está "olhando", não de onde a câmera vem)
    const forward = new Vector3(
      modelPos.x - camPos.x,
      0,
      modelPos.z - camPos.z
    ).normalize();

    // Se câmera estiver exatamente em cima do player (sem posição relativa),
    // fallback para getWorldDirection como antes
    if (forward.lengthSq() < 0.001) {
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
    }

    this.playerDirection.copy(forward);

    // right = rotação de -90° em Y aplicada ao forward
    // cross(forward, up) = (fz, 0, -fx) → strafe direita
    const right = new Vector3( -forward.z, 0, forward.x);
    // left  = oposto
    const left  = new Vector3(forward.z, 0,  -forward.x);

    // Quaternion de face do player (para onde ele está olhando = forward)
    const angle = Math.atan2(forward.x, forward.z);
    this.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), angle);

    const isCrouch = this.playerModel.IsTurnOnFlashlight;
    let moveInput = false;

    // ── Input ──────────────────────────────────────────────────────────────
    if (this.keyBoard["KeyW"] && !this.keyBoard["ShiftLeft"]) {
      const clip = isCrouch ? "Crouch" : "Walk";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
      this.smoothRotate(delta);
      this.playerImpulse.add(
        forward.clone().multiplyScalar(this.velocity * delta)
      );
      moveInput = true;
    } else if (this.keyBoard["KeyW"] && this.keyBoard["ShiftLeft"]) {
      const clip = isCrouch ? "CrouchRun" : "Running";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
      this.smoothRotate(delta);
      this.playerImpulse.add(
        forward.clone().multiplyScalar(this.velocity * 2.4 * delta)
      );
      moveInput = true;
    } else if (this.keyBoard["KeyS"]) {
      const clip = isCrouch ? "CrouchBack" : "Backward";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
      this.smoothRotate(delta);
      this.playerImpulse.add(
        forward.clone().multiplyScalar(-(this.velocity - 1) * delta)
      );
      moveInput = true;
    } else if (this.keyBoard["KeyA"]) {
      const clip = isCrouch ? "CrouchLeft" : "WalkLeft";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
      this.smoothRotate(delta);
      this.playerImpulse.add(
        left.clone().multiplyScalar((this.velocity - 1) * delta)
      );
      moveInput = true;
    } else if (this.keyBoard["KeyD"]) {
      const clip = isCrouch ? "CrouchRight" : "WalkRight";
      this.setAction(this.playerModel.animationsAction[clip]);
      this.clipName = clip;
      this.smoothRotate(delta);
      this.playerImpulse.add(
        right.clone().multiplyScalar((this.velocity - 1) * delta)
      );
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

    // ── Física BVH ────────────────────────────────────────────────────────
    if (!this.bvhReady) {
      // Antes do BVH estar pronto: física simples no chão = 0
      this.playerModel.position.add(this.playerImpulse);
      if (this.playerModel.position.y < 0) this.playerModel.position.y = 0;
      this.playerImpulse.set(0, 0, 0);
      return;
    }

    const candidatePos = this.playerModel.position.clone().add(this.playerImpulse);
    const moveDir = this.playerImpulse.clone().normalize();

    const result = this.bvh.check(candidatePos, moveDir);

    // ── Snap suave ao chão ─────────────────────────────────────────────
    if (result.onGround && result.groundY !== null) {
      const targetY = result.groundY + this.bvh.skinWidth;

      // Lerp suave: elimina "teleporte" dos degraus
      this.playerModel.position.y = this.lerp(
        this.playerModel.position.y,
        targetY,
        Math.min(1, this.groundSnapSpeed * delta)
      );

      this.velocityY = 0;
      this.isOnGround = true;

      // Detecta evento de palco/apresentador ao subir (substitui o nome "degrau")
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
      // Gravidade
      this.velocityY += this.gravity * delta;
      this.playerModel.position.y += this.velocityY * delta;
      this.isOnGround = false;

      // Chão de segurança
      if (this.playerModel.position.y <= 0) {
        this.playerModel.position.y = 0;
        this.velocityY = 0;
        this.isOnGround = true;
      }
    }

    // ── Movimento XZ com verificação de parede ─────────────────────────
    if (!result.wallBlocked || !moveInput) {
      this.playerModel.position.x = candidatePos.x;
      this.playerModel.position.z = candidatePos.z;
    }
    // Slide ao longo da parede (desliza em X ou Z, evita "travar")
    else {
      const slideX = this.playerModel.position
        .clone()
        .add(new Vector3(this.playerImpulse.x, 0, 0));
      const slideZ = this.playerModel.position
        .clone()
        .add(new Vector3(0, 0, this.playerImpulse.z));

      const rx = this.bvh.check(slideX, new Vector3(Math.sign(this.playerImpulse.x), 0, 0));
      const rz = this.bvh.check(slideZ, new Vector3(0, 0, Math.sign(this.playerImpulse.z)));

      if (!rx.wallBlocked) this.playerModel.position.x = slideX.x;
      if (!rz.wallBlocked) this.playerModel.position.z = slideZ.z;
    }

    this.playerImpulse.set(0, 0, 0);

    // ── Colisão com poltronas / guests (mantida por nome, sem Box3) ────
    // O BVH cuida da física; esta parte dispara interações E separação entre players.
    this.checkInteractionByProximity();
    this.resolvePlayerCollisions();
  }

  /**
   * Verifica interações por proximidade (cadeiras e outros players).
   * Muito mais leve que iterar Box3 de todos os colliders.
   */
  

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
    // Throttle: no máximo 20 emits por segundo (50ms entre cada)
    const now = performance.now();
    if (now - this.lastEmitTime < 50) return;

    const q  = this.playerModel.quaternion;
    const p  = this.playerModel.position;

    const posChanged  = p.distanceTo(this.lastPosition) > 0.02;
    const clipChanged = this.lastClip !== this.clipName;
    const rotChanged  =
      Math.abs(q.x - this.lastQx) > 0.005 ||
      Math.abs(q.y - this.lastQy) > 0.005 ||
      Math.abs(q.w - this.lastQw) > 0.005;

    if (!posChanged && !clipChanged && !rotChanged) return;

    // Envia floats com precisão reduzida (2 casas) para poupar bytes
    this.socket.io.emit("updatePosition", {
      x:    Math.fround(p.x),
      y:    Math.fround(p.y),
      z:    Math.fround(p.z),
      qx:   +q.x.toFixed(3),
      qy:   +q.y.toFixed(3),
      qz:   +q.z.toFixed(3),
      qw:   +q.w.toFixed(3),
      clip: this.clipName,
    });

    this.lastPosition.copy(p);
    this.lastClip = this.clipName;
    this.lastQx = q.x; this.lastQy = q.y;
    this.lastQz = q.z; this.lastQw = q.w;
    this.lastEmitTime = now;
  }
}