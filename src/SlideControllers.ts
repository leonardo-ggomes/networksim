import SlideShow from "./SlideShow";
import SocketManager from "./SocketManager";

export default class SlideController {
  private socket = SocketManager;
  private slideshow: SlideShow;

  constructor(slideshow: SlideShow) {
    this.slideshow = slideshow;

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
      if (e.key === "ArrowRight") {
        this.emitNextSlide();
      } else if (e.key === "ArrowLeft") {
        this.emitPrevSlide();
      }
    });
  }

  emitNextSlide() {
    this.socket.io.emit("slide:next");
  }

  emitPrevSlide() {
    this.socket.io.emit("slide:prev");
  }
}
