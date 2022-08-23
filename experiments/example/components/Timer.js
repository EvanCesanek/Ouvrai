export class Timer {
  constructor() {
    this.reset();
  }
  #getSecs() {
    // private method
    return performance.now() / 1000.0;
  }
  reset() {
    this.mark = this.#getSecs();
    this.pauseMark = this.mark;
    this.paused = false;
  }
  pause() {
    if (!this.paused) {
      this.pauseMark = this.#getSecs();
      this.paused = true;
    }
  }
  resume() {
    if (this.paused) {
      let pauseDuration = this.#getSecs() - this.pauseMark;
      this.mark = this.mark + pauseDuration;
      this.pauseMark = this.mark;
      this.paused = false;
    }
  }
  elapsed() {
    var t = this.#getSecs() - this.mark;
    return t;
  }
  elapsedMSec() {
    return this.elapsed() * 1000.0;
  }
  expired(t) {
    return this.elapsed() >= t;
  }
  expiredMSec(t) {
    return this.expired(t / 1000.0);
  }
}
