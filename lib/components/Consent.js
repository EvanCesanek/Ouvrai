import { DisplayElement } from './DisplayElement';
import { required } from './utils';

/**
 * Class representing a consent form.
 * @extends DisplayElement
 */
export class Consent extends DisplayElement {
  /**
   * Create a consent form element.
   * Includes a pre-configured button click listener that dispatches bubbling 'consent' event.
   * @param {string} path
   */
  constructor({ path = required('path') }) {
    let html;
    if (path.includes('pdf')) {
      html = `<div id="consent-content" class="weblab-component-div">
        <iframe id="consent-iframe" src="${path}"></iframe>`;
    } else {
      html = `<div id="consent-content" class="weblab-component-div">
        <iframe id="consent-iframe-vr" srcdoc='<img src="${path}" style="width: 100%"></img>'></iframe>`;
    }
    html += `<p class="consent-link">
            <a
              id="consent-download-link"
              class="consent-link"
              href="${path}"
              target="_blank"
              download="consent">
              Click here to download the form for your records.
            </a>
          </p>
          <div class="weblab-component-div">
            <input type="checkbox" id="consent-checkbox" required />
            <label for="consent-checkbox">I agree to take part in this study.</label>
          </div>
          <button id="consent-button" class="consent-button" disabled> Continue </button>
          <div class="spacer"></div>
        </div>
        `;

    super({
      element: html,
      hide: true,
      parent: document.getElementById('screen'),
    });

    this.checkbox = document.getElementById('consent-checkbox');
    this.button = document.getElementById('consent-button');

    this.checkbox.addEventListener(
      'change',
      this.handleCheckboxClick.bind(this)
    );
    this.button.addEventListener('click', this.dispatchConsent.bind(this));
  }

  handleCheckboxClick(event) {
    this.button.disabled = !event.target.checked;
  }

  dispatchConsent() {
    // NOTE: To change experiment state based on some interaction within a DisplayElement,
    //  dispatch a custom event to this.dom that will bubble up to document.body.
    // Then, attach a listener for this event to document.body in index.js.
    const consentEvent = new CustomEvent('consent', {
      bubbles: true,
      cancelable: true,
      detail: {},
    });
    this.dom.dispatchEvent(consentEvent);
    console.log(`dispatched ${consentEvent} to ${this.dom.id}`);
  }
}
