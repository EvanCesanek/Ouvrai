import { Command } from 'commander';
import {
  getLatestDeploySite,
  getStudyConfig,
  mturkPostStudy,
  prolificCreateDraftStudy,
  prolificCreateStudyObject,
  prolificGetStudies,
  prolificUpdateStudy,
  mturkConfig,
} from './cli-utils.js';
import firebaseConfig from '../config/firebase-config.js';
import { MTurkClient } from '@aws-sdk/client-mturk';
import inquirer from 'inquirer';
import ora from 'ora';

const program = new Command()
  .name('ouvrai draft')
  .argument('<studyname>', 'Name of study')
  .option('-p --prolific', 'Use Prolific')
  .option('-m --mturk', 'Use Amazon Mechanical Turk')
  .showHelpAfterError()
  .parse();

const options = program.opts();

if (
  (options.prolific && options.mturk) ||
  (!options.prolific && !options.mturk)
) {
  ora('You must specify --prolific (-p) or --mturk (-m).').fail();
  process.exit(1);
}

// Get study configuration file
const studyName = program.args[0];
if (studyName === 'compensation' && !options.mturk) {
  ora(
    'Compensation studies are intended for Amazon Mechanical Turk only.'
  ).fail();
  process.exit(1);
}
let config = await getStudyConfig(studyName);

// Get latest deploy site
let deploySite = await getLatestDeploySite(studyName);
if (!deploySite) {
  process.exit(1);
}

if (options.prolific) {
  // Create study
  let existingStudy;
  try {
    let existingDraftStudies = await prolificGetStudies(studyName, [
      'UNPUBLISHED',
    ]);
    if (existingDraftStudies) {
      let studyNames = existingDraftStudies.map((o) => ({
        name: `${o.internal_name} created ${o.date_created.slice(0, 10)} (${
          o.id
        })`,
        value: o,
      }));
      // Add option to create new draft study with same internal_name
      studyNames.push({ name: '* Create new draft study', value: false });
      let answers = await inquirer.prompt([
        {
          name: 'updateOrCreate',
          message: `Found existing drafts with internal name ${studyName}. Choose one to update, or create a new draft study.`,
          type: 'list',
          choices: studyNames,
        },
      ]);
      existingStudy = answers.updateOrCreate;
    }
  } catch (err) {
    throw err;
  }

  try {
    let studyObject = await prolificCreateStudyObject(
      studyName,
      deploySite,
      config,
      existingStudy
    );
    let resdata;
    if (existingStudy) {
      resdata = await prolificUpdateStudy(studyObject, existingStudy.id);
    } else {
      resdata = await prolificCreateDraftStudy(studyObject);
    }
    ora(
      `Preview your draft study at: https://app.prolific.co/researcher/workspaces/studies/${resdata.id}`
    ).succeed();
  } catch (err) {
    throw err;
  }
} else if (options.mturk) {
  // Set up MTurk connection
  const client = new MTurkClient({
    region: 'us-east-1',
    endpoint: mturkConfig.sandboxEndpoint,
  });

  await mturkPostStudy(
    client,
    studyName,
    deploySite,
    config,
    firebaseConfig,
    mturkConfig,
    {
      compensation: false,
      sandbox: true,
    }
  );
}
