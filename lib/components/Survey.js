import { DisplayElement } from './DisplayElement';

/**
 * Class representing a simple survey form
 * @extends DisplayElement
 */
export class Survey extends DisplayElement {
  /**
   * Create a survey form for collecting participant demographic information.
   * When submitted, survey response data is dispatched in the 'surveysubmitted' event (.detail.survey)
   * @param {string} [customSurveyHTML] - Optional, HTML string of custom survey. Otherwise you get the default.
   */
  constructor(prompt = 'Please answer the following questions.') {
    let element = document.createElement('div');
    element.id = 'survey-content';
    element.classList.add('component-div');

    let header = document.createElement('h4');
    header.style = 'margin-block: 0;';
    header.textContent = prompt;
    element.append(header);

    let form = document.createElement('form');
    form.id = 'survey-form';
    element.append(form);

    let buttonDiv = document.createElement('div');
    form.append(buttonDiv);

    let button = document.createElement('button');
    button.classList.add('button');
    button.id = 'survey-button';
    button.type = 'submit';
    button.textContent = 'Continue';
    buttonDiv.append(button);

    super({
      element: element,
      hide: true,
      parent: document.getElementById('screen'),
    });
    // Need these references to insert questions between these nodes
    this.form = form;
    this.buttonDiv = buttonDiv;
    document
      .getElementById('survey-form')
      .addEventListener('submit', this.handleSubmit.bind(this));
  }

  /**
   * Add a question to a Survey instance
   * @param {object} p
   * @param {('text'|'number'|'list'|'checkbox')} p.type The type of survey question.
   * @param {string} p.name This name becomes the variable name in your data.
   * @param {string} p.message The prompt you want to display for this question.
   * @param {string[]} p.choices For `'list'` and `'checkbox'` questions, the choices you want to display.
   * @param {object} p.options Extra options
   * @param {boolean} p.options.required Question must be answered
   * @param {number} p.options.size Size of the input field
   * @param {number} p.options.min Minimum value for `'number'` type
   * @param {number} p.options.max Maximum value for `'number'` type
   * @param {number} p.options.step Valid interval for `'number'` type
   * @param {string|number} p.options.placeholder Placeholder response for `'text'` and `'number'` types
   * @param {string} p.options.pattern Regular expression for validating `'text'` types
   * @param {boolean} p.options.textarea Provide a large area for longer `'text'` types
   * @param {number} p.options.cols Width of a `textarea`
   * @param {number} p.options.rows Height of a `textarea`
   * @returns
   */
  addQuestion({ type, name, message, choices = [], options }) {
    // <p> node shows the text associated with the question
    let p = document.createElement('p');
    p.textContent = message;
    p.classList.add('survey-q');
    p.id = name;
    p.size = options.size ?? 20;

    // <input> or <select> nodes collect the responses
    let q;
    switch (type) {
      case 'text':
        q = this.#textQuestion(name, options);
        break;
      case 'number':
        q = this.#numberQuestion(name, options);
        break;
      case 'list':
        q = this.#listQuestion(name, choices, options);
        break;
      case 'checkbox':
        q = this.#checkboxQuestion(name, choices, options);
        break;
      default:
        throw new Error(
          `Survey question 'type' must be one of ('text'|'number'|'list'|'checkbox'). You requested '${type}'.`
        );
    }

    // stack them on top of button so they appear in order
    this.form.insertBefore(p, this.buttonDiv);
    if (Array.isArray(q)) {
      // checkbox questions have lots of elements
      q.forEach((x) => this.form.insertBefore(x, this.buttonDiv));
    } else {
      this.form.insertBefore(q, this.buttonDiv);
    }
  }

  #textQuestion(name, options) {
    if (options.textarea || options.rows) {
      x = document.createElement('textarea');
      x.rows = options.rows;
      x.cols = options.cols;
    } else {
      let x = document.createElement('input');
      x.type = 'text';
    }
    x.classList.add('survey-input');
    x.name = name;
    x.maxLength = options.maxLength;
    x.placeholder = options.placeholder;
    x.pattern = options.pattern;
    if (options.required) x.required = true;
    return x;
  }

  #numberQuestion(name, options) {
    let x = document.createElement('input');
    x.classList.add('survey-input');
    x.type = 'number';
    x.name = name;
    x.min = options.min;
    x.max = options.max;
    x.step = options.step;
    x.placeholder = options.placeholder;
    if (options.required) x.required = true;
    return x;
  }

  #listQuestion(name, choices, options) {
    let x = document.createElement('select');
    x.classList.add('survey-input');
    x.name = name;
    if (options.required) x.required = true;

    // Default placeholder
    let d = document.createElement('option');
    d.textContent = 'Select response';
    d.value = '';
    d.disabled = true;
    d.selected = true;

    x.append(d);

    for (let [i, v] of Object.entries(choices)) {
      // list option element
      let c = document.createElement('option');
      c.value = v;
      c.textContent = v;
      x.append(c);
    }
    return x;
  }

  #checkboxQuestion(name, choices, options) {
    let elements = [];
    for (let [i, v] of Object.entries(choices)) {
      // checkbox element
      let c = document.createElement('input');
      c.type = 'checkbox';
      c.name = name;
      c.id = name + i.toString();
      c.value = v;
      elements.push(c);
      // label element to the right allows clicking the text to toggle the box
      let lab = document.createElement('label');
      lab.for = v;
      lab.textContent = ` ${v}`;
      elements.push(lab);
      elements.push(document.createElement('br'));
    }
    elements.pop(); // pop off one line break
    return elements;
  }

  handleSubmit(e) {
    console.log('handling submit', e);
    e.preventDefault();
    const data = new FormData(e.target);
    const surveydata = Object.fromEntries(data.entries());
    console.log('entries', surveydata);

    document.getElementById('survey-button').disabled = true;

    // One way to change experiment state based on some interaction within a DisplayElement,
    //  dispatch a custom event to this.dom that will bubble up to document.body.
    // Then attach a listener for this event to document.body in index.js.
    const surveySubmitEvent = new CustomEvent('surveysubmitted', {
      bubbles: true,
      cancelable: true,
      detail: { survey: surveydata },
    });
    this.dom.dispatchEvent(surveySubmitEvent);
  }
}
