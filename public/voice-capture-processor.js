/**
 * voice-capture-processor.js
 *
 * AudioWorklet processor — roda em thread dedicada de áudio (não bloqueia a main thread).
 * Substitui o ScriptProcessorNode deprecado.
 *
 * Coloca em: /public/voice-capture-processor.js
 * (ou onde Vite serve arquivos estáticos)
 *
 * Pipeline:
 *   Mic → AudioWorkletNode(este arquivo) → port.postMessage(float32) → VoiceChatManager
 *
 * Por que Float32 e não Int16 aqui?
 *   O worklet recebe Float32 nativo do Web Audio API.
 *   A conversão para Int16 (compressão de rede) é feita no thread principal
 *   em VoiceChatManager para manter este arquivo simples e portável.
 *
 * Tamanho do buffer: 128 frames por callback (padrão do AudioWorklet).
 * Acumulamos até CHUNK_SIZE antes de enviar para reduzir overhead de postMessage.
 */

const CHUNK_SIZE = 2048; // frames por chunk enviado (~46ms a 44100Hz)

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(CHUNK_SIZE);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channel = input[0]; // mono

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];

      if (this._offset >= CHUNK_SIZE) {
        // Copia antes de resetar para evitar race condition
        this.port.postMessage(this._buffer.slice(0));
        this._offset = 0;
      }
    }

    return true; // mantém o processor vivo
  }
}

registerProcessor('voice-capture-processor', VoiceCaptureProcessor);