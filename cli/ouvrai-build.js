import { Command } from 'commander';
import { fileURLToPath, URL } from 'url';
import ora from 'ora';
import { build } from 'vite';
import { join, relative } from 'path';
import inquirer from 'inquirer';
import inquirerFileTreeSelection from 'inquirer-file-tree-selection-prompt';
import { exists } from './cli-utils.js';
inquirer.registerPrompt('file-tree-selection', inquirerFileTreeSelection);

const program = new Command()
  .name('ouvrai build')
  .argument('<studyname>', 'Name of study')
  .option('-g, --github', 'Build a demo version for GitHub Pages')
  .showHelpAfterError()
  .parse();

const options = program.opts();
const studyName = program.args[0];

// We use a Vite environment variable to make the name available to the source files.
// See /lib/components/Experiment.js: this.cfg.experiment = import.meta.env.VITE_EXPERIMENT_NAME;
process.env.VITE_EXPERIMENT_NAME = studyName;

const studyURL = new URL(`../experiments/${studyName}`, import.meta.url);
const studyPath = fileURLToPath(studyURL);

let buildPath = join(studyPath, 'dist');

let spinner = ora(`Accessing study at ${studyPath}`).start();
if (await exists(studyURL)) {
  spinner.succeed();
} else {
  spinner.fail(`No study found at ${studyPath}`);
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
  buildPath = answers.path;
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

const srcPath = join(studyPath, 'src');
let res = await build({
  root: srcPath, // index.html must be here
  base: buildBase ?? '/', // base == repo name to access assets on GitHub Pages
  build: {
    outDir: relative(srcPath, buildPath),
    emptyOutDir: true,
  },
});
