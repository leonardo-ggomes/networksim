class VoiceProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
    }
  
    process(inputs) {
      const input = inputs[0];
      if (input && input[0]) {
        this.port.postMessage(input[0]); // envia o canal mono para o JS
      }
      return true; // manter o nó ativo
    }
  }
  
  registerProcessor('voice-processor', VoiceProcessor);
  