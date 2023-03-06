#!/usr/bin/env node

import axios from 'axios';
import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';

const program = new Command();
program.name('weblab get-prolific-screeners');
program.parse();

const res = await axios.get(
  'https://api.prolific.co/api/v1/eligibility-requirements/',
  {
    headers: {
      Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
    },
  }
);
await writeFile(
  new URL('../extras/all_screeners.json', import.meta.url),
  JSON.stringify(res.data.results, null, 2)
);
