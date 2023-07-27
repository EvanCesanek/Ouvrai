import { DisplayElement } from './DisplayElement';

/**
 * Enables fullscreen mode.
 * Created by default in the `new Blocker()` constructor, which is called by the `new Experiment()` constructor.
 * Includes an associated DisplayElement as a child of the `Blocker` class.
 * Includes a pre-configured button click listener for entering fullscreen.
 * Use the button to enter fullscreen. Call Fullscreen.prototype.exitFullscreen() to programmatically exit.
 * @extends DisplayElement
 */
export class Fullscreen extends DisplayElement {
  /**
   * @param {Object} p Parameters object
   * @param {HTMLElement} p.target DOM element on which to enter fullscreen mode, default `document.body`.
   * @param {HTMLElement} p.parent DOM element in which to append the Fullscreen display element, default 'blocker'.
   * @param {Boolean} p.allowExit Allow exit fullscreen? Ouvrai sets this true if `allowExitFullscreen: true` in experiment configuration object.
   */
  constructor({
    target = document.body,
    parent = document.getElementById('blocker'),
    allowExit = false,
  }) {
    let html = `
    <div id="fullscreen-content" class="component-div">
      <h3>This experiment must be run in fullscreen.</h3>
      <button id="fullscreen-button" class="button fullscreen-button">
        Enter fullscreen
      </button>
    </div>`;
    super({ element: html, hide: true, parent: parent });
    this.allowExit = allowExit;
    this.engaged = false || this.allowExit;

    document
      .getElementById('fullscreen-button')
      .addEventListener('click', () => {
        this.#requestFullscreen(target);
      });

    // Convenient way to listen for different prefixes without repeating ourselves
    for (let eventName of ['fullscreenchange', 'webkitfullscreenchange']) {
      // Listeners for changes and errors can be attached to document
      document.addEventListener(
        eventName,
        this.#handleFullscreenChange.bind(this)
      );
    }
  }

  /**
   * Request to enter fullscreen mode.
   * @private
   * @param {HTMLElement} element Target element on which to enter fullscreen.
   */
  #requestFullscreen(element) {
    let requestMethod =
      element.requestFullscreen || element.webkitRequestFullscreen;
    requestMethod.call(element);
  }

  /**
   * Programmatically exit fullscreen mode.
   * Typically called when the participant completes the experiment, before the survey and code screens.
   */
  exitFullscreen() {
    if (this.engaged) {
      let exitMethod = document.exitFullscreen || document.webkitExitFullscreen;
      exitMethod?.call(document);
    }
  }

  /**
   * Event handler for fullscreen change events (enter/exit). Sets `exp.fullscreen.engaged` to true or false accordingly.
   * This flag is then used by `exp.fullscreenInterrupt()` to determine whether state machine should divert to the `FULLSCREEN` interrupt state.
   */
  #handleFullscreenChange() {
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
      this.engaged = false || this.allowExit;
      const fullscreenEvent = new CustomEvent('exitfullscreen', {
        bubbles: true,
        cancelable: true,
        detail: {},
      });
      this.dom.dispatchEvent(fullscreenEvent);
    }
  }
}
