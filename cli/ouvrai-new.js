#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { copy } from 'fs-extra/esm';
import ora from 'ora';
import { exists } from './cli-utils.js';
import { readdir } from 'fs/promises';
import { fileURLToPath } from 'url';

const program = new Command()
  .name('ouvrai new')
  .argument('<experiment>', 'name of experiment')
  .argument('<template>', 'name of template')
  .option('-o, --overwrite', 'overwrite existing experiment')
  .showHelpAfterError()
  .parse();

const options = program.opts();
const expName = program.processedArgs[0];
const templateName = program.processedArgs[1];

const projectPath = new URL(`../experiments/${expName}`, import.meta.url);
const projectPathDecoded = fileURLToPath(projectPath);
const templatePath = new URL(`../templates/${templateName}`, import.meta.url);
const templatePathDecoded = fileURLToPath(templatePath);
const settingsPath = new URL('../config/template', import.meta.url);
const settingsPathDecoded = fileURLToPath(settingsPath);

let spinner = ora(
  `Checking for study template at ${templatePathDecoded}`
).start();
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

spinner = ora(`Checking for existing study at ${projectPathDecoded}`).start();
if (await exists(projectPath)) {
  if (!options.overwrite) {
    spinner.fail(
      `${projectPathDecoded} already exists! Use the --overwrite (-o) flag if this is really what you want.`
    );
    process.exit(1);
  } else {
    spinner.warn('Overwriting existing study.');
  }
} else {
  spinner.succeed();
}

try {
  spinner = ora(`Copying template files from ${templatePathDecoded}`).start();
  try {
    await copy(templatePathDecoded, projectPathDecoded, {
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
    await copy(settingsPathDecoded, projectPathDecoded, {
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
  shell: true,
});
subprocess.on('error', (err) => {
  spinner.fail(`Failed to install npm dependencies from package.json.`);
  process.exit(1);
});
subprocess.on('close', (err) => {
  spinner.succeed(`New study created at ${projectPathDecoded}`);
});
