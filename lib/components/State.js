import { Timer } from './Timer.js';

/**
 * The State class represents the Finite State Machine that manages the flow of an Experiment.
 * It is a critical component of an Ouvrai experiment, included by default within `new Experiment()`.
 * You must call `exp.state.init(stateList, stateChangeFunc)` before starting any experiment.
 */
export class State {
  /**
   * Create a new State machine. This constructor is called within the `new Experiment()` constructor.
   */
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

  // ISSUE: Long strings are memory-inefficient in Firebase (N+1 bytes).
  //   As a result, it's especially bad to save them every frame. This could be improved by:
  //     (1) Don't write state on every frame. Instead reconstruct state time-series from stateChange in analysis.
  //     (2) Replace state names with minimum-length string codes (not numbers which are still 8 bytes in Firebase), and save the dictionary mapping in exp.cfg.

  /**
   * Initialize the state machine. Remember to include all state names as you develop your state machine.
   * @param {String[]} stateList Array of all state names
   * @param {Function} [stateChangeFunc=()=>{}] Function called at state transitions, should record stateChange and stateChangeTime, default empty function
   * @param {String} [startState='CONSENT'] Name of initial state, default `'CONSENT'`
   */
  init(stateList, stateChangeFunc = () => {}, startState = 'CONSENT') {
    if (!stateList.includes(startState)) {
      throw new Error(
        `State '${startState}' was not included in stateList during state machine initialization.`
      );
    }
    this.current = startState;
    this.stateList = stateList;
    this.stateChangeFunc = stateChangeFunc;
    this.initialized = true;
    console.log(`State machine initialized in state ${this.current}`);
  }

  /**
   * Use within stateFunc() to run a function only one time upon entering the state.
   * NB: Interrupt states can cause a user to exit and re-enter a state multiple times, triggering `func()` each time.
   * @param {Function} func Function to be run on entering the state
   * @returns {*} Return value of `func()`, if any
   */
  once(func) {
    if (!this.onceExecuted) {
      this.onceExecuted = true;
      return func();
    }
  }

  /**
   * Transition to a new state.
   * @param {String} state Next state
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
   * @param {String} state Next state
   */
  push(state) {
    if (this.current !== state) {
      this.stack.push(this.current);
      this.next(state);
    }
    // else {
    //   console.warn('Pushing the current state onto the stack has no effect.');
    // }
  }

  /**
   * Is current state between two other states?
   * @param {String} start Start state, set falsy to compare only with endState
   * @param {String} end End state, set falsy to compare only with startState
   * @param {Boolean} startInclusive Default true
   * @param {Boolean} endInclusive Default true
   * @returns {Boolean}
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
   * Is current state one of the states?
   * @param {String|String[]} state State(s) to check if we are currently in
   * @returns {Boolean}
   */
  is(state) {
    if (!Array.isArray(state)) {
      state = [state];
    }
    return state.includes(this.current);
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
   * @returns {Number} Time in seconds since entering current state
   */
  elapsed() {
    return this.timer.elapsed();
  }

  /**
   *
   * @returns {Number} Time in milliseconds since entering current state
   */
  elapsedMSec() {
    return this.timer.elapsedMSec();
  }

  /**
   *
   * @param {Number} t Time in seconds
   * @returns {Boolean} True if time since entering state exceeds t, false otherwise
   */
  expired(t) {
    return this.timer.expired(t);
  }

  /**
   *
   * @param {Number} t Time in milliseconds
   * @returns {Number} True if time since entering state exceeds t, false otherwise
   */
  expiredMSec(t) {
    return this.timer.expiredMSec(t);
  }
}
