import { MTurkClient } from '@aws-sdk/client-mturk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import {
  getLatestDeploySite,
  getStudyConfig,
  mturkPostStudy,
  prolificListMyStudies,
  prolificPostStudy,
  mturkConfig,
} from './cli-utils.js';
import firebaseConfig from '../config/firebase-config.js';
import ora from 'ora';

const program = new Command()
  .name('ouvrai post')
  .argument('<studyname>', 'Name of study')
  .option('-p --prolific', 'Use Prolific')
  .option('-m --mturk', 'Use MTurk')
  .showHelpAfterError()
  .parse();

const options = program.opts();
const studyName = program.args[0];

if (studyName === 'compensation' && !options.mturk) {
  ora('Compensation studies are for MTurk only').fail();
  process.exit(1);
}

if (options.prolific) {
  // Get unpublished studies
  let spinner = ora('Retrieving draft studies from Prolific').start();
  let studies;
  try {
    studies = await prolificListMyStudies(['UNPUBLISHED']);
    // Exit if no unpublished studies.
    if (studies.length === 0) {
      spinner.fail();
      spinner.fail(
        `No draft studies found. Create one with:\
        \n  ouvrai draft <studyname> -p`
      );
      process.exit(1);
    }
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }

  // Initialize undefined
  let studyId;

  // Check if any unpublished studies' internal name match studyName
  let studyNames = studies.map((x) => x.internal_name);
  if (studyNames.includes(studyName)) {
    // If a match is found, prompt to post the matching study
    let studyIndex = studyNames.indexOf(studyName);
    let answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'confirmDefaultStudy',
        message: `Do you want to post the draft study '${studyName}' created on ${studies[studyIndex].date_created}?`,
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
        message: `${studyName} is not the internal name of any draft study. Would you like to select from the list of all unpublished studies?`,
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
    } catch (err) {
      throw err;
    }
  }

  // Publish study
  try {
    await prolificPostStudy(studyId);
  } catch (err) {
    throw err;
  }
} else if (options.mturk) {
  // Set up MTurk connection
  const client = new MTurkClient({
    region: 'us-east-1',
    endpoint: mturkConfig.endpoint,
  });

  // Get study configuration file
  let config = await getStudyConfig(studyName);

  // Get latest deploy site
  let deploySite = await getLatestDeploySite(studyName);
  if (!deploySite) {
    process.exit(1);
  }

  await mturkPostStudy(
    client,
    studyName,
    deploySite,
    config,
    firebaseConfig,
    mturkConfig,
    {
      compensation: studyName === 'compensation',
      sandbox: false,
    }
  );
}
