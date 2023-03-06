#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { URL } from 'url';

const program = new Command();
program.name('weblab launch-dashboard').showHelpAfterError();

spawn('npm', ['run', 'dev'], {
  stdio: 'inherit', // inherit parent process IO streams
  cwd: new URL('../dashboard', import.meta.url), // change working directory
});
