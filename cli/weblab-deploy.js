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
  .name('weblab deploy')
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
spawn('firebase deploy', {
  shell: true,
  stdio: 'inherit', // inherit parent process IO streams
  cwd: projectPath, // change working directory
});

// // Alternative method uses a local install of firebase-tools, but it does not show the logger output
// import client from 'firebase-tools';
// try{
//   process.chdir(projectPath);
// }catch(error){
//   console.log(error.message);
// }
// try{
//   await client.deploy();
// }catch(error){
//   console.log(error.message);
// }
// await client.use('cognitivescience');
// const x = await client.database.instances.list();
// console.log(x);
