#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { copy } from 'fs-extra/esm';
import ora from 'ora';
import { exists } from './cli-utils.js';

const program = new Command();
program
  .name('weblab new-experiment')
  .option('-o, --overwrite', 'overwrite existing experiment')
  .argument('<experiment-name>', 'name of experiment')
  .argument('[template-name]', 'name of template', 'minimal')
  .showHelpAfterError();
program.parse();

const options = program.opts();
const expName = program.processedArgs[0];
const templateName = program.processedArgs[1];

const projectPath = new URL(`../experiments/${expName}`, import.meta.url)
  .pathname;
const templatePath = new URL(`../templates/${templateName}`, import.meta.url)
  .pathname;
const settingsPath = new URL('../config/template', import.meta.url).pathname;

let spinner = ora(`Checking if ${projectPath} already exists`).start();
if (await exists(projectPath)) {
  if (!options.overwrite) {
    spinner.fail(
      `${projectPath} already exists! Use the --overwrite (-o) flag if this is really what you want.`
    );
    process.exit(1);
  } else {
    spinner.warn('Overwriting existing study!');
  }
} else {
  spinner.succeed();
}

try {
  spinner = ora(`Copying template files from ${templatePath}`).start();
  try {
    await copy(templatePath, projectPath, {
      overwrite: options.overwrite,
      errorOnExist: true,
    });
    spinner.succeed();
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }

  spinner = ora(`Copying config files from ${settingsPath}`).start();
  try {
    await copy(settingsPath, projectPath, {
      overwrite: options.overwrite,
      errorOnExist: true,
    });
    spinner.succeed();
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

spinner = ora('Installing npm dependencies').start();
let subprocess = spawn('npm', ['i'], {
  //stdio: 'inherit',
  cwd: projectPath,
});
subprocess.on('error', (err) => {
  spinner.fail(`Failed to install npm dependencies from package.json.`);
  process.exit(1);
});
subprocess.on('close', (err) => {
  spinner.succeed(`New study created at ${projectPath}`);
});
