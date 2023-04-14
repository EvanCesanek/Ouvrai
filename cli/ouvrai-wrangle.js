import { Argument, Command } from 'commander';
import { fileURLToPath, URL } from 'url';
import ora from 'ora';
import inquirer from 'inquirer';
import { readdir } from 'fs/promises';
import { exists, spawnSyncPython } from './cli-utils.js';
import { basename, extname, join } from 'path';
import filenamify from 'filenamify';

const program = new Command()
  .name('ouvrai wrangle')
  .argument('<studyname>', 'Name of study')
  .addArgument(
    new Argument('[format]', 'Output file format')
      .choices(['pkl', 'csv', 'xlsx'])
      .default('pkl')
  )
  .option('-f, --filename [filename]', 'Specify output file name')
  .showHelpAfterError()
  .parse();

let studyName = program.processedArgs[0];
let format = program.processedArgs[1];
let filename = 'df';
let options = program.opts();
if (options.filename) {
  let extension = extname(options.filename);
  if (['.pkl', '.csv', '.txt', '.xlsx', '.xls'].includes(extension)) {
    format = extension.slice(1); // drop the .
    filename = filenamify(basename(options.filename, format));
  } else {
    filename = filenamify(options.filename);
  }
  if (filename === '') {
    ora(`Invalid filename: ${options.filename}`).fail();
    process.exit();
  }
}
ora(
  `Attempting to save files to: ${filename}_<table>_<date>_<time>.${format}`
).info();

let dataURL = new URL(`../experiments/${studyName}/analysis/`, import.meta.url);
let dataPath = fileURLToPath(dataURL);
dataPath = `'${dataPath}'`; // Must use single quotes for Windows (no idea why)

// UI to select files you want
let jsonFiles = await readdir(dataURL);
jsonFiles = jsonFiles.filter((fn) => fn.endsWith('.json'));
if (jsonFiles.length > 1) {
  let answers = await inquirer.prompt([
    {
      name: 'filesToWrangle',
      type: 'checkbox',
      message:
        'Wrangling all .json files by default. Deselect any files you want to exclude:',
      choices: jsonFiles,
      default: jsonFiles,
    },
  ]);
  jsonFiles = answers.filesToWrangle;
}
if (jsonFiles.length === 0) {
  ora(`You must supply at least one .json file in ${dataPath}`).fail();
  process.exit();
}

let fileRegex = `"(${jsonFiles.join('|')})"`;

let venvPath = fileURLToPath(new URL('../python/env', import.meta.url));
let venvPythonPathUnix = join(venvPath, 'bin', 'python');
let venvPythonPathWindows = join(venvPath, 'Scripts', 'python.exe');
let venvPythonCommand;
if (await exists(venvPythonPathUnix)) {
  venvPythonCommand = `"${venvPythonPathUnix}"`;
} else if (await exists(venvPythonPathWindows)) {
  venvPythonCommand = `"${venvPythonPathWindows}"`;
} else {
  throw new Error('Failed to find Python virtual environment for Ouvrai');
}

let subp = spawnSyncPython(venvPythonCommand, [
  'wrangle.py',
  dataPath,
  format,
  fileRegex,
  filename,
]);
if (subp.status === 1) {
  ora(
    `Failed to wrangle JSON files. Did you successfully install the Python utilities during ouvrai setup?`
  ).fail();
}
