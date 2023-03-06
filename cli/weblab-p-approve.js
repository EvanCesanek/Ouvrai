#!/usr/bin/env node

import axios from 'axios';
import { Command } from 'commander';
import { getStudyConfig } from './cli-utils';

const program = new Command()
  .name('weblab p-approve')
  .argument('<experiment-name>', 'name of experiment directory')
  .argument('<study-id>', 'Prolific study ID')
  .parse();

let config = await getStudyConfig(program.args[0]);

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
