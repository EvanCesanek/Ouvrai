import { Command } from 'commander';
import { fileURLToPath, URL } from 'url';
import ora from 'ora';
import { spawn } from 'child_process';
import { exists } from './cli-utils.js';

const program = new Command()
  .name('ouvrai dev')
  .argument('<studyname>', 'Name of study')
  .showHelpAfterError()
  .parse();

let options = program.opts();
let studyName = program.args[0];

// We use a Vite environment variable to make the name available to the source files.
// See /lib/components/Experiment.js: this.cfg.experiment = import.meta.env.VITE_EXPERIMENT_NAME;
process.env.VITE_EXPERIMENT_NAME = studyName;

const studyURL = new URL(`../experiments/${studyName}`, import.meta.url);
const studyPath = fileURLToPath(studyURL);

let spinner = ora(`Accessing study at ${studyPath}`).start();
if (await exists(studyURL)) {
  spinner.succeed();
} else {
  spinner.fail(`No study found at ${studyPath}`);
  process.exit(1);
}

// Ideally we would start emulators and vite dev server separately using APIs, but it doesn't work well...

// Emulators: Works but no console output...
// let client = await firebaseClient();
// let projectId = await firebaseChooseProject(client);
// client.emulators.start({ project: projectId, only: 'auth,database' });

// Vite Server: This works
// let server = await createServer({
//   root: `${studyPath}/src`,
//   publicDir: '/static'
// });
// await server.listen();
// server.printUrls();

// Problems with above lead us to alternative solution using subprocess shell commands
// This works - and is better than requiring this command to be a script in all package.json
spinner = ora(
  'Spawning child processes for Vite and Firebase Emulators...'
).start();
let subprocess = spawn(
  'npx',
  [
    'concurrently', //'-k',
    '-n Vite,Firebase',
    '-c magenta,red',
    '"vite src --open"',
    `"firebase emulators:start --only auth,database"`,
  ],
  {
    cwd: studyURL,
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
  }
);
subprocess.on('spawn', () => spinner.succeed());
subprocess.on('error', (err) => {
  ora(
    `Error in spawn('npx concurrently "vite src" "firebase emulators:start"'`
  ).fail();
  throw err;
});
