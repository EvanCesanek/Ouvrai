#!/usr/bin/env node

import { Command } from 'commander';
import { MTurkClient, GetAccountBalanceCommand } from '@aws-sdk/client-mturk';

const program = new Command();
program.option('-s --sandbox', 'use MTurk sandbox', false);
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
const command = new GetAccountBalanceCommand();

var data;
try {
  data = await client.send(command);
} catch (error) {
  console.log(error.message);
}

console.log('\n--- Available Balance: $' + data.AvailableBalance + '\n');
