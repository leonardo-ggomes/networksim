import { AnimationClip, LoadingManager, TextureLoader } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default class Loading
{
    manager: LoadingManager
    dracoLoader: DRACOLoader
    loader: GLTFLoader
    textureLoader: TextureLoader
    globalAnimations: { [key: string]: AnimationClip } = {}

    constructor()
    {      
        this.manager = new LoadingManager();

        this.dracoLoader = new DRACOLoader(this.manager)
        this.loader = new GLTFLoader(this.manager)
        this.textureLoader = new TextureLoader(this.manager)
        
        this.dracoLoader.setDecoderPath("draco/")
        this.loader.setDRACOLoader(this.dracoLoader)

        this.loadGlobalAnimations()

    }

    private showProgressBar()
    {
        // Criando a barra de progresso no HTML

        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.top = "50%";
        container.style.left = "50%";
        container.style.transform = "translate(-50%, -50%)";
        document.body.appendChild(container);

        const loadingText = document.createElement("div");
        loadingText.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-badge-3d-fill" viewBox="0 0 16 16">
            <path d="M10.157 5.968h-.844v4.06h.844c1.116 0 1.621-.667 1.621-2.02 0-1.354-.51-2.04-1.621-2.04"/>
            <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm5.184 4.368c.646 0 1.055.378 1.06.9.008.537-.427.919-1.086.919-.598-.004-1.037-.325-1.068-.756H3c.03.914.791 1.688 2.153 1.688 1.24 0 2.285-.66 2.272-1.798-.013-.953-.747-1.38-1.292-1.432v-.062c.44-.07 1.125-.527 1.108-1.375-.013-.906-.8-1.57-2.053-1.565-1.31.005-2.043.734-2.074 1.67h1.103c.022-.391.383-.751.936-.751.532 0 .928.33.928.813.004.479-.383.835-.928.835h-.632v.914zM8.126 11h2.189C12.125 11 13 9.893 13 7.985c0-1.894-.861-2.984-2.685-2.984H8.126z"/>
            </svg>
            Carregando...
        `
        loadingText.style.color = "#fff";
        loadingText.style.fontFamily = "Poppins";
        loadingText.style.fontSize = "34px"
        loadingText.style.fontWeight = "800"
        loadingText.style.marginBottom = "5px"
        container.appendChild(loadingText);

        const loadingContainer = document.createElement("div");       
        loadingContainer.style.width = "300px";
        loadingContainer.style.height = "15px";
        loadingContainer.style.background = "#dce3e6";
        loadingContainer.style.border = "2px solid white";
        loadingContainer.style.display = "flex";
        loadingContainer.style.alignItems = "center";
        loadingContainer.style.borderRadius = "3px";
        container.appendChild(loadingContainer);

        const loadingBar = document.createElement("div");
        loadingBar.style.height = "100%";
        loadingBar.style.width = "0%";
        loadingBar.style.borderRadius = "3px";
        loadingBar.style.background = "#021c34";
        loadingContainer.appendChild(loadingBar);

        return [container, loadingBar]
    }

    start(callback: Function)
    {
        let [container, loadingBar] = this.showProgressBar()

        // Atualiza a barra de progresso
        this.manager.onProgress = function (_, itemsLoaded, itemsTotal) {
            const progress = (itemsLoaded / itemsTotal) * 100;
            loadingBar.style.width = progress + "%";
        };
        
        // Remove a barra quando tudo estiver carregado
        this.manager.onLoad = function () {

            (document.getElementById("status-server") as HTMLDivElement).style.display = "block";
            (document.getElementById("instruction") as HTMLDivElement).style.display = "block";

            container.style.display = "none"; // Esconde a barra de loading
            callback(); // Chama a função para iniciar o jogo
        };
    }

    async loadGlobalAnimations() {

        return await new Promise<void>(async (resolve) => {

            const animations = await Promise.all([
                this.loader.loadAsync("models/M_Walk_001.glb"),
                this.loader.loadAsync("models/M_Dances_011.glb"),
                this.loader.loadAsync("models/M_Standing_Idle_001.glb"),
                this.loader.loadAsync("models/M_Run_001.glb"),
                this.loader.loadAsync("models/M_Sitting.glb"),
                this.loader.loadAsync("models/asian_male_animated@crounch_flashlight.glb"),
                this.loader.loadAsync("models/M_Standing_Idle_01.glb"),
                this.loader.loadAsync("models/M_Walk_Backwards_001.glb"),
                this.loader.loadAsync("models/asian_male_animated@crouch_back.glb"),
                this.loader.loadAsync("models/asian_male_animated@crouch_run.glb"),
                this.loader.loadAsync("models/asian_male_animated@crouch_walk_right.glb"),
                this.loader.loadAsync("models/asian_male_animated@crouch_walk_left.glb"),
                this.loader.loadAsync("models/M_Walk_Strafe_Right_002.glb"),
                this.loader.loadAsync("models/M_Walk_Strafe_Left_002.glb")
            ]);
    
            this.globalAnimations = {
                "Waving": animations[1].animations[0],
                "Idle": animations[2].animations[0],
                "Walk": animations[0].animations[0],
                "Running": animations[3].animations[0],
                "Sitting": animations[4].animations[0],
                "Crouch": animations[5].animations[0],
                "CrouchIdle": animations[6].animations[0],
                "Backward": animations[7].animations[0],
                "CrouchBack": animations[8].animations[0],
                "CrouchRun": animations[9].animations[0],
                "CrouchRight": animations[10].animations[0],
                "CrouchLeft": animations[11].animations[0],
                "WalkRight": animations[12].animations[0],
                "WalkLeft": animations[13].animations[0]
            };

            resolve()
        })
       
    }
    
}