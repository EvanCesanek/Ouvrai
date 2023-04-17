import { DisplayElement } from './DisplayElement';

export class InstructionsPanel extends DisplayElement {
  /**
   * Create a overlay panel with a few lines of instructions in the top-left of the experiment window
   * @param {object} p Parameters object
   * @param {string|HTML} p.content Instructions text to appear in the panel (plaintext or HTML content)
   * @param {boolean} p.collapsible Make panel collapse/expand when participant presses the `i` key
   */
  constructor({
    content = `The researcher can add instructions here.`,
    collapsible = true,
  }) {
    super({
      element: `
      <div id="instructions-panel" class="panel">
        <u>Instructions</u>
        <span id="panel-hint" class="panel-hint">
          (press i to <span id="instructions-show-hide">hide</span>)
        </span>
        <div id="instructions-detail" class="panel-detail collapsible"></div>
      </div>`,
      display: 'block',
      hide: false,
    });

    document.getElementById('panel-container').prepend(this.dom);

    this.collapsible = collapsible;

    this.detail = new DisplayElement({
      element: document.getElementById('instructions-detail'),
      hide: false,
      display: 'block',
    });
    // Turn all returns into HTML line breaks;
    content = content.replace(/(?:\r\n|\r|\n)/g, '<br>');
    this.detail.dom.innerHTML = content;

    this.hint = document.getElementById('instructions-show-hide');
    if (!this.collapsible) {
      document.getElementById('panel-hint').remove();
    }
  }

  toggleInstructions() {
    if (this.collapsible && !this.detail.transitioning) {
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
