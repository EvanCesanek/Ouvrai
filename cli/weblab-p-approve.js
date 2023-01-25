#!/usr/bin/env node

import axios from 'axios';
import { Command } from 'commander';
import { join } from 'path';
import { existsSync } from 'fs';

const program = new Command();
program
  .name('weblab p-approve')
  .argument('<experiment-name>', 'name of experiment directory')
  .argument('<study-id>', 'Prolific study ID');
program.parse(process.argv);

import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const expName = program.args[0];
const configPath = join(
  __dirname,
  '../experiments',
  expName,
  'mturk-config.mjs'
);
if (!existsSync(configPath)) {
  console.error(`ERROR: config file ${configPath} not found`);
  process.exit(1);
}
let config;
try {
  config = await import(configPath); // async import() for variable import paths in ES6+
} catch (error) {
  console.error('ERROR: failed to import config file');
  console.error(error.message);
  process.exit(1);
}
config = config.parameters;

let url = `https://api.prolific.co/api/v1/submissions/bulk-approve/`;
const res = await axios.post(
  url,
  { study_id: program.args[1], participant_ids: config.workersToApprove },
  {
    headers: {
      Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
    },
  }
);

console.log(res.data);
