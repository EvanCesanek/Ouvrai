#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { URL } from 'url';

const program = new Command();
program.showHelpAfterError();

//spawn('npm', ['run', 'dev'], {
spawn(
  'npx',
  [
    'concurrently', //'-k',
    '-n Vite/React,Express',
    '-c magenta,green',
    '"vite src --open -c ./vite.config.js"',
    '"nodemon server.js"',
  ],
  {
    stdio: 'inherit', // inherit parent process IO streams
    cwd: new URL('../dashboard', import.meta.url), // change working directory
    shell: true,
  }
);
