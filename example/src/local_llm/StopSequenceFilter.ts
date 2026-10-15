/**
 * Cuts streamed model output at the first stop sequence of the model's chat
 * template (e.g. `<|im_end|>`), for models whose GGUF metadata doesn't make
 * that marker an end-of-generation token. Text that could be the start of a
 * stop sequence is held back until the next delta proves otherwise, so a
 * marker split across tokens never leaks into the reply.
 */
export class StopSequenceFilter {
  private held = '';
  private stopped = false;
  private readonly maxHold: number;

  constructor(private readonly stopSequences: string[]) {
    this.maxHold = Math.max(0, ...stopSequences.map((s) => s.length - 1));
  }

  /** True once a stop sequence was seen; later input is ignored. */
  get isStopped(): boolean {
    return this.stopped;
  }

  /** Feeds a delta and returns the text that is safe to emit now. */
  push(delta: string): string {
    if (this.stopped) return '';
    const text = this.held + delta;

    let cut = -1;
    for (const stop of this.stopSequences) {
      if (!stop) continue;
      const i = text.indexOf(stop);
      if (i !== -1 && (cut === -1 || i < cut)) cut = i;
    }
    if (cut !== -1) {
      this.stopped = true;
      this.held = '';
      return text.slice(0, cut);
    }

    // Hold back the longest suffix that is a prefix of some stop sequence.
    let hold = 0;
    for (let len = Math.min(this.maxHold, text.length); len > 0; len--) {
      const tail = text.slice(text.length - len);
      if (this.stopSequences.some((s) => s.startsWith(tail))) {
        hold = len;
        break;
      }
    }
    this.held = text.slice(text.length - hold);
    return text.slice(0, text.length - hold);
  }

  /** Releases held-back text at the end of generation. */
  flush(): string {
    const rest = this.stopped ? '' : this.held;
    this.held = '';
    return rest;
  }
}
