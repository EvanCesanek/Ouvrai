import { DisplayElement } from './DisplayElement';
import consentFormPDF from '../../config/consent/consent.pdf?url'; // local; relative path
import consentFormJPG from '../../config/consent/consent.jpg?url'; // local; relative path

/**
 * Class representing a consent form.
 * @extends DisplayElement
 */
export class Consent extends DisplayElement {
  /**
   * Create a consent form element where the checkbox enables the continue button.
   * Button click dispatches a 'consent' event.
   * @param {String} jpg VR experiments require a jpg version of consent form
   */
  constructor({ jpg = false }) {
    let html = '<div id="consent-content" class="component-div">';
    let path = consentFormPDF;
    if (!jpg) {
      html += `<iframe id="consent-iframe" src="${path}"></iframe>`;
    } else {
      path = consentFormJPG;
      html += `<iframe id="consent-iframe-vr" srcdoc='<img src="${path}" style="width: 100%"></img>'></iframe>`;
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
          <div class="component-div">
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
      this.#handleCheckboxClick.bind(this)
    );
    this.button.addEventListener('click', this.#dispatchConsent.bind(this));
  }

  #handleCheckboxClick(event) {
    this.button.disabled = !event.target.checked;
  }

  #dispatchConsent() {
    // One way to change experiment state based on an interaction within a DisplayElement
    //  is to dispatch a custom event to this.dom that will bubble up to document.body.
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
