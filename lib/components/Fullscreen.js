import { DisplayElement } from './DisplayElement';

/**
 * Class enabling fullscreen and pointer lock functionality. Includes an associated DisplayElement.
 * @extends DisplayElement
 */
export class Fullscreen extends DisplayElement {
  /**
   * Create a fullscreen element
   * Includes a pre-configured button click listener for entering fullscreen
   * Use the button in the dom element to enter fullscreen. Call Fullscreen.prototype.exitFullscreen() to exit.
   */
  constructor(
    target = document.body,
    parent = document.getElementById('blocker')
  ) {
    let html = `
    <div id="fullscreen-content" class="component-div">
      <h3>This experiment must be run in fullscreen.</h3>
      <button id="fullscreen-button" class="button fullscreen-button">
        Enter fullscreen
      </button>
    </div>`;
    super({ element: html, hide: true, parent: parent });
    this.engaged = false;

    document
      .getElementById('fullscreen-button')
      .addEventListener('click', () => {
        this.requestFullscreen(target);
      });

    // Convenient way to listen for different prefixes without repeating ourselves
    for (let eventName of ['fullscreenchange', 'webkitfullscreenchange']) {
      // Listeners for changes and errors can be attached to document
      document.addEventListener(
        eventName,
        this.handleFullscreenChange.bind(this)
      );
    }
  }

  requestFullscreen(element) {
    let requestMethod =
      element.requestFullscreen || element.webkitRequestFullscreen;
    requestMethod.call(element);
  }

  exitFullscreen() {
    let exitMethod = document.exitFullscreen || document.webkitExitFullscreen;
    exitMethod.call(document);
  }

  handleFullscreenChange() {
    const fullscreenElement =
      document.fullscreenElement || document.webkitFullscreenElement;
    if (fullscreenElement) {
      console.log(`Entering full-screen mode on ${fullscreenElement.id}.`);
      this.engaged = true;
      const fullscreenEvent = new CustomEvent('enterfullscreen', {
        bubbles: true,
        cancelable: true,
        detail: {},
      });
      this.dom.dispatchEvent(fullscreenEvent);
    } else {
      console.log('Exiting full-screen mode.');
      this.engaged = false;
      const fullscreenEvent = new CustomEvent('exitfullscreen', {
        bubbles: true,
        cancelable: true,
        detail: {},
      });
      this.dom.dispatchEvent(fullscreenEvent);
    }
  }
}
