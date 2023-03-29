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

const program = new Command()
  .name('ouvrai draft')
  .argument('<experiment>', 'name of experiment directory')
  .option('-p --prolific', 'use Prolific')
  .option('-m --mturk', 'use MTurk')
  .showHelpAfterError()
  .parse();
const options = program.opts();

if (
  (options.prolific && options.mturk) ||
  (!options.prolific && !options.mturk)
) {
  console.log(
    'Error: You must specify where to create the draft study, either --prolific (-p) or --mturk (-m).'
  );
  process.exit(1);
}

// Get study configuration file
const expName = program.args[0];
if (expName === 'compensation' && !options.mturk) {
  console.log('Error: Compensation studies are for MTurk only.');
  process.exit(1);
}
let config = await getStudyConfig(expName);
//console.log(config);

// Get study history (for latest deploy)
let studyURL = await getLatestDeploySite(expName);

if (options.prolific) {
  // PROLIFIC
  // Create study
  let existingStudy;
  try {
    let existingDraftStudies = await prolificGetStudies(expName, [
      'UNPUBLISHED',
    ]);
    if (existingDraftStudies) {
      let expNames = existingDraftStudies.map((o) => ({
        name: `${o.internal_name} created ${o.date_created.slice(0, 10)} (${
          o.id
        })`,
        value: o,
      }));
      // Add option to create new draft study with same internal_name
      expNames.push({ name: '* Create new draft study', value: false });
      let answers = await inquirer.prompt([
        {
          name: 'updateOrCreate',
          message: `Found existing drafts with internal name ${expName}. Choose one to update or create a new draft study.`,
          type: 'list',
          choices: expNames,
        },
      ]);
      existingStudy = answers.updateOrCreate;
    }
  } catch (err) {
    process.exit(1);
  }

  try {
    let studyObject = await prolificCreateStudyObject(
      expName,
      studyURL,
      config,
      existingStudy
    );
    if (existingStudy) {
      await prolificUpdateStudy(studyObject, existingStudy.id);
    } else {
      await prolificCreateDraftStudy(studyObject);
    }
  } catch (e) {
    console.log(e.message);
  }
} else if (options.mturk) {
  // MTURK
  // Set up MTurk connection
  const client = new MTurkClient({
    region: 'us-east-1',
    endpoint: mturkConfig.sandboxEndpoint,
  });

  await mturkPostStudy(
    client,
    expName,
    studyURL,
    config,
    firebaseConfig,
    mturkConfig,
    {
      compensation: false,
      sandbox: true,
    }
  );
}
