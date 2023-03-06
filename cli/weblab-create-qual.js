import {
  CreateQualificationTypeCommand,
  MTurkClient,
} from '@aws-sdk/client-mturk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import mturkConfig from '../config/mturk-config.js';

const program = new Command()
  .name('weblab create-qual')
  .option('-s --sandbox', 'use mturk sandbox')
  .argument('<name>', 'name of qualification')
  .argument('[keywords...]', 'search keywords for qualification')
  .showHelpAfterError()
  .parse();
const options = program.opts();

// Set up MTurk connection
const client = new MTurkClient({
  region: 'us-east-1',
  endpoint: options.sandbox
    ? mturkConfig.sandboxEndpoint
    : mturkConfig.endpoint,
});

let qualParams = {
  Name: program.args[0],
  QualificationTypeStatus: 'Active',
};

try {
  let answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'description',
      message: 'Enter a short description of the qualification:',
      default: 'No description',
      validate: (input) =>
        input.length < 2000
          ? true
          : 'Description must be less than 2000 characters.',
    },
  ]);
  qualParams.Description = answer.description;
} catch (err) {
  console.log(err.message);
  process.exit(1);
}

if (program.args[1] === undefined) {
  try {
    let answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'keywords',
        message:
          'Enter comma-separated keywords or phrases to help search for this qualification (optional):',
        validate: (input) =>
          input.length < 1000
            ? true
            : 'Keyword string must be less than 1000 characters',
      },
    ]);
    qualParams.Keywords = answer.keywords;
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }
} else {
  qualParams.Keywords = program.args
    .slice(1)
    .map((str) => str.replace(',', ''))
    .join(',');
}

const createQualificationTypeCommand = new CreateQualificationTypeCommand(
  qualParams
);
let spinner = ora('Creating qualification type...').start();
try {
  let createQualificationTypeCommandOutput = await client.send(
    createQualificationTypeCommand
  );
  spinner.succeed();
  console.log(createQualificationTypeCommandOutput.QualificationType); // successful response
} catch (error) {
  spinner.fail(error.message);
  process.exit(1);
}
