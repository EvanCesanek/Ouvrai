import { DisplayElement } from './DisplayElement';

export class JSONReader extends DisplayElement {
  // Simplified from https://gomakethings.com/how-to-upload-and-process-a-json-file-with-vanilla-js/
  constructor() {
    let html = `\
      <div style="margin-top:10px">
        <input type="file" id="file" accept=".json">
      </div>`;
    super({
      element: html,
      parent: document.getElementById('points-panel'),
      hide: false,
    });

    this.file = document.getElementById('file');

    this.reader = new FileReader();
    this.reader.addEventListener('load', this.handleFile.bind(this));

    this.file.addEventListener('change', this.handleSubmit.bind(this));
  }

  /**
   * Handle selected file change events
   * @param {Event} event The file change event
   */
  handleSubmit() {
    // If there's no file, do nothing
    if (!this.file.value.length) return;
    // Read the file
    this.reader.readAsText(this.file.files[0]);
  }

  /**
   * Log the uploaded file to the console
   * @param {Event} event The file loaded event
   */
  handleFile(event) {
    let str = event.target.result;
    this.json = JSON.parse(str);
    console.log('json', this.json);
    this.dom.dispatchEvent(new Event('jsonload'));
  }
}
