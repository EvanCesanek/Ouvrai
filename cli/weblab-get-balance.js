#!/usr/bin/env node

import { Command } from 'commander';
import { MTurkClient, GetAccountBalanceCommand } from '@aws-sdk/client-mturk';
import axios from 'axios';
import { oraPromise } from 'ora';
import mturkConfig from '../config/mturk-config.js';

const program = new Command();
program
  .name('weblab get-balance')
  .option('-s --sandbox', 'use MTurk sandbox')
  .showHelpAfterError();

program.parse();
const options = program.opts();

// Test MTurk SDK
const client = new MTurkClient({
  region: 'us-east-1',
  endpoint: options.sandbox
    ? mturkConfig.sandboxEndpoint
    : mturkConfig.endpoint,
});
try {
  await oraPromise(client.send(new GetAccountBalanceCommand()), {
    text: 'Requesting your account balance from MTurk...',
    failText: (e) => `MTurk integration is not working! ${e.message}.`,
    successText: (data) =>
      `MTurk integration is working as expected. Your account balance is $${
        data.AvailableBalance
      }${options.sandbox ? ' (sandbox mode)' : ''}.`,
  });
} catch {
  //
}

// Test Prolific REST API
try {
  await oraPromise(
    axios.get('https://api.prolific.co/api/v1/users/me', {
      headers: {
        Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
      },
    }),
    {
      text: 'Requesting your account info from Prolific...',
      failText: (e) => `Prolific integration is not working! ${e.message}.`,
      successText: (res) =>
        `Prolific integration is working as expected. Your account email is ${res.data.email}. Your balance can only be checked on the Prolific web app.`,
    }
  );
} catch {
  //
}
