import { Camera, Scene, WebGLRenderer, Raycaster, Vector2, Object3D } from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SocketManager from './SocketManager';
import Items from './Items';
import { SceneObjectUpdate } from './types/EditorTypes';

export class EditorManager {
    private transformControls: TransformControls;
    private raycaster = new Raycaster();
    private mouse = new Vector2();
    public isEditorMode = false;
    public orbitControls: OrbitControls;
    public instances: Map<string, Object3D> = new Map();
    private items: Items;

    constructor(
        private scene: Scene, 
        private camera: Camera, 
        private renderer: WebGLRenderer,
        itemsInstance: Items
    ) {
        this.items = itemsInstance;
        
        // Setup Controls
        this.transformControls = new TransformControls(camera, renderer.domElement);
        this.scene.add(this.transformControls);
        
        this.orbitControls = new OrbitControls(camera, renderer.domElement);
        this.orbitControls.enabled = false;

        // 3. O "Pulo do gato": O bloqueio de eventos
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.orbitControls.enabled = !event.value;
        });
        this.initListeners();
    }

    private initListeners() {
        // Seleção de objetos
        window.addEventListener('mousedown', (e) => this.onMouseClick(e));
        
        // Feedback visual e sincronização de transformações
        this.transformControls.addEventListener('objectChange', () => {
            const obj = this.transformControls.object;
            if (!obj) return;

            const updateData: SceneObjectUpdate = {
                uuid: obj.uuid,
                position: obj.position.clone(),
                rotation: obj.rotation.clone(),
                scale: obj.scale.clone(),
                name: obj.name
            };
            
            // Notifica outros sistemas se necessário
            window.dispatchEvent(new CustomEvent('update-object', { detail: updateData }));
        });
    }

    public toggleMode(active: boolean) {
        this.isEditorMode = active;
        this.orbitControls.enabled = active;
        this.transformControls.enabled = active;
        
        if (!active) {
            this.transformControls.detach();
        }
    }

    private onMouseClick(event: MouseEvent) {
        if (!this.isEditorMode) return;
        
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Filtra apenas objetos editáveis (muito mais rápido que children geral)
        const targets = this.getEditableObjects();
        const intersects = this.raycaster.intersectObjects(targets, true);

        if (intersects.length > 0) {
            // Pega o objeto pai caso o clique tenha sido em um filho (ex: mesh dentro de um group)
            this.transformControls.attach(intersects[0].object);
        } else {
            // Clicou no vazio? Deseleciona
            this.transformControls.detach();
        }
    }

    public save() {
        const sceneData: any[] = [];
        
        // Varre apenas os objetos editáveis definidos no Items
        this.getEditableObjects().forEach((obj) => {
            sceneData.push({
                name: obj.name,
                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
            });
        });

        SocketManager.io.emit('scene:save', sceneData);
        console.log("Cena enviada para o servidor");
    }

    public getEditableObjects(): Object3D[] {
        // Retorna a lista de objetos gerenciados pelo Items.ts
        return this.items.getEditableObjects(); 
    }
}