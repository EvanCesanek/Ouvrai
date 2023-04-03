#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath, URL } from 'url';
import ora from 'ora';
import inquirer from 'inquirer';
import { readdir } from 'fs/promises';
import { spawnSyncPython } from './cli-utils.js';

const program = new Command()
  .name('ouvrai wrangle')
  .argument('<experiment>', 'Name of experiment')
  .option(
    '-f, --format [pkl|csv|xlsx]',
    'Desired file format for data tables',
    'pkl'
  )
  .showHelpAfterError()
  .parse();

let options = program.opts();

let dataURL = new URL(
  `../experiments/${program.args[0]}/analysis/`,
  import.meta.url
);
let dataPath = fileURLToPath(dataURL);
dataPath = `'${dataPath}'`;

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

let subp = spawnSyncPython(
  'python3',
  ['wrangle.py', dataPath, options.format, fileRegex],
  'python'
);
if (subp.status === 1) {
  ora(
    `Failed to wrangle JSON files. Usually this is because you did not install the python package during ouvrai setup.`
  ).fail();
}
