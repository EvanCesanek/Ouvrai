import { required } from './utils';
import { DisplayElement } from './DisplayElement';
import { Fullscreen } from './Fullscreen';
import { Pointerlock } from './Pointerlock';

export class Blocker extends DisplayElement {
  constructor() {
    super({ element: document.getElementById('blocker'), hide: true });

    // this.children: merge a few defaults with any other supplied doms
    this.children = {
      fullscreen: new Fullscreen(),
      pointerlock: new Pointerlock(),
      chrome: new DisplayElement({
        element: `
          <div id="chrome-required-content" class="weblab-component-div">
            <p>
              This experiment requires a recently updated version of Google Chrome.<br />
              Please copy the full URL and reopen it in Chrome.<br />
              Thank you! We apologize for any inconvenience.
            </p>
          </div>`,
        hide: true,
        parent: this.dom,
      }),
      desktop: new DisplayElement({
        element: `
          <div id="desktop-required-content" class="weblab-component-div">
            <p>
              This experiment is not supported on mobile devices.<br />
              Please reopen it on a desktop or laptop computer in Google Chrome.<br />
              Thank you! We apologize for any inconvenience.
            </p>
          </div>`,
        hide: true,
        parent: this.dom,
      }),
      connection: new DisplayElement({
        element: `
          <div id="connection-required-content" class="weblab-component-div">
            <p>
              Trying to connect to database server. Please wait...<br />
              The experiment will resume when you are connected.<br />
              Please complete this experiment with a stable internet connection.
            </p>
          </div>`,
        hide: true,
        parent: this.dom,
      }),
      attention: new DisplayElement({
        element: `
          <div id="attention-check-content" class="weblab-component-div" style="line-height:1.5em">
            <h3 style="margin-block: 0">
              Warning!<br />
            </h3>
            Our performance-monitoring algorithm thinks you are not trying very hard.<br />
            Please review the instructions and adjust your strategy if necessary.<br />
            All submissions are reviewed for quality before approval.<br />
            Please do your best, otherwise we cannot use your data.<br /><br />
            Press Enter to proceed.
          </div>`,
        hide: true,
        parent: this.dom,
      }),
    };

    for (let name of Object.keys(this.children)) {
      this[name] = this.children[name]; // easy reference
    }
  }

  addChild(
    childElement = required('childElement'),
    childName = required('childName')
  ) {
    this.children[childName] = childElement;
    this[childName] = this.children[childName];
  }

  /**
   * Show one of the child elements of the blocker element
   * @param [HTMLElement|string] child - child element to show (key name or DOM element)
   */
  show(child = required('child')) {
    super.show();
    for (let [key, elem] of Object.entries(this.children)) {
      if (key === child || elem === child) {
        elem.show();
      } else {
        elem.hide();
      }
    }
  }

  hide() {
    super.hide();
    for (let child of Object.values(this.children)) {
      child.hide();
    }
  }
}
