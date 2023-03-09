import { Command } from 'commander';
import { URL } from 'url';
import ora from 'ora';
import { access } from 'fs/promises';
import { build } from 'vite';
import { relative } from 'path';
import inquirer from 'inquirer';
import inquirerFileTreeSelection from 'inquirer-file-tree-selection-prompt';
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

const experimentDir = new URL(
  `../experiments/${program.args[0]}`,
  import.meta.url
);
let buildDir = `${experimentDir.pathname}/dist`;

let spinner = ora(`Validating experiment name "${program.args[0]}"`).start();
try {
  await access(experimentDir);
  spinner.succeed();
} catch (err) {
  spinner.fail(err.message);
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
  root: `${experimentDir.pathname}/src`, // index.html must be here
  base: buildBase ?? '/', // base == repo name to access assets on GitHub Pages
  publicDir: 'public',
  build: {
    outDir: relative(`${experimentDir.pathname}/src`, buildDir),
    emptyOutDir: true,
  },
});
