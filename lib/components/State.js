import { Timer } from './Timer.js';

export class State {
  constructor() {
    this.stateList;
    this.current;
    this.last;
    this.stack = [];
    this.timer = new Timer();
    this.stateChangeFunc;
    this.onceExecuted = false;
    this.initialized = false;
  }
  /**
   * Initialize the state machine. Remember to include all state names as you develop your state machine.
   * @param {string[]} stateList Array of all state names
   * @param {function} [stateChangeFunc=()=>{}] Function called at state transitions, must record timestamp and state
   * @param {string|integer} [startState='BROWSER'] Name of initial state, default 'BROWSER'
   */
  init(stateList, stateChangeFunc = () => {}, startState = 'CONSENT') {
    if (!stateList.includes(startState)) {
      throw new Error(
        `State '${startState}' was not included in stateList during state machine initialization.`
      );
    }
    this.current = startState;
    this.stateList = stateList;
    // Create a field for each state whose value is the state's integer code (i.e. index in stateList)
    // REMOVED because we don't use integer codes any more, only strings
    // for (let [i,x] of Object.entries(stateList)) {
    //   this[x] = i;
    // }
    this.stateChangeFunc = stateChangeFunc;
    this.initialized = true;
    console.log(`State machine initialized in state ${this.current}`);
  }

  /**
   * Use within stateFunc() to run a function only one time upon entering the state.
   * NB: Interrupt states can cause a user to exit and re-enter a state multiple times, triggering `func()` each time.
   * @param {function} func Function to be run on entering the state
   * @returns {*} Return value of `func()`
   */
  once(func) {
    if (!this.onceExecuted) {
      this.onceExecuted = true;
      return func();
    }
  }

  /**
   * Transition to a new state.
   * @param {string} state Next state
   */
  next(state) {
    if (!this.initialized) {
      throw new Error('State machine has not been initialized.');
    }
    if (!this.stateList.includes(state)) {
      throw new Error(
        `State '${state}' was not included in stateList during state machine initialization.`
      );
    }
    if (this.current !== state) {
      console.log(
        `State: ${this.current} > ${state} /
      (${Math.round(this.timer.elapsedMSec())} ms)`
      );
      this.timer.reset(); // Reset state time
      this.last = this.current; // Save last state
      this.current = state; // Change current state
      this.onceExecuted = false; // Reset
      this.stateChangeFunc();
    } else {
      console.warn('Transitioning from a state to itself has no effect.');
    }
  }

  /**
   * Go to a new state while remembering current state.
   * @param {string} state Next state
   */
  push(state) {
    if (this.current !== state) {
      this.stack.push(this.current);
      this.next(state);
    }
  }

  /**
   * Is current state between two other states?
   * @param {string} start Start state, set falsy to compare only with endState
   * @param {string} end End state, set falsy to compare only with startState
   * @param {boolean} startInclusive Default true
   * @param {boolean} endInclusive Default true
   * @returns {boolean}
   */
  between(start, end, startInclusive = true, endInclusive = true) {
    let startIndex = start ? this.stateList.indexOf(start) : -Infinity;
    let endIndex = end ? this.stateList.indexOf(end) : Infinity;
    if (startIndex === -1 || endIndex === -1) {
      throw new Error('Invalid start or end state');
    }
    let currentIndex = this.stateList.indexOf(this.current);
    return (
      startIndex + !startInclusive <= currentIndex &&
      currentIndex <= endIndex + !endInclusive
    );
  }

  /**
   * Return to remembered previous state. See `State.push()`.
   */
  pop() {
    let state;
    if (this.stack.length > 0) {
      state = this.stack.pop();
      this.next(state);
    }
  }

  /**
   *
   * @returns {number} Time in seconds since entering current state
   */
  elapsed() {
    return this.timer.elapsed();
  }

  /**
   *
   * @returns {number} Time in milliseconds since entering current state
   */
  elapsedMSec() {
    return this.timer.elapsedMSec();
  }

  /**
   *
   * @param {number} t Time in seconds
   * @returns {bool} True if time since entering state exceeds t, false otherwise
   */
  expired(t) {
    return this.timer.expired(t);
  }

  /**
   *
   * @param {number} t Time in milliseconds
   * @returns {number} True if time since entering state exceeds t, false otherwise
   */
  expiredMSec(t) {
    return this.timer.expiredMSec(t);
  }
}
