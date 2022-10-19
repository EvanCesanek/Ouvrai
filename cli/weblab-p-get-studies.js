#!/usr/bin/env node

import axios from 'axios';
import { Command } from 'commander';

const program = new Command();
program
  .name('weblab p-get-studies')
  .option('-v --verbose', 'display lots of info', false);
program.parse(process.argv);
const options = program.opts();

const res = await axios.get('https://api.prolific.co/api/v1/studies/', {
  headers: {
    Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
  },
});

//console.log(`Status Code: ${res.status}`);
//console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
//console.log(`Data: ${JSON.stringify(res.data, null, 2)}`);

res.data.results.forEach((studyInfo) => {
  if (!options.verbose) {
    delete studyInfo.study_type;
    delete studyInfo.internal_name;
    delete studyInfo.publish_at;
    delete studyInfo.is_underpaying;
    delete studyInfo.reward_level;
    delete studyInfo.quota_requirements;
    delete studyInfo.is_reallocated;
    delete studyInfo.privacy_notice;
  }
  console.log(JSON.stringify(studyInfo, null, 2));
});
