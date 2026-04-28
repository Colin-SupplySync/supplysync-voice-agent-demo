class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) {
      return true;
    }

    for (let index = 0; index < channel.length; index += 1) {
      this.buffer[this.offset] = channel[index];
      this.offset += 1;

      if (this.offset === this.bufferSize) {
        this.port.postMessage(this.buffer.slice(0));
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
