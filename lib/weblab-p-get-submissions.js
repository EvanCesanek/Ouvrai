#!/usr/bin/env node

import axios from 'axios';
import { Command } from 'commander';

const program = new Command();
program
  .name('weblab p-get-submissions')
  .option('-v --verbose', 'display lots of info', false)
  .option('-a --approved', 'display Approved submissions', false)
  .argument('<study-id>', 'Prolific study ID');
program.parse(process.argv);
const options = program.opts();

let statuses = ['AWAITING REVIEW'];
if (options.approved) {
  statuses.push('APPROVED');
}

let url = `https://api.prolific.co/api/v1/studies/${program.args[0]}/submissions/`;
const results = await retrieveSubmissions(url);

let participantIds = [];
results.forEach((studyInfo) => {
  if (options.verbose) {
    console.log(JSON.stringify(studyInfo, null, 2));
  }
  if (statuses.includes(studyInfo.status)) {
    participantIds.push(studyInfo.participant_id);
  }
});
console.log(participantIds);

async function retrieveSubmissions(url) {
  let res = await axios.get(url, {
    headers: {
      Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
    },
  });

  //console.log(`Status Code: ${res.status}`);
  //console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
  //console.log(`Data: ${JSON.stringify(res.data, null, 2)}`);
  //console.log(`${res.data.results.length}`);

  let results = res.data.results;

  while (res.data._links.next.href) {
    res = await axios.get(res.data._links.next.href, {
      headers: {
        Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
      },
    });
    results = [...results, ...res.data.results];
  }

  return results;
}
