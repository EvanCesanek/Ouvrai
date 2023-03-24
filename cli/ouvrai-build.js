import { Command } from 'commander';
import { fileURLToPath, URL } from 'url';
import ora from 'ora';
import { build } from 'vite';
import { relative } from 'path';
import inquirer from 'inquirer';
import inquirerFileTreeSelection from 'inquirer-file-tree-selection-prompt';
import { exists } from './cli-utils.js';
inquirer.registerPrompt('file-tree-selection', inquirerFileTreeSelection);

const program = new Command()
  .argument('<experiment-name>', 'name of experiment')
  .option('-g, --github', 'build demo version for GitHub Pages')
  .showHelpAfterError()
  .parse();

const options = program.opts();

// We use a Vite environment variable to make the experiment name available to the source files.
// See /lib/components/Experiment.js: this.cfg.experiment = import.meta.env.VITE_EXPERIMENT_NAME;
process.env.VITE_EXPERIMENT_NAME = program.args[0];

const projectPath = new URL(
  `../experiments/${program.args[0]}`,
  import.meta.url
);
const projectPathDecoded = fileURLToPath(projectPath);
let buildDir = `${projectPathDecoded}/dist`;

let spinner = ora(`Accessing study at ${projectPathDecoded}.`).start();
if (await exists(projectPath)) {
  spinner.succeed();
} else {
  spinner.fail(`No study found at ${projectPathDecoded}.`);
  process.exit(1);
}

let buildBase;
if (options.github) {
  let answers = await inquirer.prompt([
    {
      type: 'file-tree-selection',
      name: 'path',
      message:
        'Directory of local repo where you want to build this demo version?',
      onlyShowDir: true,
      enableGoUpperDirectory: true,
    },
  ]);
  buildDir = answers.path;
  answers = await inquirer.prompt([
    {
      type: 'input',
      default: answers.path.substring(answers.path.lastIndexOf('/') + 1),
      message: 'Name of GitHub repo where you will push this demo version?',
      name: 'name',
    },
  ]);
  buildBase = `/${answers.name}/`;
}

let res = await build({
  root: `${projectPathDecoded}/src`, // index.html must be here
  base: buildBase ?? '/', // base == repo name to access assets on GitHub Pages
  publicDir: 'public',
  build: {
    outDir: relative(`${projectPathDecoded}/src`, buildDir),
    emptyOutDir: true,
  },
});
