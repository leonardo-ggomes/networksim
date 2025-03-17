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

    start(callback: Function)
    {
        // Criando a barra de progresso no HTML
        const loadingContainer = document.createElement("div");
        loadingContainer.style.position = "fixed";
        loadingContainer.style.top = "50%";
        loadingContainer.style.left = "50%";
        loadingContainer.style.transform = "translate(-50%, -50%)";
        loadingContainer.style.width = "300px";
        loadingContainer.style.height = "30px";
        loadingContainer.style.background = "#222";
        loadingContainer.style.border = "2px solid white";
        loadingContainer.style.display = "flex";
        loadingContainer.style.alignItems = "center";
        document.body.appendChild(loadingContainer);

        const loadingBar = document.createElement("div");
        loadingBar.style.height = "100%";
        loadingBar.style.width = "0%";
        loadingBar.style.background = "#4caf50";
        loadingContainer.appendChild(loadingBar);

        // Atualiza a barra de progresso
        this.manager.onProgress = function (_, itemsLoaded, itemsTotal) {
            const progress = (itemsLoaded / itemsTotal) * 100;
            loadingBar.style.width = progress + "%";
        };
        
        // Remove a barra quando tudo estiver carregado
        this.manager.onLoad = function () {
            console.log("Todos os assets carregados!");
            loadingContainer.style.display = "none"; // Esconde a barra de loading
            callback(); // Chama a função para iniciar o jogo
        };
    }
}