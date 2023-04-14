import { Command } from 'commander';
import { copy } from 'fs-extra/esm';
import ora from 'ora';
import { exists } from './cli-utils.js';
import { fileURLToPath } from 'url';

const program = new Command()
  .name('ouvrai templatize')
  .argument('<studyname>', 'Name of study')
  .argument('<templatename>', 'Name of template')
  .option('-o, --overwrite', 'Overwrite existing template')
  .showHelpAfterError()
  .parse();

const options = program.opts();
const expName = program.processedArgs[0];
const templateName = program.processedArgs[1];

const studyURL = new URL(`../experiments/${expName}`, import.meta.url);
const studyPath = fileURLToPath(studyURL);
const templateURL = new URL(`../templates/${templateName}`, import.meta.url);
const templatePath = fileURLToPath(templateURL);

let spinner = ora(`Checking for template at ${templatePath}`).start();
if (await exists(templateURL)) {
  if (!options.overwrite) {
    spinner.fail(
      `${templatePath} already exists! Use the --overwrite (-o) flag if this is really what you want.`
    );
    process.exit(1);
  } else {
    spinner.warn('Overwriting existing template!');
  }
} else {
  spinner.succeed();
}

try {
  spinner = ora(`Copying source files from ${studyPath}`).start();
  try {
    await copy(`${studyPath}/src`, `${templatePath}/src`, {
      overwrite: options.overwrite,
      errorOnExist: true,
    });
    spinner.succeed();
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }

  spinner = ora(`Copying study-config.js from ${studyPath}`).start();
  try {
    await copy(
      `${studyPath}/study-config.js`,
      `${templatePath}/study-config.js`,
      {
        overwrite: options.overwrite,
        errorOnExist: true,
      }
    );
    spinner.succeed();
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }

  spinner = ora(`Copying package.json from ${studyPath}`).start();
  try {
    await copy(`${studyPath}/package.json`, `${templatePath}/package.json`, {
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
