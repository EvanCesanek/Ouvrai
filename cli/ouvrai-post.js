import { MTurkClient } from '@aws-sdk/client-mturk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import {
  getLatestDeploySite,
  getStudyConfig,
  mturkPostStudy,
  prolificListStudies,
  prolificPostStudy,
  mturkConfig,
} from './cli-utils.js';
import firebaseConfig from '../config/firebase-config.js';
import ora from 'ora';

const program = new Command();
program
  .option('-p --prolific', 'use Prolific')
  .option('-m --mturk', 'use MTurk')
  .argument('<experiment-name>', 'name of experiment directory')
  .showHelpAfterError();

program.parse(process.argv);
const options = program.opts();
const expName = program.args[0];
if (expName === 'compensation' && !options.mturk) {
  console.log('Error: Compensation studies are for MTurk only.');
  process.exit(1);
}

if (options.prolific) {
  // Get unpublished studies
  let spinner = ora('Retrieving list of unpublished studies...').start();
  try {
    let studies = await prolificListStudies({
      filterStates: ['UNPUBLISHED'],
      byProject: false,
    });
  } catch (err) {
    spinner.fail(err.message);
    process.exit();
  }
  // Exit if no unpublished studies.
  if (studies.length === 0) {
    spinner.fail('No unpublished studies found.');
    process.exit(1);
  }

  // Initialize undefined
  let studyId;

  // Check if any unpublished studies' internal name match expName
  let studyNames = studies.map((x) => x.internal_name);
  if (studyNames.includes(expName)) {
    // If a match is found, prompt to post the matching study
    let studyIndex = studyNames.indexOf(expName);
    let answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'confirmDefaultStudy',
        message: `Do you want to post the draft study '${expName}' created on ${studies[studyIndex].date_created}?`,
        choices: ['Yes', 'Choose from other unpublished studies', 'Exit'],
      },
    ]);
    if (answers.confirmDefaultStudy === 'Yes') {
      studyId = studies[studyIndex].id;
    } else if (answers.confirmDefaultStudy === 'Exit') {
      process.exit(0);
    }
  } else {
    // If no match is found, prompt to select other study.
    let answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'selectOtherStudy',
        message: `${expName} is not the internal name of any draft study. Would you like to select from the list of all unpublished studies?`,
        default: false,
      },
    ]);
    if (!answers.selectOtherStudy) {
      process.exit(0);
    }
  }

  // If still undefined (i.e., match not found or not chosen), display list of all studies.
  if (studyId === undefined) {
    let studiesInfo = studies.map((x) => ({
      name: `${x.date_created.slice(0, 10)}: ${x.internal_name || x.name}`,
      value: x.id,
    }));
    studiesInfo.push({ name: '-- Exit', value: 'exit' });
    try {
      let answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'studyId',
          message: 'Would you like to publish one of these draft studies?',
          choices: studiesInfo,
        },
      ]);
      studyId = answers.studyId;
      if (studyId === 'exit') {
        process.exit(0);
      }
    } catch (e) {
      console.log(e.message);
      process.exit(1);
    }
  }

  // Publish study
  spinner = ora('Posting study on Prolific...');
  try {
    await prolificPostStudy(studyId);
    spinner.succeed();
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
} else if (options.mturk) {
  // MTURK
  // Set up MTurk connection
  const client = new MTurkClient({
    region: 'us-east-1',
    endpoint: mturkConfig.endpoint,
  });

  // Get study configuration file
  let config = await getStudyConfig(expName);
  let studyURL = await getLatestDeploySite(expName);

  await mturkPostStudy(
    client,
    expName,
    studyURL,
    config,
    firebaseConfig,
    mturkConfig,
    {
      compensation: expName === 'compensation',
      sandbox: false,
    }
  );
}
