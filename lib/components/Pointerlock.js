import { DisplayElement } from './DisplayElement';

/**
 * Class enabling fullscreen and pointer lock functionality. Includes an associated DisplayElement.
 * @extends DisplayElement
 */
export class Pointerlock extends DisplayElement {
  /**
   * Create a pointerlock element
   * Includes a pre-configured button click listener for entering pointerlock
   * Use the button in the dom element to enter pointerlock. Press escape to exit.
   */
  constructor(
    target = document.body,
    parent = document.getElementById('blocker')
  ) {
    let html = `
    <div id="pointerlock-content" class="component-div">
      <h3>This experiment requires your mouse cursor to be hidden.</h3>
      <button id="pointerlock-button" class="button pointerlock-button">
        Hide the cursor
      </button>
    </div>`;
    super({ element: html, hide: true, parent: parent });
    this.engaged = false;

    document
      .getElementById('pointerlock-button')
      .addEventListener('click', () => {
        this.requestPointerlock(target);
      });

    // Listeners for changes and errors can be attached to document
    document.addEventListener(
      'pointerlockchange',
      this.handlePointerlockChange.bind(this),
      false
    );

    document.addEventListener(
      'pointerlockerror',
      () => {
        alert('Error: Pointer lock request failed!');
      },
      false
    );
  }

  requestPointerlock(element) {
    element.requestPointerLock();
  }

  exitPointerlock() {
    document.exitPointerLock();
  }

  handlePointerlockChange() {
    if (document.pointerLockElement) {
      console.log(
        `Entering pointer lock on ${document.pointerLockElement.id}.`
      );
      this.engaged = true;
      const pointerlockEvent = new CustomEvent('enterpointerlock', {
        bubbles: true,
        cancelable: true,
        detail: {},
      });
      this.dom.dispatchEvent(pointerlockEvent);
    } else {
      console.log('Exiting pointer lock.');
      this.engaged = false;
      const pointerlockEvent = new CustomEvent('exitpointerlock', {
        bubbles: true,
        cancelable: true,
        detail: {},
      });
      this.dom.dispatchEvent(pointerlockEvent);
    }
  }
}
