import { required } from './utils';
import { DisplayElement } from './DisplayElement';

/**
 * A goodbye screen element for displaying completion code, submission link, and final bonus amount.
 * Includes a button & click listener for copying the code to clipboard.
 * Created by default in `new Experiment()` constructor (accessible via `exp.goodbye`).
 * @extends DisplayElement
 */
export class Goodbye extends DisplayElement {
  /**
   * @param {Boolean} [demo] Ouvrai sets this to true in demo mode, so that Prolific link is not displayed.
   */
  constructor(demo = false) {
    let html = `
    <div id="goodbye-content" class="component-div">
      <h4 style="margin-block: 0;">Thank you for your help!</h4>
      <div id="mturk-div" class="component-div">
        <h4 style="margin-block: 0;">
          Your completion code is:
        </h4>
        <h3 id="code-text">NOCODE</h3>
        <button id="copy-code-button">Copy code to clipboard</button>
      </div>
      <div id="prolific-div" class="component-div">
        <h4 id="return-to-prolific" style="margin-block: 0">
          <a id="prolific-link" href="https://app.prolific.co/submissions/complete?cc=NOCODE" target="_blank">Click here to return to Prolific</a>
        </h4>
      </div>
    </div>`;
    super({
      element: html,
      hide: true,
      parent: document.getElementById('screen'),
    });
    this.codeText = document.getElementById('code-text');

    if (!navigator.clipboard) {
      document.getElementById('copy-code-button').style.display = 'none';
    }
    document
      .getElementById('copy-code-button')
      .addEventListener('click', this.#copyCode.bind(this));

    if (demo) {
      DisplayElement.hide(document.getElementById('prolific-div'));
    }
  }

  /**
   * Called by `exp.complete()`. Adds the completion code to the goodbye screen.
   * @param {String} code Completion code. Ouvrai typically uses the Firebase UID because it is random and hard to query.
   * @param {'Prolific'|'MTurk'|'Other'} [platform] Recruitment platform. Currently used only to hide Prolific link if 'MTurk'...
   * @param {Number} [bonus]
   */
  updateGoodbye(code, platform, bonus) {
    // if (platform === 'Prolific') {
    //   DisplayElement.hide(document.getElementById('mturk-div')); //'copy-code-button'));
    // } else
    if (platform == 'MTurk') {
      DisplayElement.hide(document.getElementById('prolific-div'));
    }
    if (bonus > 0) {
      let bonusText = document.createElement('h4');
      bonusText.innerText = `You earned a bonus payment of $${bonus}.`;
      this.dom.append(bonusText);
    }
    this.codeText.textContent = code;
    document.getElementById(
      'prolific-link'
    ).href = `https://app.prolific.co/submissions/complete?cc=${code}`;
  }

  /**
   * Asynchronous method to copy text to the system clipboard upon an interaction event.
   * @private
   */
  async #copyCode() {
    try {
      await navigator.clipboard.writeText(this.codeText.textContent);
      this.codeText.style.transition = 'opacity 0.15s';
      this.codeText.style.opacity = 0.5;
      setTimeout(() => (this.codeText.style.opacity = 1), 150);
    } catch (error) {
      console.error(error.message);
    }
  }
}
