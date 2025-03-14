import {
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget,
  Mesh,
  Vector3
} from "three";

export default class MiniMap {
  renderTarget: WebGLRenderTarget;
  sceneRT: Scene;
  cameraRT: OrthographicCamera;
  renderer: WebGLRenderer;
  miniMapRenderer: WebGLRenderer;
  miniMapScene?: Scene;
  miniMapCamera?: OrthographicCamera;
  plane?: Mesh;
  player: Vector3; // Referência ao jogador
  shownMap = false

  constructor(scene: Scene, renderer: WebGLRenderer, player: Vector3) {
    this.renderer = renderer;
    this.sceneRT = scene; // Mini mapa mostra a cena principal
    this.player = player;

    // Criar RenderTarget para capturar a cena do mini mapa
    this.renderTarget = new WebGLRenderTarget(128, 128);

    // Criar câmera ortográfica para o mini mapa
    this.cameraRT = new OrthographicCamera(-10, 10, 10, -10, 0.1, 500);
    this.cameraRT.position.set(player.x, 20, player.z);
    this.cameraRT.lookAt(player.x, 0, player.z);

    // Criar um segundo renderer para o mini mapa
    this.miniMapRenderer = new WebGLRenderer({ alpha: true, antialias: false });
    this.miniMapRenderer.setSize(200, 200);

    document.addEventListener('keypress', this.onShownMiniMap)
  }

  onShownMiniMap = (e: KeyboardEvent) => {
    if(e.key == "m"){
      this.shownMap = !this.shownMap

      if(!this.shownMap){
        document.body.removeChild(this.miniMapRenderer.domElement)
      }
      else{
        this.miniMapRenderer.domElement.style.border = "1px solid #ffffff61"
        this.miniMapRenderer.domElement.style.borderRadius = "2px"
        this.miniMapRenderer.domElement.style.position = "absolute";
        this.miniMapRenderer.domElement.style.bottom = "10px";
        this.miniMapRenderer.domElement.style.left = "10px";
        document.body.appendChild(this.miniMapRenderer.domElement);
      }
    }
  }

  update() {

    if (this.shownMap) {
      // Fazer a câmera do mini mapa seguir o jogador
      this.cameraRT.position.set(this.player.x, 20, this.player.z);
      this.cameraRT.lookAt(this.player.x, 0, this.player.z);

      // Renderizar a cena principal no mini mapa
      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.render(this.sceneRT, this.cameraRT);
      this.renderer.setRenderTarget(null);

      // Renderizar o mini mapa na tela
      this.miniMapRenderer.render(this.sceneRT, this.cameraRT);
    }

  }
}
