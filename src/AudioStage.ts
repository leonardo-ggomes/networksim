import { AudioListener, AudioLoader, PerspectiveCamera, PositionalAudio } from "three";

export default class AudioStage{

    listener: AudioListener
    camera: PerspectiveCamera
    sound: PositionalAudio
    audioLoader = new AudioLoader();

    constructor(camera: PerspectiveCamera){
        this.listener = new AudioListener();
        this.camera = camera

        camera.add(this.listener)
        this.sound = new PositionalAudio(this.listener)

        navigator.mediaDevices.getUserMedia({audio: true}).then((stream) => {
            this.audioLoader.load('audio/test.mp3', (buffer) => {
                this.sound.setBuffer(buffer);
                this.sound.setRefDistance(10); // Distância mínima para o som ser ouvido claramente
                this.sound.play(); // Tocar o som1
            });
        })

       
    }

}