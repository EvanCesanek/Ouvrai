import { DisplayElement } from './DisplayElement';
//import { required } from '../utils';

/**
 * Class enabling fullscreen and pointer lock functionality. Includes an associated DisplayElement.
 * @extends DisplayElement
 */
export class Progressbar extends DisplayElement {
  numerator = 0;
  denominator = 1;
  seconds = 0;

  /**
   * Create a progressbar element.
   */
  constructor() {
    let html = `
    <div id="progressbar-container" class="weblab-component-div">
      <span
        >Time Elapsed: <label id="minutes">00</label>:<label id="seconds"
          >00</label
        ><br
      /></span>
      <div id="progressbar-outer" class="weblab-component-div">
        <div id="progressbar-inner"></div>
      </div>
    </div>`;
    super({
      element: html,
      hide: false,
      parent: document.getElementById('footer'),
    });

    this.secondsElem = document.getElementById('seconds');
    this.minutesElem = document.getElementById('minutes');
    setInterval(this.setTime.bind(this), 1000);
  }

  /**
   * Update the progress bar according to current progress.
   * @param {Number} numerator - number of trials completed
   * @param {Number} [denominator=this.denominator] - total number of trials
   */
  update(numerator, denominator = this.denominator) {
    this.numerator = numerator;
    this.denominator = denominator;
    document.getElementById('progressbar-inner').style.width =
      (100 * this.numerator) / this.denominator + '%';
  }

  setTime() {
    this.seconds++;
    this.secondsElem.textContent = String(this.seconds % 60).padStart(2, '0');
    this.minutesElem.textContent = String(parseInt(this.seconds / 60)).padStart(
      2,
      '0'
    );
  }
}
