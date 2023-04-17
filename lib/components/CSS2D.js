import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class CSS2D {
  object;

  /**
   * This class provides a convenient wrapper for three.js `CSS2DObject()`
   * @param {string} text Text to display. Can be changed via `css2d.element.innerText`;
   * @param {object} options
   * @param {string} options.color
   * @param {float} options.opacity
   * @param {string} options.textAlign
   * @param {string} options.background
   * @param {string} options.fontSize
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
