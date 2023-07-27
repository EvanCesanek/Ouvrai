import { Command } from 'commander';
import { spawn } from 'child_process'; // Node.js built-in to access OS-level functions
import { copy } from 'fs-extra/esm';
import ora from 'ora';
import { exists } from './cli-utils.js';
import { readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import firebaseConfig from '../config/firebase-config.js';
import inquirer from 'inquirer';

const program = new Command()
  .name('ouvrai new')
  .argument('<studyname>', 'Name of study')
  .argument('<templatename>', 'Name of template')
  .option('-o, --overwrite', 'Overwrite existing study')
  .showHelpAfterError()
  .parse();

const options = program.opts();
const studyName = program.processedArgs[0];
const templateName = program.processedArgs[1];

const studyURL = new URL(`../experiments/${studyName}`, import.meta.url);
const studyPath = fileURLToPath(studyURL);
const templateURL = new URL(`../templates/${templateName}`, import.meta.url);
const templatePath = fileURLToPath(templateURL);
const configURL = new URL('../config/template', import.meta.url);
const configPath = fileURLToPath(configURL);

if (firebaseConfig.projectId === 'cognitivescience') {
  ora(`You must run ouvrai setup before creating a new study`).fail();
  //process.exit();
  let answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'skipSetup',
      default: false,
      message: 'Continue anyway? (Ouvrai devs may want to press Y)',
    },
  ]);
  if (!answers.skipSetup) {
    process.exit();
  }
}

let spinner = ora(`Accessing template at ${templatePath}`).start();
if (!(await exists(templateURL))) {
  let templateNames = await readdir(new URL(`../templates`, import.meta.url));
  // Filter out .DS_Store and other hidden files
  templateNames = templateNames.filter((item) => !/(^|\/)\.[^/.]/g.test(item));
  spinner.fail(
    `Invalid template name. Valid names are: ${templateNames.join(', ')}`
  );
  process.exit(1);
}
spinner.succeed();

spinner = ora(`Checking for existing study at ${studyPath}`).start();
if (await exists(studyURL)) {
  if (!options.overwrite) {
    spinner.fail(
      `${studyPath} already exists! Use the --overwrite (-o) flag if this is really what you want.`
    );
    process.exit(1);
  } else {
    spinner.warn('Overwriting existing study');
  }
} else {
  spinner.succeed();
}

try {
  spinner = ora(`Copying template files from ${templatePath}`).start();
  try {
    await copy(templatePath, studyPath, {
      overwrite: options.overwrite,
      errorOnExist: true,
    });
    spinner.succeed();
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }

  spinner = ora(`Copying config files from ${configPath}`).start();
  try {
    await copy(configPath, studyPath, {
      overwrite: options.overwrite,
      errorOnExist: true,
    });
    spinner.succeed();
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

spinner = ora('Installing npm dependencies').info();
let subprocess = spawn('npm', ['i'], {
  stdio: 'inherit',
  cwd: studyURL,
  shell: true,
});
subprocess.on('error', (err) => {
  spinner.fail();
  throw err;
});
subprocess.on('close', (code) => {
  spinner.succeed(`[${code}] New study created at ${studyPath}`);
});
