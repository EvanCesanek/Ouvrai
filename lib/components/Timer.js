/**
 * The Timer class represents a timer. Uses `performance.now()`.
 * You might also consider using the three.js `Clock` class, which has some additional features.
 */
export class Timer {
  /**
   * Instantiate a new Timer. Sets the mark to the current time.
   */
  constructor() {
    this.reset();
  }
  /**
   * Private method to compute seconds since page load.
   * @private
   * @returns {Number} Seconds since page load.
   */
  #getSecs() {
    return performance.now() / 1000.0;
  }
  /**
   * Resets the timer by updating the mark to now. Also clears any pause states.
   */
  reset() {
    this.mark = this.pauseMark = this.#getSecs();
    this.paused = false;
  }
  /**
   * Pauses the timer by creating a pause mark. Does nothing if already paused.
   */
  pause() {
    if (!this.paused) {
      this.pauseMark = this.#getSecs();
      this.paused = true;
    } else {
      console.warn(
        'You are trying to pause a timer that is already paused. This has no effect.'
      );
    }
  }
  /**
   * Resumes the timer if paused by fast-forwarding the mark by the duration since the pause mark.
   */
  resume() {
    if (this.paused) {
      let pauseDuration = this.#getSecs() - this.pauseMark;
      this.mark += pauseDuration;
      this.pauseMark = this.mark;
      this.paused = false;
    } else {
      console.warn(
        'You are trying to resume a timer that is not paused. This has no effect.'
      );
    }
  }
  /**
   * Returns the elapsed time (seconds) on this timer since last reset, excluding pauses.
   * @returns {Number} Elapsed time in seconds
   */
  elapsed() {
    let t = this.#getSecs() - this.mark;
    return t;
  }
  /**
   * Returns the elapsed time (milliseconds) on this timer since last reset, excluding pauses.
   * @returns {Number} Elapsed time in milliseconds
   */
  elapsedMSec() {
    return this.elapsed() * 1000.0;
  }
  /**
   * Checks if the specified amount of time (in seconds) has elapsed.
   * @param {Number} t A duration in seconds
   * @returns {Boolean} True if the elapsed time exceeds `t`, false otherwise
   */
  expired(t) {
    return this.elapsed() >= t;
  }
  /**
   * Checks if the specified amount of time (in milliseconds) has elapsed.
   * @param {Number} t A duration in milliseconds
   * @returns {Boolean} True if the elapsed time exceeds `t`, false otherwise
   */
  expiredMSec(t) {
    return this.expired(t / 1000.0);
  }
}
