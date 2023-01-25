#!/usr/bin/env node

import axios from 'axios';
import { Command } from 'commander';
import { join } from 'path';
import { existsSync } from 'fs';

const program = new Command();
program
  .name('weblab p-send-bonus')
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

const csvBonuses = config.workersToBonus
  .flatMap((v, i) => [v, ',', config.bonusAmounts[i], '\n'])
  .join('');

let url = `https://api.prolific.co/api/v1/submissions/bonus-payments/`;
let res = await axios.post(
  url,
  { study_id: program.args[1], csv_bonuses: csvBonuses },
  {
    headers: {
      Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
    },
  }
);

if (res.status === 201) {
  console.log('[p-send-bonus] Bonus payments created.');
  console.log(csvBonuses);
  console.log(res.data);

  url = `https://api.prolific.co/api/v1/bulk-bonus-payments/${res.data.id}/pay/`;
  const res2 = await axios.post(
    url,
    {},
    {
      headers: {
        Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
      },
    }
  );

  if (res2.status === 202)
    console.log('[p-send-bonus] Success. Bonuses will be paid asynchronously.');
}
