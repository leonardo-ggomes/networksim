/**
 * VoiceChatManager.ts
 *
 * Pipeline de voz para auditório — sem ScriptProcessorNode deprecado.
 *
 * ── CAPTURA (palestrante) ──────────────────────────────────────────────────
 *   Mic → AudioWorkletNode → float32ToInt16 → socket.emit('voice')
 *
 * ── REPRODUÇÃO (plateia) ──────────────────────────────────────────────────
 *   socket.on('voice') → Int16 → Float32 → AudioBuffer
 *     → PannerNode     (HRTF posicional — palco 3D)
 *     → ConvolverNode  (reverb de auditório — IR sintético)
 *     → BiquadFilter   (EQ presença 3kHz)
 *     → DynamicsCompressor (evita clipping)
 *     → AudioContext.destination
 *
 * ── EFEITOS ───────────────────────────────────────────────────────────────
 *   • Reverb sintético (IR gerado em código — zero arquivos externos)
 *     Decay ~1.8s, pre-delay 20ms, simulando auditório médio
 *   • EQ: boost de presença em 3kHz para voz inteligível a distância
 *   • Compressor: attack rápido, nivelar vozes e evitar picos
 *   • HRTF: binaurial — sensação real de onde o som vem no espaço 3D
 *
 * ── MEMORY ────────────────────────────────────────────────────────────────
 *   BufferSourceNode e PannerNode criados por chunk e destruídos via onended.
 *   Cadeia de efeitos (convolver/eq/compressor) criada uma vez e reaproveitada.
 */

import * as THREE from 'three';
import SocketManager from './SocketManager';

const REVERB_DECAY    = 1.8;
const REVERB_PREDELAY = 0.020;
const EQ_FREQUENCY    = 3000;
const EQ_GAIN         = 4;
const EQ_Q            = 1.2;
const COMP_THRESHOLD  = -24;
const COMP_KNEE       = 8;
const COMP_RATIO      = 4;
const COMP_ATTACK     = 0.003;
const COMP_RELEASE    = 0.18;
const REF_DISTANCE    = 8;
const MAX_DISTANCE    = 60;
const ROLLOFF         = 1.2;

export default class VoiceChatManager {
  private audioContext: AudioContext;
  private socket = SocketManager;
  private listener: THREE.AudioListener;

  private workletNode?: AudioWorkletNode;
  private stream?: MediaStream;
  private workletReady = false;

  private convolver?: ConvolverNode;
  private eqFilter?: BiquadFilterNode;
  private compressor?: DynamicsCompressorNode;
  private fxChainReady = false;

  private stageObject?: THREE.Object3D;

  private activeNodes = 0;
  private readonly MAX_ACTIVE = 8;

  constructor(listener: THREE.AudioListener) {
    this.audioContext = listener.context as AudioContext;
    this.listener     = listener;
  }

  // ── Captura (palestrante) ─────────────────────────────────────────────────

  async initMicrophone() {
    if (this.stream?.active) return;

    if (!this.workletReady) {
      await this.audioContext.audioWorklet.addModule('/voice-capture-processor.js');
      this.workletReady = true;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }
    });

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'voice-capture-processor');

    this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const int16 = this._float32ToInt16(event.data);
      this.socket.io.emit('voice', int16.buffer);
    };

    // Conecta ao worklet mas NÃO ao destination — só captura, não reproduz local
    source.connect(this.workletNode);
  }

  stopMicrophone() {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = undefined;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => { if (t.readyState === 'live') t.stop(); });
      this.stream = undefined;
    }
  }

  // Define o Object3D do palestrante para posicionamento preciso do áudio
  setStageObject(obj: THREE.Object3D) {
    this.stageObject = obj;
  }

  // ── Reprodução (plateia) ──────────────────────────────────────────────────

  handleIncomingAudio(fallbackObject: THREE.Object3D) {
    this._ensureFxChain();

    this.socket.io.on('voice', (data: ArrayBuffer) => {
      if (this.activeNodes >= this.MAX_ACTIVE) return;

      const float32 = this._int16ToFloat32(new Int16Array(data));
      const audioBuffer = this.audioContext.createBuffer(
        1, float32.length, this.audioContext.sampleRate
      );
      audioBuffer.copyToChannel(float32, 0);

      const sourceObj = this.stageObject ?? fallbackObject;

      // PannerNode HRTF — posicionamento 3D binaurial
      const panner = this.audioContext.createPanner();
      panner.panningModel  = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance   = REF_DISTANCE;
      panner.maxDistance   = MAX_DISTANCE;
      panner.rolloffFactor = ROLLOFF;

      const wp = new THREE.Vector3();
      sourceObj.getWorldPosition(wp);
      panner.positionX.value = wp.x;
      panner.positionY.value = wp.y;
      panner.positionZ.value = wp.z;

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;

      // source → panner → convolver → eq → compressor → destination
      source.connect(panner);
      panner.connect(this.convolver!);

      this.activeNodes++;
      source.onended = () => {
        source.disconnect();
        panner.disconnect();
        this.activeNodes = Math.max(0, this.activeNodes - 1);
      };

      source.start();
    });
  }

  // ── Cadeia de efeitos (singleton, criada uma vez) ─────────────────────────

  private _ensureFxChain() {
    if (this.fxChainReady) return;
    const ctx = this.audioContext;

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this._buildAuditoriumIR(ctx);

    this.eqFilter = ctx.createBiquadFilter();
    this.eqFilter.type             = 'peaking';
    this.eqFilter.frequency.value  = EQ_FREQUENCY;
    this.eqFilter.gain.value       = EQ_GAIN;
    this.eqFilter.Q.value          = EQ_Q;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = COMP_THRESHOLD;
    this.compressor.knee.value      = COMP_KNEE;
    this.compressor.ratio.value     = COMP_RATIO;
    this.compressor.attack.value    = COMP_ATTACK;
    this.compressor.release.value   = COMP_RELEASE;

    this.convolver.connect(this.eqFilter);
    this.eqFilter.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    this.fxChainReady = true;
  }

  /**
   * Gera Impulse Response sintético de auditório médio (400–800 lugares).
   * Pre-delay 20ms simula a distância física palco→plateia.
   * Decay exponencial 1.8s com difusão estéreo leve.
   * Zero arquivos externos necessários.
   */
  private _buildAuditoriumIR(ctx: AudioContext): AudioBuffer {
    const sr          = ctx.sampleRate;
    const length      = Math.floor(sr * REVERB_DECAY);
    const preDelay    = Math.floor(sr * REVERB_PREDELAY);
    const ir          = ctx.createBuffer(2, length, sr);

    for (let ch = 0; ch < 2; ch++) {
      const data   = ir.getChannelData(ch);
      const spread = ch === 0 ? 1.0 : 0.92; // leve diferença L/R → sensação de espaço

      for (let i = 0; i < length; i++) {
        if (i < preDelay) { data[i] = 0; continue; }
        const t    = (i - preDelay) / sr;
        const decay = Math.exp(-t * (3.0 / REVERB_DECAY));
        data[i] = (Math.random() * 2 - 1) * decay * spread;
      }
    }

    return ir;
  }

  // ── Conversores ───────────────────────────────────────────────────────────

  private _float32ToInt16(buf: Float32Array): Int16Array {
    const out = new Int16Array(buf.length);
    for (let i = 0; i < buf.length; i++)
      out[i] = Math.max(-32768, Math.min(32767, buf[i] * 32767));
    return out;
  }

  private _int16ToFloat32(buf: Int16Array): Float32Array {
    const out = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] / 32767;
    return out;
  }

  dispose() {
    this.stopMicrophone();
    this.convolver?.disconnect();
    this.eqFilter?.disconnect();
    this.compressor?.disconnect();
    this.fxChainReady = false;
  }
}