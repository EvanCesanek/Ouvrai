import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class CSS2D {
  object;
  position;
  rotation;

  constructor(text = 'CSS2D', params = {}) {
    const element = document.createElement('div');
    element.innerHTML = text;
    element.style.display = 'block';
    ({
      color: element.style.color = 'black',
      opacity: element.style.opacity = 1,
      textAlign: element.style.textAlign = 'center',
      background: element.style.background = 'transparent',
    } = params);
    this.object = new CSS2DObject(element);
  }
}
