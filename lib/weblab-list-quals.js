#!/usr/bin/env node

import { Command } from 'commander';
import {
  MTurkClient,
  ListQualificationTypesCommand,
} from '@aws-sdk/client-mturk';

const program = new Command();
program
  .name('weblab list-quals')
  .option('-s --sandbox', 'use MTurk sandbox', false)
  .option('-v --verbose', 'display more info for each qual', false)
  .option('-q --qid-only', 'display only a list of QIDs', false)
  .argument('[query...]', 'search query');
program.parse(process.argv);
const options = program.opts();

var endpoint;
if (options.sandbox) {
  console.log('\n[Note: You are using the Requester Sandbox]');
  endpoint = 'https://mturk-requester-sandbox.us-east-1.amazonaws.com';
} else {
  endpoint = 'https://mturk-requester.us-east-1.amazonaws.com';
}
const client = new MTurkClient({ region: 'us-east-1', endpoint: endpoint });

var listQualificationTypesCommandInput = {
  MustBeRequestable: false, // required
  MustBeOwnedByCaller: true, // we only want to see our own qualifications
  Query: program.args.length > 0 ? program.args.join(' ') : null,
  //MaxResults: 100, // show up to 100 qualifications
  //NextToken: 'STRING_VALUE',
};

const listQualificationTypesCommand = new ListQualificationTypesCommand(
  listQualificationTypesCommandInput
);
var listQualificationTypesCommandOutput;
try {
  listQualificationTypesCommandOutput = await client.send(
    listQualificationTypesCommand
  );
} catch (error) {
  console.log(error.message);
  process.exit(1);
}

console.log(`\n- Found ${listQualificationTypesCommandOutput.NumResults} qualifications \
matching search query "${listQualificationTypesCommandInput.Query}": `);
var qidList = [];
for (let qual of listQualificationTypesCommandOutput.QualificationTypes) {
  var fieldsToPrint;
  if (options.qidOnly) {
    qidList.push(qual.QualificationTypeId);
    continue;
  } else if (options.verbose) {
    fieldsToPrint = {
      QualificationTypeId: qual.QualificationTypeId,
      Name: qual.Name,
      Keywords: qual.Keywords,
      Description: qual.Description,
      CreationTime: qual.CreationTime,
    };
  } else {
    fieldsToPrint = {
      QualificationTypeId: qual.QualificationTypeId,
      Name: qual.Name,
      Keywords: qual.Keywords,
    };
  }
  console.log(fieldsToPrint);
}
if (options.qidOnly) {
  console.log(qidList.join(' '));
}
