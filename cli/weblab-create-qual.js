#!/usr/bin/env node

import { Command } from 'commander';
import {
  MTurkClient,
  CreateQualificationTypeCommand,
} from '@aws-sdk/client-mturk';
import { join } from 'path';
import { existsSync } from 'fs';
import readline from 'readline';
import { ask } from './cli-utils.js';

import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('weblab create-qual')
  .option('-s --sandbox', 'use MTurk sandbox')
  .argument('<experiment-name>', 'name of experiment directory')
  .showHelpAfterError();

program.parse(process.argv);
const options = program.opts();

// Find the config file for this experiment
const expName = program.args[0];
var configPath = join(__dirname, '../experiments', expName, 'mturk-config.mjs');
if (!existsSync(configPath)) {
  console.error('ERROR: config file not found');
  process.exit(1);
}
// Note: Need async import() for variable import paths in ECScript
var config;
try {
  config = await import(configPath);
} catch (error) {
  console.error('ERROR: failed to import config file');
  console.error(error.message);
  process.exit(1);
}
config = config.parameters;

// If sandbox set by flag, and not already in config file, update config parameters
if (options.sandbox && !config.sandbox) {
  console.log('\n[create-qual] You are using the Requester Sandbox');
  config.endpoint = config.sandboxEndpoint;
  config.previewURL = config.sandboxPreviewURL;
}

// Set up MTurk connection
const client = new MTurkClient({
  region: 'us-east-1',
  endpoint: config.endpoint,
});

// Set up CL input interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.pause();

var query = '\nPlease enter your initials: ';
var user_initials = await ask(rl, query);

var qual_params = {
  Name: expName + '_' + user_initials,
  Description: config.newQualDescription,
  Keywords: config.newQualKeywords + ', ' + user_initials,
  QualificationTypeStatus: 'Active',
};

query = `\nYou are trying to create the following qualification:\
  \n${JSON.stringify(qual_params, null, 2)}\
  \nIf you would like to continue, type "yes": `;
var answer = await ask(rl, query);
if (answer === 'yes') {
  const createQualificationTypeCommand = new CreateQualificationTypeCommand(
    qual_params
  );
  var createQualificationTypeCommandOutput;
  try {
    createQualificationTypeCommandOutput = await client.send(
      createQualificationTypeCommand
    );
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }
  console.log('- Qualification created.');
  console.log(createQualificationTypeCommandOutput.QualificationType); // successful response
} else {
  console.log('- Qualification not created.\n');
}
