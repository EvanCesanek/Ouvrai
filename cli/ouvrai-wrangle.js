#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { fileURLToPath, URL } from 'url';
import ora from 'ora';
import inquirer from 'inquirer';
import { readdir } from 'fs/promises';

const program = new Command()
  .name('ouvrai wrangle')
  .argument('<experiment>', 'Name of experiment')
  .option(
    '-f, --format [pkl|csv|xls]',
    'Desired file format for data tables',
    'pkl'
  )
  .showHelpAfterError()
  .parse();

let dataPath = new URL(
  `../experiments/${program.args[0]}/analysis/`,
  import.meta.url
);
let dataPathDecoded = fileURLToPath(dataPath);

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

let data_folder = `"${dataPathDecoded}"`;

let pythonDir = new URL('../python', import.meta.url);

let options = program.opts();

let errorMessage = '';
async function spawnPython(command, args, fallbackCommand) {
  let subprocess = spawn(command, args, {
    stdio: ['inherit', 'inherit', 'pipe'],
    cwd: pythonDir,
    shell: true,
  });
  subprocess.stderr.on('data', (data) => {
    errorMessage += data;
  });
  subprocess
    .on('close', (code) => {
      if (code === 127) {
        ora(errorMessage.slice(0, -1)).info();
        subprocess.emit('retry');
      } else if (code !== 0) {
        ora(errorMessage.slice(0, -1)).fail();
      } else {
        return command;
      }
    })
    .on('retry', () => {
      spawnPython(fallbackCommand, args);
    });
}

await spawnPython('pip3', ['install', '--editable', '.', '--quiet'], 'pip');

spawnPython('python3', ['wrangle.py', data_folder, options.format], 'python');
