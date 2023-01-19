import { Timer } from './Timer.js';
import { required } from './utils.js';

export class State {
  constructor(stateList = required('stateList'), stateChangeFunc = () => {}) {
    this.names = stateList;
    this.count = stateList.length;
    this.current = 0;
    this.last = 0;
    this.stack = [];
    this.onceExecuted = false;
    // Associate each state name variable with its index.
    for (let stateIndex = 0; stateIndex < this.count; stateIndex++) {
      this[stateList[stateIndex]] = stateIndex;
    }
    this.timer = new Timer();
    this.stateChangeFunc = stateChangeFunc;
    console.log(`State: ${this.names[this.current]}`);
  }

  once(func) {
    if (!this.onceExecuted) {
      this.onceExecuted = true;
      return func();
    }
  }
  next(state) {
    if (this.current === state) {
      return;
    }
    console.log(
      `State: ${this.names[this.current]} > ${this.names[state]} /
      (${Math.round(this.timer.elapsedMSec())} ms)`
    );
    this.timer.reset(); // Reset state time
    this.last = this.current; // Save last state
    this.current = state; // Change current state
    this.onceExecuted = false;

    this.stateChangeFunc();
  }
  push(state) {
    if (this.current === state) {
      return;
    }
    this.stack.push(this.current);
    this.next(state);
  }
  pop() {
    let state;
    if (this.stack.length > 0) {
      state = this.stack.pop();
      this.next(state);
    }
  }
  elapsed() {
    return this.timer.elapsed();
  }
  elapsedMSec() {
    return this.timer.elapsedMSec();
  }
  expired(t) {
    return this.timer.expired(t);
  }
  expiredMSec(t) {
    return this.timer.expiredMSec(t);
  }
}
