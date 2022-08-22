import { DisplayElement } from './DisplayElement';

/**
 * Class representing a demographic info survey.
 * @extends DisplayElement
 */
export class Survey extends DisplayElement {
  /**
   * Create a survey element for collecting participant demographic information.
   * When submitted, survey response data is dispatched in the 'surveysubmitted' event (.detail.survey)
   * @param {string} [customSurveyHTML] - Optional, HTML string of custom survey. Otherwise you get the default.
   */
  constructor(customSurveyHTML) {
    let html =
      customSurveyHTML ||
      `<div id="survey-content" class="weblab-component-div">
        <h4 style="margin-block: 0;">
          Nice work, you're almost done! Just a few demographic questions:
        </h4>
        <form id="survey-form">
          <p class="survey-q" id="age">How old are you?</p>
          <input
            class="survey-input"
            type="number"
            name="age"
            min="18"
            max="120"
            placeholder="18+"
            required />

          <p class="survey-q" id="gender">What is your gender?</p>
          <select name="gender" class="survey-input" required>
            <option value="" disabled selected>Select your response</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
            <option value="N">Nonbinary</option>
            <option value="X">Prefer not to say</option>
          </select>

          <p class="survey-q" id="inputdevice">
            Are you using a mouse or a trackpad?
          </p>
          <select name="inputdevice" class="survey-input" required>
            <option value="" disabled selected>Select your response</option>
            <option value="M">Mouse</option>
            <option value="T">Trackpad</option>
          </select>

          <p class="survey-q" id="hand">
            Which hand to do you use to control the mouse/trackpad?
          </p>
          <select name="hand" class="survey-input" required>
            <option value="" disabled selected>Select your response</option>
            <option value="R">Right</option>
            <option value="L">Left</option>
          </select>

          <div class="weblab-component-div">
            <button class="button" id="survey-button" type="submit">
              Continue
            </button>
          </div>
        </form>
      </div>`;

    super({
      element: html,
      hide: true,
      parent: document.getElementById('screen'),
    });
    document
      .getElementById('survey-form')
      .addEventListener('submit', this.handleSubmit.bind(this));
  }

  handleSubmit(e) {
    e.preventDefault();
    const data = new FormData(e.target);
    const surveydata = Object.fromEntries(data.entries());

    document.getElementById('survey-button').disabled = true;

    // NOTE: To change experiment state based on some interaction within a DisplayElement,
    //  dispatch a custom event to this.dom that will bubble up to document.body.
    // Then, attach a listener for this event to document.body in index.js.
    const surveySubmitEvent = new CustomEvent('surveysubmitted', {
      bubbles: true,
      cancelable: true,
      detail: { survey: surveydata },
    });
    this.dom.dispatchEvent(surveySubmitEvent);
  }
}
