import { DisplayElement } from './DisplayElement';

export class InstructionsPanel extends DisplayElement {
  constructor({ content = `The researcher can add instructions here.` }) {
    super({
      element: `
      <div id="instructions-panel" class="panel">
        <u>Instructions</u>
        <span class="panel-hint">
          (press i to <span id="instructions-show-hide">hide</span>)
        </span>
        <div id="instructions-detail" class="panel-detail collapsible"></div>
      </div>`,
      display: 'block',
      hide: false,
    });

    document.getElementById('panel-container').prepend(this.dom);

    this.detail = new DisplayElement({
      element: document.getElementById('instructions-detail'),
      hide: false,
      display: 'block',
    });
    this.detail.dom.innerHTML = content;

    this.hint = document.getElementById('instructions-show-hide');
  }

  toggleInstructions() {
    if (!this.detail.transitioning) {
      if (this.detail.collapsed) {
        this.detail.expand();
        this.hint.textContent = 'hide';
      } else {
        this.detail.collapse();
        this.hint.textContent = 'show';
      }
    }
  }
}
