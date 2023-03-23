import { Command } from 'commander';
import { URL } from 'url';
import { access } from 'fs/promises';
import ora from 'ora';
import { spawn } from 'child_process';

const program = new Command()
  .argument('<experiment-name>', 'name of experiment')
  .showHelpAfterError()
  .parse();

// We use a Vite environment variable to make the experiment name available to the source files.
// See /lib/components/Experiment.js: this.cfg.experiment = import.meta.env.VITE_EXPERIMENT_NAME;
process.env.VITE_EXPERIMENT_NAME = program.args[0];

const projectPath = new URL(
  `../experiments/${program.args[0]}`,
  import.meta.url
);
const projectPathDecoded = decodeURIComponent(projectPath.pathname);

let spinner = ora(`Accessing study at ${projectPathDecoded}.`).start();
if (await exists(projectPath)) {
  spinner.succeed();
} else {
  spinner.fail(`'No study found at ${projectPathDecoded}'.`);
  process.exit(1);
}

// Ideally we would start emulators and vite dev server separately using APIs...
// Emulators: This works but no console output...
// let client = firebaseClient();
// let projectId = await firebaseChooseProject(client);
// client.emulators.start({ project: projectId, only: 'auth,database' });
// Vite Server: This works
// let server = await createServer({
//   root: `${projectPathDecoded}/src`,
//   publicDir: '/static'
// });
// await server.listen();
// server.printUrls();

// Problems with above lead us to alternative solution using subprocess shell commands
// This works - better than requiring this command to be a script in all package.json
let subprocess = spawn(
  'npx',
  [
    'concurrently', //'-k',
    '-n Vite,Firebase',
    '-c magenta,red',
    '"vite src --open"', // npx not needed if shell=true
    '"firebase emulators:start --only auth,database"',
  ],
  {
    cwd: projectPath,
    stdio: 'inherit',
    shell: true,
  }
);
subprocess.on('error', (err) => {
  console.log(err.message);
  process.exit(1);
});
