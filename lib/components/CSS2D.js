import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class CSS2D {
  /**
   * @type {CSS2DObject}
   */
  object;

  /**
   * @type {HTMLDivElement}
   */
  element;

  /**
   * This class provides a convenient wrapper for three.js `CSS2DObject()`
   * @param {String} text Text to display. Can be changed via `css2d.element.innerText`;
   * @param {Object} options
   * @param {String} options.color Default 'black'
   * @param {Number} options.opacity Default 1
   * @param {String} options.textAlign Default 'center'
   * @param {String} options.background Default 'transparent'
   * @param {String} options.fontSize Default '16pt'
   */
  constructor(
    text = '',
    options = {
      color: 'black',
      opacity: 1,
      textAlign: 'center',
      background: 'transparent',
      fontSize: '16pt',
    }
  ) {
    this.element = document.createElement('div');
    this.element.innerHTML = text;
    this.element.style.display = 'block';
    this.element.style.color = options.color;
    this.element.style.fontSize = options.fontSize;
    this.element.style.opacity = options.opacity;
    this.element.style.textAlign = options.textAlign;
    this.element.style.background = options.background;
    this.object = new CSS2DObject(this.element);
  }
}
