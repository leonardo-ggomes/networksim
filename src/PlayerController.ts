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
  Box3,
  Raycaster,
  PointLight,
  SpotLight
} from "three";
import FollowCamera from "./FollowCamera";
import PlayerModel from "./PlayerModel";
import { Octree } from "three/examples/jsm/math/Octree.js";
import Items from "./Items";
import SocketManager from "./SocketManager";
import elementos from "./Actions";
import Loading from "./Loading";
import { infoPlayer } from "./InfoPlayer";

export default class PlayerController {
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
  octree: Octree;
  scene: Scene

  isSitting = false;
  isCollided = false
  isFloor = true

  prevPlayerPosition = new Vector3();
  prevPlayerQuaternion = new Quaternion();

  velocityY = 0
  gravity = -9.81
  raycaster = new Raycaster()
  downVector = new Vector3(0, -1, 0);

  //Adicionando cápsula para colisão
  playerCapsule: Mesh;
  capsuleHeight = 1.5; // altura da cápsula
  capsuleRadius = 0.3; // raio da cápsula
  socket = SocketManager
  clipName = "Idle"

  //Ações
  actions: any = {}

  //Carregamento
  loading: Loading

  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    octree: Octree,
    items: Items,
    loading: Loading
  ) {
    this.loading = loading
    this.camera = camera;
    this.followCamera = new FollowCamera(this.camera);
    this.octree = octree;
    this.items = items;
    this.scene = scene;

    this.playerModel = new PlayerModel(this.loading);
    this.playerModel.position.set(0, 0, 0);
    this.scene.add(this.playerModel);

    //Criando cápsula para representar o bounding volume do jogador
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
    }); // Wireframe para debug
    this.playerCapsule = new Mesh(capsuleGeometry, capsuleMaterial);

    //Posicionando a cápsula no jogador
    this.playerCapsule.position.set(0, this.capsuleHeight / 2, 0); // Ajustando a altura da cápsula
    this.playerModel.add(this.playerCapsule); // Adiciona a cápsula como parte do modelo do jogador

    //Escutando o teclado
    document.addEventListener("keydown", this.onKeydown);
    document.addEventListener("keyup", this.onKeydown);

    this.actions['terminal'] = false
  }

  onKeydown = (e: KeyboardEvent) => {
    this.keyBoard[e.code] = e.type === 'keydown';
    this.callAction(e)
  };

  callAction(event: KeyboardEvent) {

    if (this.keyBoard["KeyT"]) {
      if (!this.actions['terminal'] && infoPlayer.hasTerminal) {
        event.preventDefault();
        elementos.showTerminal()
        this.actions['terminal'] = true
      }
      else {
        elementos.hideTerminal()
        this.actions['terminal'] = false
      }
    }
    else if (this.keyBoard["KeyL"] && infoPlayer.hasFlashlight) { //Liga a laterna
      this.playerModel.turnFlashlight(!this.playerModel.IsTurnOnFlashlight)
    }

  }

  setAction(action: AnimationAction) {
    if (action != this.activedClip) {
      switch (action) {
        case this.playerModel.animationsAction["Sitting"]:
          this.activedClip?.fadeOut(0);
          action.reset().play();
          break;
        default:

          if (this.activedClip == this.playerModel.animationsAction["Sitting"]) {
            this.activedClip?.fadeOut(0);
          }
          else {
            this.activedClip?.fadeOut(0.2);
          }

          action.reset().fadeIn(0.1).play();
      }
      this.activedClip = action;
    }
  }

  checkCollision(newPosition: Vector3): boolean {
    // Novo: Calculando a posição da cápsula do jogador  
    const playerCapsuleTop = newPosition
      .clone()
      .add(new Vector3(0, this.capsuleHeight / 6, 0));

    let isColliding = false;

    // Verificar a colisão com cada objeto
    this.items.colliders.forEach((obj) => {

      const objectBoundingBox = new Box3().setFromObject(obj);

      // Novo: Verificando colisão entre a cápsula e a caixa de cada objeto
      if (this.checkCapsuleCollisionWithBox(playerCapsuleTop, this.capsuleRadius, objectBoundingBox)) {
        isColliding = true;
        console.log(obj.name)
        if (obj.name == "degrau") {
          this.upStair(obj)
          this.isFloor = false
        }
        else if (obj.name.includes("Object_102")) {
          this.goUpStreet(obj)
          this.isFloor = false
        }
        else {
          this.toSit(obj);
          this.isFloor = true
        }
      }

    });

    return isColliding;
  }

  goUpStreet(obj: Object3D) {
    const origin = new Vector3(this.playerModel.position.x, this.playerModel.position.y + 2, this.playerModel.position.z);

    this.raycaster.set(
      origin,
      this.downVector
    )

    const intersects = this.raycaster.intersectObject(obj, true); // true para checar filhos

    if (intersects.length > 0) {
      // Obter o primeiro ponto de colisão (mais próximo)
      const groundY = intersects[0].point.y;

      // Ajustar a posição do personagem para ficar sobre o solo
      this.playerModel.position.y = groundY + 0.1; // 0.5 é um ajuste para não ficar "afundado"
    }
  }

  checkCapsuleCollisionWithBox(
    capsuleTop: Vector3,
    capsuleRadius: number,
    box: Box3
  ): boolean {
    // Novo: Colisão cápsula vs caixa
    const closestPoint = new Vector3();
    box.clampPoint(capsuleTop, closestPoint);
    const distanceSquared = closestPoint.distanceToSquared(capsuleTop);
    return distanceSquared <= capsuleRadius * capsuleRadius;
  }

  toSit(obj: Object3D) {
    if (obj.name.includes("poltrona")) {
      if (!this.isSitting && this.keyBoard["KeyF"]) {
        this.prevPlayerPosition.copy(this.playerModel.position);
        this.prevPlayerQuaternion.copy(this.playerModel.quaternion);

        setTimeout(() => {
          this.isSitting = true;
          this.followCamera.mouseMoveActived = true
          const direction = new Vector3();
          obj.getWorldDirection(direction);

          this.playerModel.quaternion.copy(obj.quaternion);

          this.followCamera.setFollowMode(false)
          this.playerModel.position.copy(
            obj.position.clone().add(new Vector3(0, .17, -.4))
          );

          // this.playerModel.rotation.x = -1.5707963267949;
          this.playerModel.rotation.y = -Math.PI;



          // this.playerModel.rotation.z == 0 &&
          //   (this.playerModel.rotation.z = -Math.PI / 2);

          // if (Math.sign(obj.rotation.y) != -1) {          
          //   this.playerModel.rotation.z = Math.PI / 2;            
          // }


        }, 1000);
      }
    }
  }

  upStair(degrau: Object3D) {
    this.playerModel.position.y = degrau.position.y + 0.78
  }

  lerp(a: number, b: number, t: number) {
    return a + (b - a) * t
  }

  update(delta: number) {

    if (!this.isSitting) {

      if (this.isFloor || this.playerModel.position.y <= 0) {
        this.velocityY += this.gravity * delta; // Aplica a gravidade
        this.playerModel.position.y += this.velocityY * delta; // Atualiza a posição Y do jogador

        if (this.playerModel.position.y <= 0) { // Verifica se está no chão
          this.playerModel.position.y = 0;
          this.velocityY = 0; // Reseta a velocidade Y
        }
      }
    }

    this.playerModel.update(delta);

    // Movimentação do jogador
    this.camera.getWorldDirection(this.playerDirection);
    this.playerDirection.y = 0;
    this.playerDirection.normalize();

    const angle = Math.atan2(this.playerDirection.x, this.playerDirection.z);
    this.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), angle);

    if (!this.isSitting) {

      let animationName = !this.playerModel.IsTurnOnFlashlight ? "Walk" : "Crouch"

      if (this.keyBoard["KeyW"] && !this.keyBoard["ShiftLeft"]) {
        this.setAction(this.playerModel.animationsAction[animationName]);

        this.clipName = animationName
        this.playerModel.quaternion.slerpQuaternions(
          this.playerModel.quaternion,
          this.quaternion,
          delta * 4
        );

        this.playerImpulse.add(
          this.playerDirection.clone().multiplyScalar(this.velocity * delta)
        );

      }
      else if (this.keyBoard["KeyW"] && this.keyBoard["ShiftLeft"]) {
        let runOrCrouch = !this.playerModel.IsTurnOnFlashlight ? "Running" : "CrouchRun"
        this.setAction(this.playerModel.animationsAction[runOrCrouch]);
        this.clipName = runOrCrouch

        this.playerModel.quaternion.slerpQuaternions(
          this.playerModel.quaternion,
          this.quaternion,
          delta * 4
        );

        this.playerImpulse.add(
          this.playerDirection.clone().multiplyScalar(this.velocity * 2 * delta)
        );
      }
      else if (this.keyBoard["KeyS"]) {
        let isCrouchBack = !this.playerModel.IsTurnOnFlashlight ? "Backward" : "CrouchBack"
        this.setAction(this.playerModel.animationsAction[isCrouchBack]);
        this.clipName = isCrouchBack
        this.playerModel.quaternion.slerpQuaternions(
          this.playerModel.quaternion,
          this.quaternion,
          delta * 4
        );

        this.playerImpulse.add(
          this.playerDirection.clone().multiplyScalar(-(this.velocity - 1) * delta)
        );

      }
      else if (this.keyBoard["KeyA"]) {

        animationName = animationName === "Crouch" ? "CrouchLeft" : "WalkLeft"

        this.setAction(this.playerModel.animationsAction[animationName]);
        this.clipName = animationName

        this.playerModel.quaternion.slerpQuaternions(
          this.playerModel.quaternion,
          this.quaternion,
          delta * 4
        );

        this.playerDirection.set(
          -this.playerDirection.z,
          0,
          this.playerDirection.x,
        )        

        this.playerImpulse.add(
          this.playerDirection.clone().multiplyScalar(-(this.velocity - 1) * delta)
        );      
      } else if (this.keyBoard["KeyD"]) {

        animationName = animationName === "Crouch" ? "CrouchRight" : "WalkRight"

        this.setAction(this.playerModel.animationsAction[animationName]);
        this.clipName = animationName

        this.playerModel.quaternion.slerpQuaternions(
          this.playerModel.quaternion,
          this.quaternion,
          delta * 4
        );

        this.playerDirection.set(
          this.playerDirection.z,
          0,
          -this.playerDirection.x,
        )      

        this.playerImpulse.add(
          this.playerDirection.clone().multiplyScalar(-(this.velocity - 1) * delta)
        );

      } else if (this.keyBoard["KeyV"]) {
        this.playerModel.turnFlashlight(false)
        this.setAction(this.playerModel.animationsAction["Waving"]);
        this.clipName = "Waving"
      } else {

        let animationName = !this.playerModel.IsTurnOnFlashlight ? "Idle" : "CrouchIdle"
        this.setAction(this.playerModel.animationsAction[animationName]);
        this.clipName = animationName

      }

      const newPosition = this.playerModel.position
        .clone()
        .add(this.playerImpulse);


      if (!this.playerImpulse.equals(new Vector3(0, 0, 0))) {

        this.isCollided = this.checkCollision(newPosition)

        if (!this.isCollided) {
          this.playerModel.position.copy(newPosition)
          this.isFloor = true
        }
        else if (!this.isFloor && this.isCollided) {
          this.playerModel.position.x = newPosition.x
          this.playerModel.position.z = newPosition.z
        }

        this.playerImpulse.set(0, 0, 0); // Reseta o impulso  
      }
      else if (this.isCollided) {  //Verifica se ainda há colisão mesmo parado 
        this.checkCollision(newPosition.clone().add(
          this.playerDirection.clone().multiplyScalar(this.velocity * delta)
        ))
      }
      else {
        this.isFloor = true
      }
    }
    else {
      this.setAction(this.playerModel.animationsAction["Sitting"]);
      this.clipName = "Sitting"
      if (this.isSitting && this.keyBoard["KeyF"]) {
        setTimeout(() => {
          this.isSitting = false;
          this.followCamera.mouseMoveActived = false
          this.playerModel.position.copy(this.prevPlayerPosition);
          this.playerModel.quaternion.copy(this.prevPlayerQuaternion);
          this.followCamera.setFollowMode(true)
        }, 1000);
      }
    }

    this.followCamera.updateCamera(this.playerModel, this.items.raycasterView);

    this.socket.io.emit('updatePosition', {
      x: this.playerModel.position.x,
      y: this.playerModel.position.y,
      z: this.playerModel.position.z,
      qx: this.playerModel.quaternion.x,
      qy: this.playerModel.quaternion.y,
      qz: this.playerModel.quaternion.z,
      qw: this.playerModel.quaternion.w,
      clip: this.clipName,
      isLatern: this.playerModel.IsTurnOnFlashlight
    })
  }
}
