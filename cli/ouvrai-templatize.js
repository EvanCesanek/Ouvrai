#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { copy } from 'fs-extra/esm';
import ora from 'ora';
import { exists } from './cli-utils.js';

const program = new Command();
program
  .option('-o, --overwrite', 'overwrite existing template')
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

let spinner = ora(`Checking if ${templatePathDecoded} already exists`).start();
if (await exists(templatePath)) {
  if (!options.overwrite) {
    spinner.fail(
      `${templatePath} already exists! Use the --overwrite (-o) flag if this is really what you want.`
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
