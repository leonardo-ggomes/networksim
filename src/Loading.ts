import { LoadingManager } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default class Loading
{
    manager: LoadingManager
    dracoLoader: DRACOLoader
    loader: GLTFLoader

    constructor()
    {      
        this.manager = new LoadingManager();

        this.dracoLoader = new DRACOLoader(this.manager)
        this.loader = new GLTFLoader(this.manager)
        
        this.dracoLoader.setDecoderPath("draco/")
        this.loader.setDRACOLoader(this.dracoLoader)

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
        loadingText.innerText = "Carregando..."
        loadingText.style.color = "#fff";
        loadingText.style.fontFamily = "Poppins";
        loadingText.style.fontSize = "40px"
        loadingText.style.fontWeight = "800"
        loadingText.style.marginBottom = "5px"
        container.appendChild(loadingText);

        const loadingContainer = document.createElement("div");       
        loadingContainer.style.width = "300px";
        loadingContainer.style.height = "30px";
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
            console.log("Todos os assets carregados!");
            container.style.display = "none"; // Esconde a barra de loading
            callback(); // Chama a função para iniciar o jogo
        };
    }
}