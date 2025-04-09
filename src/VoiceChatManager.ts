import * as THREE from 'three';
import SocketManager from './SocketManager';

export default class VoiceChatManager {
  private audioContext: AudioContext;
  private socket = SocketManager;
  private listener: THREE.AudioListener;
  private processor?: ScriptProcessorNode;
  private stream?: MediaStream;

  constructor(listener: THREE.AudioListener) {
    this.audioContext = new AudioContext();
    this.listener = listener;
  }

  async initMicrophone() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.audioContext.createMediaStreamSource(this.stream);

    this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const int16 = this.float32ToInt16(input);
      this.socket.io.emit('voice', int16.buffer);
    };
  }

  handleIncomingAudio(playAtObject: THREE.Object3D) {
    this.socket.io.on('voice', (data: ArrayBuffer) => {
      const int16 = new Int16Array(data);
      const float32 = this.int16ToFloat32(int16);
  
      const buffer = this.audioContext.createBuffer(1, float32.length, this.audioContext.sampleRate);
      buffer.copyToChannel(float32, 0);
  
      const positional = new THREE.PositionalAudio(this.listener);
        positional.setBuffer(buffer);
        positional.setRefDistance(5);        // Distância onde o som ainda é alto
        positional.setMaxDistance(50);       // Limite de alcance do som
        positional.setRolloffFactor(1);      // Quão rápido o som diminui
        positional.setDistanceModel('inverse'); // Modelo realista
        positional.setLoop(false);
        positional.setVolume(1);
  
      playAtObject.add(positional); // fixa no objeto estático
      positional.play();
    });
  }

  private float32ToInt16(buffer: Float32Array): Int16Array {
    const l = buffer.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = Math.min(1, buffer[i]) * 0x7FFF;
    }
    return int16;
  }

  private int16ToFloat32(int16: Int16Array): Float32Array {
    
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x7FFF;
    }
    return float32;
  }
}
