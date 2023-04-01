#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath, URL } from 'url';
import ora from 'ora';
import inquirer from 'inquirer';
import { readdir } from 'fs/promises';
import { spawnPython } from './cli-utils.js';

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

let dataPath = new URL(
  `../experiments/${program.args[0]}/analysis/`,
  import.meta.url
);
let dataPathDecoded = fileURLToPath(dataPath);
let data_folder = `'${dataPathDecoded}'`;

await spawnPython(
  'python3',
  ['wrangle.py', data_folder, options.format],
  'python'
);

// WIP: UI to select files you want
// let jsonFiles = await readdir(dataPath);
// jsonFiles = jsonFiles.filter((fn) => fn.endsWith('.json'));
// if (jsonFiles.length > 1) {
//   let answers = await inquirer.prompt([
//     {
//       name: 'filesToWrangle',
//       type: 'checkbox',
//       message: 'Select the .json files you would like to wrangle:',
//       choices: jsonFiles,
//     },
//   ]);
//   jsonFiles = answers.filesToWrangle;
// }
// if (jsonFiles.length === 0) {
//   ora(
//     `wrangle requires at least one .json file from ${dataPathDecoded}.`
//   ).fail();
//   process.exit();
// }

// spawnPython(
//   'python3',
//   ['wrangle.py', data_folder, options.format, ...jsonFiles],
//   'python'
// );
