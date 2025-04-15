import { AudioListener, AudioLoader, PerspectiveCamera, PositionalAudio } from "three";
import Loading from "./Loading";

export default class AudioStage{

    listener: AudioListener
    camera: PerspectiveCamera
    sound: PositionalAudio
    audioLoader: AudioLoader;
    loading: Loading

    constructor(camera: PerspectiveCamera, loading: Loading){
        this.loading = loading
        this.audioLoader = new AudioLoader(this.loading.manager);
        this.listener = new AudioListener();
        this.camera = camera

        camera.add(this.listener)
        this.sound = new PositionalAudio(this.listener)

        navigator.mediaDevices.getUserMedia({audio: true}).then(_ => {
      
            this.audioLoader.load('audio/music_1.mp3', (buffer) => {
                this.sound.setBuffer(buffer);
                this.sound.setRefDistance(10); // Distância mínima para o som ser ouvido claramente
                this.sound.play(); // Tocar o som1
            });
        })   
    }

    

}