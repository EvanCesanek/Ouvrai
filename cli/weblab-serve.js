#!/usr/bin/env node

import { Command } from 'commander';
import { join } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions

import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();
program
  .name('weblab serve')
  .argument('<experiment-name>', 'name of experiment directory')
  .showHelpAfterError();
program.parse(process.argv);

// Find the config file for this experiment
const expName = program.args[0];
const projectPath = join(__dirname, '../experiments', expName);
if (!existsSync(projectPath)) {
  console.error('ERROR: experiment directory not found');
  process.exit(1);
}

// https://www.freecodecamp.org/news/node-js-child-processes-everything-you-need-to-know-e69498fe970a/
// SPAWN() inputs: system command, array of command arguments, options object
//  - If shell:true in the options, we can write command+args in shell syntax as the first input
spawn('firebase emulators:start', {
  shell: true,
  stdio: 'inherit', // inherit parent process IO streams
  cwd: projectPath, // change working directory
});
