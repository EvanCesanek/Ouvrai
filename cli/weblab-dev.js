import { Command } from 'commander';
import { spawn } from 'child_process';
import { URL } from 'url';
import { access } from 'fs/promises';
import ora from 'ora';

const program = new Command()
  .argument('<experiment-name>', 'name of experiment')
  .showHelpAfterError()
  .parse();

// Another approach on Unix systems is to include
// VITE_EXPERIMENT_NAME = $(basename \"$PWD\")
// in the "dev" script and develop with "npm run dev"
// But this is better because it is cross-platform
process.env.VITE_EXPERIMENT_NAME = program.args[0];

const experimentDir = new URL(
  `../experiments/${program.args[0]}`,
  import.meta.url
);

let spinner = ora(`Validating experiment name "${program.args[0]}"`).start();
try {
  await access(experimentDir);
  spinner.succeed();
} catch (err) {
  spinner.fail(err.message);
  process.exit(1);
}

let subprocess = spawn('npm', ['run', 'dev'], {
  cwd: experimentDir,
  stdio: 'inherit',
});
subprocess.on('error', (err) => {
  console.log(err.message);
  process.exit(1);
});
