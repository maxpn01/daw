class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._enabled = true;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'enable') this._enabled = !!e.data.value;
    };
  }
  process(inputs) {
    if (!this._enabled) return true;
    const input = inputs[0];
    if (input && input[0]) {
      // copy channel 0
      const chan = input[0];
      this.port.postMessage(chan.slice(0));
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);

