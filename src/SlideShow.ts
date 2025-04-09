import {
    CanvasTexture,
    LinearFilter,
    Mesh,
    MeshBasicMaterial,
    SRGBColorSpace,
    Texture,
    TextureLoader
  } from "three";
  
  export default class SlideShow {
    private telaMesh: Mesh;
    private slideTextures: Texture[] = [];
    private currentIndex = 0;
    private textureLoader = new TextureLoader();
  
    constructor(telaMesh: Mesh) {
      this.telaMesh = telaMesh;
    }
  
    // 🔤 Gera slides com textos via canvas
    loadSlides(slideTexts: string[]) {
      this.slideTextures = slideTexts.map((text) => {
        const canvas = this.createCanvasSlide(text);
        return this.createTextureFromCanvas(canvas);
      });
  
      this.applyTexture(this.slideTextures[this.currentIndex]);
    }
  
    // 🖼️ Novo: Carrega slides a partir de imagens externas
    async loadSlidesFromUrls(urls: string[]) {
      const textures = await Promise.all(urls.map((url) => this.loadTexture(url)));
      this.slideTextures = textures;
      this.applyTexture(this.slideTextures[this.currentIndex]);
    }
  
    private loadTexture(url: string): Promise<Texture> {
      return new Promise((resolve, reject) => {
        this.textureLoader.load(
          url,
          (texture) => {
            texture.minFilter = LinearFilter;
            texture.magFilter = LinearFilter;
            texture.colorSpace  = SRGBColorSpace;
            resolve(texture);
          },
          undefined,
          (err) => reject(err)
        );
      });
    }
  
    nextSlide() {
      this.changeSlide(1);
    }
  
    prevSlide() {
      this.changeSlide(-1);
    }
  
    private changeSlide(direction: number) {
      this.currentIndex =
        (this.currentIndex + direction + this.slideTextures.length) %
        this.slideTextures.length;
      this.applyTexture(this.slideTextures[this.currentIndex]);
    }
  
    private applyTexture(texture: Texture) {
      const material = this.telaMesh.material as MeshBasicMaterial;
      material.map = texture;
      material.needsUpdate = true;
    }
  
    private createCanvasSlide(text: string): HTMLCanvasElement {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = 1024;
      canvas.height = 768;
  
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 60px Arial";
      ctx.fillText(text, 100, 100);
  
      return canvas;
    }
  
    private createTextureFromCanvas(canvas: HTMLCanvasElement): Texture {
      const texture = new CanvasTexture(canvas);
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.colorSpace  = SRGBColorSpace;
      return texture;
    }

    setSlide(index: number) {
        if (this.slideTextures.length === 0) return;
      
        this.currentIndex = index % this.slideTextures.length;
        this.applyTexture(this.slideTextures[this.currentIndex]);
    }

    loadSlidesFromBase64(base64Images: string[]) {
      this.slideTextures = [];
    
      base64Images.forEach((dataUrl, index) => {
        const img = new Image();
        img.src = dataUrl;
    
        img.onload = () => {
          const aspect = img.height / img.width;
    
          const canvas = document.createElement("canvas");
          canvas.width = 1024;
          canvas.height = canvas.width * aspect;
    
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
          const texture = this.createTextureFromCanvas(canvas);
          this.slideTextures[index] = texture;
    
          if (index === 0) {
            this.applyTexture(texture);
    
            // 🧠 Atualiza o aspecto do mesh (importantíssimo!)
            this.telaMesh.scale.set(1, aspect, 1);
          }
        };
      });
    }

    
  }
  