import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { URL } from 'url';

const program = new Command()
  .name('ouvrai launch')
  .showHelpAfterError()
  .parse();

let dashboardURL = new URL('../dashboard', import.meta.url);

// Install package (just in case)
spawn('npm', ['i'], {
  stdio: 'inherit', // inherit parent process IO streams
  cwd: dashboardURL, // change working directory
  shell: true,
});

// Start Vite + React and Express
spawn(
  'npx',
  [
    'concurrently', //'-k',
    '-n Vite,Express',
    '-c magenta,green',
    '"vite src --open -c ./vite.config.js"',
    '"nodemon server.js"',
  ],
  {
    stdio: 'inherit', // inherit parent process IO streams
    cwd: dashboardURL, // change working directory
    shell: true,
  }
);
