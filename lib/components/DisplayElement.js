/**
 * Superclass defining standard methods for display elements
 */
export class DisplayElement {
  dom;
  hidden;
  /**
   * Create a new DisplayElement
   * @param {HTMLElement|string} element - an existing element, or HTML string to be converted to element
   * @param {boolean} hide - default true! You must .show() elements in order to see them.
   * @param {string} display - default 'flex'
   * @param {HTMLElement} parent - optional parent element, triggers appendChild
   */
  constructor({ element, hide = true, display = 'flex', parent = false }) {
    if (typeof element === 'string' || element instanceof String) {
      element = DisplayElement.htmlToElement(element);
    }
    this.dom = element;
    this.display = display;
    this.hidden = hide;
    this.dom.style.display = hide ? 'none' : this.display;
    if (parent) {
      parent.appendChild(this.dom);
    }
  }

  show() {
    this.dom.style.display = this.display;
    this.hidden = false;
  }

  hide() {
    this.dom.style.display = 'none';
    this.hidden = true;
  }

  expand() {
    // get the height of the element's inner content, regardless of its actual size
    let sectionHeight = this.dom.scrollHeight;
    // have the element transition to the height of its inner content
    this.dom.style.height = sectionHeight + 'px';
    // when the next css transition finishes (which should be the one we just triggered)
    this.transitioning = true;
    this.dom.addEventListener(
      'transitionend',
      () => {
        // remove "height" from the element's inline styles, so it can return to its initial value
        this.dom.style.height = null;
        this.transitioning = false;
      },
      { once: true }
    );
    this.collapsed = false;
  }

  collapse() {
    // get the height of the element's inner content, regardless of its actual size
    let sectionHeight = this.dom.scrollHeight;
    // temporarily disable all css transitions
    let elementTransition = this.dom.style.transition;
    this.dom.style.transition = '';
    // on the next frame (as soon as the previous style change has taken effect),
    // explicitly set the element's height to its current pixel height, so we
    // aren't transitioning out of 'auto', and put back the css transitions
    requestAnimationFrame(() => {
      this.dom.style.height = sectionHeight + 'px';
      this.dom.style.transition = elementTransition; // EC: shouldn't we set it to null?
      // on the next frame (as soon as the previous style change has taken effect),
      // have the element transition to height: 0
      requestAnimationFrame(() => {
        this.dom.style.height = 0;
        this.transitioning = true;
        this.dom.addEventListener(
          'transitionend',
          () => {
            this.transitioning = false;
          },
          { once: true }
        );
      });
    });
    this.collapsed = true;
  }

  /**
   * Show an experiment component by changing CSS display property
   * @param {DisplayElement | HTMLElement} element - target element
   * @param {String} [display=block] - value of display property
   */
  static show(element, display = 'flex') {
    if (element instanceof HTMLElement) {
      // once you set the CSS display property, it overrides HTML hidden attribute
      // so we can use the hidden attribute as needed.
      element.style.display = display;
      element.hidden = display === 'none';
    } else if (element?.dom instanceof HTMLElement) {
      element.dom.style.display = display;
      element.hidden = display === 'none';
    } else {
      console.warn(
        'Neither element nor element.dom is not an instance of HTMLElement, so it cannot be shown or hidden.'
      );
    }
  }

  /**
   * Hide a DisplayElement by setting display property to 'none'
   * @param {DisplayElement} element - target element
   */
  static hide(element) {
    DisplayElement.show(element, 'none');
  }

  /**
   * Convert html string defining a single element to HTMLElement
   * @param {string} HTML representing a single element
   * @return {HTMLElement}
   */
  static htmlToElement(html) {
    let template = document.createElement('template');
    //html = html.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstElementChild; // this probably makes "html.trim" unnecessary
  }

  /**
   * Convert html string defining multiple sibling elements to a NodeList of HTMLElements
   * @param {string} HTML representing any number of sibling elements
   * @return {NodeList}
   */
  static htmlToElements(html) {
    let template = document.createElement('template');
    template.innerHTML = html;
    return template.content.childNodes;
  }
}
