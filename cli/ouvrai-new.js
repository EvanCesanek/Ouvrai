#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { copy } from 'fs-extra/esm';
import ora from 'ora';
import { exists } from './cli-utils.js';
import { readdir } from 'fs/promises';

const program = new Command();
program
  .option('-o, --overwrite', 'overwrite existing experiment')
  .argument('<experiment-name>', 'name of experiment')
  .argument('<template-name>', 'name of template')
  .showHelpAfterError();
program.parse();

const options = program.opts();
const expName = program.processedArgs[0];
const templateName = program.processedArgs[1];

const projectPath = new URL(`../experiments/${expName}`, import.meta.url);
const projectPathDecoded = decodeURIComponent(projectPath.pathname);
const templatePath = new URL(`../templates/${templateName}`, import.meta.url);
const templatePathDecoded = decodeURIComponent(templatePath.pathname);
const settingsPath = new URL('../config/template', import.meta.url);
const settingsPathDecoded = decodeURIComponent(settingsPath.pathname);

let spinner = ora(`Checking that ${templatePathDecoded} exists`).start();
if (!(await exists(templatePath))) {
  let templateNames = await readdir(new URL(`../templates`, import.meta.url));
  // Filter out .DS_Store and other hidden files
  templateNames = templateNames.filter((item) => !/(^|\/)\.[^/.]/g.test(item));
  spinner.fail(
    `Invalid template name. Valid templates names are: ${templateNames.join(
      ', '
    )}`
  );
  process.exit(1);
} else {
  spinner.succeed();
}

spinner = ora(`Checking if ${projectPathDecoded} already exists`).start();
if (await exists(projectPath)) {
  if (!options.overwrite) {
    spinner.fail(
      `${projectPath.pathname} already exists! Use the --overwrite (-o) flag if this is really what you want.`
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

  spinner = ora(`Copying config files from ${settingsPathDecoded}`).start();
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

spinner = ora('Installing npm dependencies').info();
let subprocess = spawn('npm', ['i'], {
  stdio: 'inherit',
  cwd: projectPath,
});
subprocess.on('error', (err) => {
  spinner.fail(`Failed to install npm dependencies from package.json.`);
  process.exit(1);
});
subprocess.on('close', (err) => {
  spinner.succeed(`New study created at ${projectPath}`);
});
