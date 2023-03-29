#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { copy } from 'fs-extra/esm';
import ora from 'ora';
import { exists } from './cli-utils.js';
import { fileURLToPath } from 'url';

const program = new Command()
  .name('ouvrai templatize')
  .argument('<experiment>', 'Name of experiment')
  .argument('<template>', 'Name of template')
  .option('-o, --overwrite', 'Overwrite existing template')
  .showHelpAfterError()
  .parse();

const options = program.opts();
const expName = program.processedArgs[0];
const templateName = program.processedArgs[1];

const projectPath = new URL(`../experiments/${expName}`, import.meta.url);
const projectPathDecoded = fileURLToPath(projectPath);
const templatePath = new URL(`../templates/${templateName}`, import.meta.url);
const templatePathDecoded = fileURLToPath(templatePath);

let spinner = ora(`Checking for template at ${templatePathDecoded}`).start();
if (await exists(templatePath)) {
  if (!options.overwrite) {
    spinner.fail(
      `${templatePathDecoded} already exists! Use the --overwrite (-o) flag if this is really what you want.`
    );
    process.exit(1);
  } else {
    spinner.warn('Overwriting existing template!');
  }
} else {
  spinner.succeed();
}

try {
  spinner = ora(`Copying source files from ${projectPathDecoded}`).start();
  try {
    await copy(`${projectPathDecoded}/src`, `${templatePathDecoded}/src`, {
      overwrite: options.overwrite,
      errorOnExist: true,
    });
    spinner.succeed();
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }

  spinner = ora(`Copying study-config.js from ${projectPathDecoded}`).start();
  try {
    await copy(
      `${projectPathDecoded}/study-config.js`,
      `${templatePathDecoded}/study-config.js`,
      {
        overwrite: options.overwrite,
        errorOnExist: true,
      }
    );
    spinner.succeed();
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }

  spinner = ora(`Copying package.json from ${projectPathDecoded}`).start();
  try {
    await copy(
      `${projectPathDecoded}/package.json`,
      `${templatePathDecoded}/package.json`,
      {
        overwrite: options.overwrite,
        errorOnExist: true,
      }
    );
    spinner.succeed();
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
