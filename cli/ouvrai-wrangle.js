#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { fileURLToPath, URL } from 'url';

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

let data_folder = fileURLToPath(
  new URL(`../experiments/${program.args[0]}/analysis/`, import.meta.url)
);
data_folder = `"${data_folder}"`;

let options = program.opts();
let subprocess = spawn('pip3', ['install', '-e', '.'], {
  stdio: 'inherit', // inherit parent process IO streams
  cwd: new URL('../python', import.meta.url), // change working directory
  shell: true,
});
subprocess.on('close', (code) => {
  let subprocess = spawn(
    'python3',
    ['wrangle.py', data_folder, options.format],
    {
      stdio: 'inherit', // inherit parent process IO streams
      cwd: new URL('../python', import.meta.url), // change working directory
      shell: true,
    }
  );
});
