import { required } from './utils';
import { DisplayElement } from './DisplayElement';

/**
 * Class representing a goodbye screen.
 * @extends DisplayElement
 */
export class Goodbye extends DisplayElement {
  /**
   * Create a goodbye screen element for displaying final bonus and confirmation code.
   * Includes a pre-configured button click listener for copying the code to clipboard.
   * @param {string} platform - 'P' (prolific), 'M' (mturk), or 'X' (neither)
   * @param {string} [prolificLink] - the prolific completion link from your study details
   */
  constructor(platform = required('platform'), prolificLink) {
    // Prolific link is required if you are using Prolific
    if (platform === 'P' && !prolificLink) {
      required('prolificLink');
    }
    let html = `
    <div id="goodbye-content" class="weblab-component-div">
      <h4 style="margin-block: 0;">Thank you for your help!</h4>
      <div id="mturk-div" class="weblab-component-div">
        <h4 style="margin-block: 0;">
          Here is your completion code:
        </h4>
        <h3 id="code-text"></h3>
        <button id="copy-code-button">Copy code to clipboard</button>
      </div>
      <div id="prolific-div" class="weblab-component-div">
        <h4 id="return-to-prolific" style="margin-block: 0">
          <a href="${prolificLink}" target="_blank">Click here to return to Prolific</a>
        </h4>
      </div>
    </div>`;
    super({
      element: html,
      hide: true,
      parent: document.getElementById('screen'),
    });
    this.codeText = document.getElementById('code-text');

    if (platform == 'P') {
      DisplayElement.hide(document.getElementById('copy-code-button'));
    } else if (platform == 'M') {
      DisplayElement.hide(document.getElementById('prolific-div'));
    }

    document
      .getElementById('copy-code-button')
      .addEventListener('click', this.copyCode.bind(this));
  }

  /**
   * Add the completion code to the goodbye screen
   * @param {string} code - completion code
   */
  updateGoodbye(code = required('code')) {
    this.codeText.textContent = code;
  }

  async copyCode() {
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
