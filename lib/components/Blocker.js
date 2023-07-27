import { required } from './utils';
import { DisplayElement } from './DisplayElement';
import { Fullscreen } from './Fullscreen';
import { Pointerlock } from './Pointerlock';

/**
 * The Blocker class controls the 'blocker' DOM element in the default Ouvrai HTML layout.
 * This element is a transparent overlay on the whole window that blocks cursor interactions with study DOM elements underneath.
 * It is typically used to notify the participant when a required feature, such as fullscreen or VR, is not supported or enabled.
 */
export class Blocker extends DisplayElement {
  /**
   * Every Blocker contains a {@link Fullscreen} element.
   * @type {Fullscreen}
   */
  fullscreen;
  /**
   * Every Blocker contains a {@link Pointerlock} element.
   * @type {Pointerlock}
   */
  pointerlock;

  /**
   * Create a new Blocker instance.
   * @param {Boolean} allowExitFullscreen
   * @param {Boolean} allowExitPointerlock
   */
  constructor(allowExitFullscreen, allowExitPointerlock) {
    super({ element: document.getElementById('blocker'), hide: true });
    this.fullscreen = new Fullscreen({
      allowExit: allowExitFullscreen,
    });
    this.pointerlock = new Pointerlock({
      allowExit: allowExitPointerlock,
    });

    /**
     * The Blocker is primarily an interface to its children, each of which is a {@link DisplayElement}.
     * @type {Object}
     */
    this.children = {
      fullscreen: this.fullscreen,
      pointerlock: this.pointerlock,
      /** Element used to block users who are not using Chrome */
      chrome: new DisplayElement({
        element: `
          <div id="chrome-required-content" class="component-div">
            <p>
              This experiment requires a recently updated version of Google Chrome.<br />
              Please copy the full URL and reopen it in Chrome.<br />
              Thank you! We apologize for any inconvenience.
            </p>
          </div>`,
        hide: true,
        parent: this.dom,
      }),
      /** Element used to block users who are not using a desktop computer */
      desktop: new DisplayElement({
        element: `
          <div id="desktop-required-content" class="component-div">
            <p>
              This experiment is not supported on mobile devices.<br />
              Please reopen it on a desktop or laptop computer in Google Chrome.<br />
              Thank you! We apologize for any inconvenience.
            </p>
          </div>`,
        hide: true,
        parent: this.dom,
      }),
      /** Element used to block users who are not currently connected to Firebase */
      database: new DisplayElement({
        element: `
          <div id="connection-required-content" class="component-div">
            <p>
              Warning: Not connected to the database server!<br />
              The experiment will resume when you are connected.<br />
              Please complete this experiment with a stable internet connection.
            </p>
          </div>`,
        hide: true,
        parent: this.dom,
      }),
      /** Element used to warn users who are failing an "attention check" */
      attention: new DisplayElement({
        element: `
          <div id="attention-check-content" class="component-div" style="line-height:1.5em">
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
      /** Element used to block users who are not using a VR device */
      openInVR: new DisplayElement({
        element: `
          <div id="open-in-vr-content" class="component-div" style="line-height: 1.5em">
            <h3 style="margin-block: 0">
              You must use a virtual reality headset to open this study.
            </h3>
            <p style="margin-block: 0; line-height: 2em">
              Put on headset → Open VR web browser → Log in to Prolific → 'Open study in new window'<br />
            </p>
          </div>`,
        hide: true,
        parent: this.dom,
      }),
    };

    for (let name of Object.keys(this.children)) {
      this[name] = this.children[name]; // easy reference
    }
  }

  /**
   * Add a custom {@link DisplayElement} to the Blocker object so it can be shown/hidden as needed.
   * @param {DisplayElement} childElement Element to be added to Blocker children
   * @param {String} childName Name of the element
   */
  addChild(
    childElement = required('childElement'),
    childName = required('childName')
  ) {
    this.children[childName] = childElement;
    this[childName] = this.children[childName];
  }

  /**
   * Show the blocker and one of its children.
   * @param {HTMLElement|String} child Child element to show, can be the name or the DOM element itself.
   */
  show(child) {
    if (!child) {
      console.warn(
        `You must supply an argument to blocker.show(). Valid inputs are: ${Object.keys(
          this.children
        )}`
      );
      return;
    }
    super.show();
    for (let [key, elem] of Object.entries(this.children)) {
      if (key === child || elem === child) {
        elem.show();
      } else {
        elem.hide();
      }
    }
  }

  /**
   * Hide the blocker (and all children).
   */
  hide() {
    super.hide();
    for (let child of Object.values(this.children)) {
      child.hide();
    }
  }

  /**
   * Create a new blocker child called `'fatalError'` with an error message and {@link show} it.
   * @param {Error} error An error that has been caught, to be rendered as text in the blocker.
   * @param {Boolean} devError Set true if displaying a custom error message for the developer to help resolve problem.
   */
  fatal(error, devError) {
    this.addChild(
      new DisplayElement({
        element: `
        <div id="open-in-vr-content" class="component-div" style="line-height: 1.5em">
          <h3 style="margin-block: 0">
            ${
              devError
                ? 'Hi developer!  👋  '
                : 'Fatal error! Please contact the researcher.'
            }
          </h3>
          <p style="margin-block: 0; line-height: 2em">
            ${error}
          </p>
        </div>`,
        hide: true,
        parent: this.dom,
      }),
      'fatalError'
    );
    this.show('fatalError');
  }
}
