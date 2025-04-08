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
  
      document.addEventListener("keydown", (e) => {
        if (this.slideTextures.length > 0) {
          if (e.key === "ArrowRight") {
            this.nextSlide();
          } else if (e.key === "ArrowLeft") {
            this.prevSlide();
          }
        }
      });
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
  }
  