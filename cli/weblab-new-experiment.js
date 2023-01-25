#!/usr/bin/env node

import { Command } from 'commander';
import { join } from 'path';
import { copySync } from 'fs-extra/esm';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions

import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();
program
  .name('weblab new-experiment')
  .option('-o, --overwrite', 'overwrite existing experiment')
  .argument('<experiment-name>', 'name of experiment')
  .argument('[template-name]', 'name of template')
  .showHelpAfterError();
program.parse(process.argv);

const options = program.opts();
// Find the config file for this experiment
const expName = program.args[0];
const templateName = program.args[1] || 'minimal';
const projectPath = join(__dirname, '../experiments', expName);
const templatePath = join(__dirname, '../templates', templateName);

try {
  copySync(templatePath, projectPath, {
    overwrite: options.overwrite,
    errorOnExist: true,
  });
  console.log('success!');
} catch (err) {
  console.error(err);
  process.exit(1);
}

spawn('npm i', {
  shell: true,
  stdio: 'inherit', // inherit parent process IO streams
  cwd: projectPath, // change working directory
});
