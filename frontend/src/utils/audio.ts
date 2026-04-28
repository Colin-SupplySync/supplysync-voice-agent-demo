const TARGET_INPUT_SAMPLE_RATE = 16000;
const MODEL_OUTPUT_SAMPLE_RATE = 24000;

export function downsampleFloat32ToInt16(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = TARGET_INPUT_SAMPLE_RATE,
) {
  if (sourceSampleRate === targetSampleRate) {
    return floatTo16BitPCM(input);
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);

  let offset = 0;
  for (let index = 0; index < length; index += 1) {
    const nextOffset = Math.min(
      input.length,
      Math.round((index + 1) * ratio),
    );

    let sum = 0;
    let count = 0;

    for (let sampleIndex = offset; sampleIndex < nextOffset; sampleIndex += 1) {
      sum += input[sampleIndex];
      count += 1;
    }

    output[index] = count > 0 ? sum / count : 0;
    offset = nextOffset;
  }

  return floatTo16BitPCM(output);
}

function floatTo16BitPCM(input: Float32Array) {
  const output = new Int16Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
}

function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export class PcmPlayer {
  private readonly context: AudioContext;
  private readonly gainNode: GainNode;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;

  constructor(context: AudioContext) {
    this.context = context;
    this.gainNode = context.createGain();
    this.gainNode.gain.value = 0.96;
    this.gainNode.connect(context.destination);
  }

  async resume() {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  enqueue(base64PcmChunk: string) {
    const bytes = base64ToUint8Array(base64PcmChunk);
    const samples = new Int16Array(
      bytes.buffer,
      bytes.byteOffset,
      Math.floor(bytes.byteLength / 2),
    );
    const floatSamples = new Float32Array(samples.length);

    for (let index = 0; index < samples.length; index += 1) {
      floatSamples[index] = samples[index] / 0x8000;
    }

    const audioBuffer = this.context.createBuffer(
      1,
      floatSamples.length,
      MODEL_OUTPUT_SAMPLE_RATE,
    );
    audioBuffer.copyToChannel(floatSamples, 0);

    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);

    const startTime = Math.max(this.context.currentTime + 0.02, this.nextTime);
    source.start(startTime);
    this.nextTime = startTime + audioBuffer.duration;
    this.sources.add(source);

    source.onended = () => {
      this.sources.delete(source);
    };
  }

  clear() {
    for (const source of this.sources) {
      try {
        source.stop(0);
      } catch {
        // Ignore sources that already finished.
      }
    }

    this.sources.clear();
    this.nextTime = this.context.currentTime;
  }

  dispose() {
    this.clear();
    this.gainNode.disconnect();
  }
}

export const audioConstants = {
  targetInputSampleRate: TARGET_INPUT_SAMPLE_RATE,
  modelOutputSampleRate: MODEL_OUTPUT_SAMPLE_RATE,
};
