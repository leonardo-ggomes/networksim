import SlideShow from "./SlideShow";
import SocketManager from "./SocketManager";

export default class SlideController {
  private socket = SocketManager;
  private slideshow: SlideShow;
  isPresenter = false

  constructor(slideshow: SlideShow) {
    this.slideshow = slideshow;

    this.socket.io.on("slides:init", ({ currentSlideIndex, slides, presenterId }) => {
      this.slideshow.loadSlidesFromBase64(slides);
      this.slideshow.setSlide(currentSlideIndex);

      const isPresenter = this.socket.io.id === presenterId;
      this.setPresenter(isPresenter);
    });

    this.socket.io.on("presenter:set", (presenterId) => {
      this.setPresenter(this.socket.io.id === presenterId);
    });

    // Recebe mudança de slide do servidor
    this.socket.io.on("slide:change", (index: number) => {
      this.slideshow.setSlide(index);
    });

    // Pede slide atual ao conectar
    this.socket.io.emit("slide:get-current");

    this.socket.io.on("slide:current", (index: number) => {
      this.slideshow.setSlide(index);
    });

    // Atalhos locais
    document.addEventListener("keydown", (e) => {

      if (!this.isPresenter) return;

      if (e.key === "ArrowRight") {
        this.emitNextSlide();
      } else if (e.key === "ArrowLeft") {
        this.emitPrevSlide();
      }
      else if (e.key === "u") {
        this.triggerSlideUpload();
      }
    });


  }

  emitNextSlide() {
    this.socket.io.emit("slide:next");
  }

  emitPrevSlide() {
    this.socket.io.emit("slide:prev");
  }

  setPresenter(value: boolean) {
    this.isPresenter = value;
    console.log("Agora sou o apresentador?", value);
  }

  triggerSlideUpload() {
    const maxSizeMB = 5;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (!this.isPresenter) {
      console.warn("Você não é o apresentador!");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";

    input.onchange = () => {
      if (!input.files) return;

      const readers = Array.from(input.files).map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;

            const base64Size = (base64.length * (3 / 4)) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

            if (base64Size > maxSizeBytes) {
              alert(`Arquivo muito grande! Máximo permitido: ${maxSizeMB}MB`);
              return;
            }

            resolve(base64);
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(readers).then(base64Slides => {
        this.socket.io.emit("slides:upload", base64Slides);
      });
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

}
