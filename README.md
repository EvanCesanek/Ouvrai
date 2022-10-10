# weblab

> Develop and run behavioral experiments on the web.  
> Database and hosting with [Firebase](https://firebase.google.com)  
> Crowdsourcing with [MTurk](https://www.mturk.com) and [Prolific](https://www.prolific.co)

# Getting started

## Prerequisites

If you use bash on a Mac, open _`~/.bash_profile`_ and add the line `source ~/.bashrc` if it is not already there. More info [here](https://scriptingosx.com/2017/04/about-bash_profile-and-bashrc-on-macos/).

### git

- Check that you have git installed by running `git --version`. If not, get it from https://git-scm.com.

### Node.js

- **Linux/Mac**
  - Install [nvm](https://github.com/nvm-sh/nvm):
    ```
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    ```
  - Restart shell, then install latest stable Node.js and make it your default:
    ```
    nvm install node # v18.7.0 at time of writing
    nvm alias default node
    ```
  - If you had an existing installation of Node.js, you can switch back to it at any time with `nvm use system`.
- **Windows**
  - Install [nvm-windows](https://github.com/coreybutler/nvm-windows) using provided installer. Similar functionality to above.

### Firebase

- Create a new project [here](https://console.firebase.google.com/)
  - Try to choose a unique name so Firebase doesn't add random characters to the ID.
  - You probably don't need Google Analytics.
- From the Console, set up:
  1. **Realtime Database**
     - Build → Realtime Database → Create Database → choose nearest location → locked mode
  2. **Anonymous Authentication**
     - Build → Authentication → Get started → Anonymous (under Native providers) → Enable → Save
  3. **Hosting**
     - Build → Hosting → Get started → click through remaining
     - Scroll to the bottom of the Hosting page → Add another site → choose a site name → (repeat up to 35x)
       - Recommended naming convention: <a href="_">projname-lab01.web.app</a>
  4. **Credentials**
     - Gear icon → Project settings → Service accounts → Create service account → Generate new private key
     - Rename and move the downloaded file to:
       - Linux/Mac: _`~/.firebase/credentials.json`_
       - Windows: _`C:\Users\%USERNAME%\.firebase\credentials.json`_
  5. **Configuration**
     - Project Overview → Web (</>) → Choose nickname → click through remaining (skip the commands)
     - Gear icon → Project settings → scroll to bottom → select Config.
       - Leave this tab open, you will need to copy-paste the displayed code into a file later.

### Firebase CLI

- Run
  ```
  npm install -g firebase-tools
  firebase login
  firebase projects:list
  ```
- Make sure your project is listed. More information [here](https://firebase.google.com/docs/cli).

### AWS & Mechanical Turk (optional)

- Create a new AWS account and a new MTurk account together [here](https://portal.aws.amazon.com/billing/signup?client=mturk).
- Obtain your access credentials (access key ID and secret access key).
  - Detailed instructions are [here](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-your-credentials.html).
- Insert your credentials into a plain text file named _`credentials`_ (no extension). The contents should look like this:
  ```
  [default]
  aws_access_key_id = AKIAIOSFODNN7EXAMPLE
  aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
  ```
- Move this file to:
  - Linux/Mac: _`~/.aws/credentials`_
  - Windows: _`C:\Users\%USERNAME%\.aws\credentials`_

### Prolific (optional)

- Create a new Prolific researcher account [here](https://app.prolific.co/register/researcher).
- Workspaces → Settings → Go to API token page → Create API token
- Copy the generated token (just a long string of characters) into a plain text file at:
  - Linux/Mac: _`~/.prolific/credentials.txt`_
  - Windows: _`C:\Users\%USERNAME%\.prolific\credentials.txt`_
- **Note**: CLI integration with the Prolific API is in development. **weblab** functions that use the Prolific API start with `_p-)` (e.g, `p-get-submissions`). The Prolific API is incomplete and must still be used for some operations.

## 1. Installation

Now you're ready to start building and running experiments with **weblab**!

- Open a terminal one directory level _above_ where you want **weblab** to live.
  ```
  git clone https://www.github.com/EvanCesanek/weblab
  cd weblab
  npm i -g
  npm i
  weblab install-completion
  ```
  - If you use zsh, add `autoload -Uz compinit && compinit` to _`~/.zshrc`_ to get tab-completions working.
- Return to the Firebase Console and copy the `const firebaseConfig = {...}` configuration object mentioned [earlier](#firebase) (grab them from https://console.firebase.google.com/project/PROJECT_NAME/settings/general/, replacing PROJECT_NAME with your own project name).
- Open _`weblab/firebase-config.js`_ in your editor, replace the configuration object with your own, and save. **Make sure you keep the `export` keyword!** You should have `export const firebaseConfig = {...}`.

**Simple test**

```
weblab help # view all subcommands
weblab get-balance -s # check MTurk Sandbox account balance ($10000.00)
```

<details>
  <summary>
    <b>Brief tutorial with a Compensation HIT</b> (click to expand)
  </summary>
  Create, submit, approve, and delete a Compensation HIT in the <a target="_blank" rel="noopener noreferrer" href="https://requester.mturk.com/developer/sandbox">MTurk Sandbox</a>. Compensation HITs are normally used to pay workers who tried but could not submit a HIT you posted for some reason (e.g., bug or timeout).
  <ol>
    <li> Sign in to <a href="https://workersandbox.mturk.com">workersandbox.mturk.com</a>. Copy your worker ID by clicking on it in the top-left.  </li> 
    <li> Open <i><code>weblab/experiments/compensation/mturk-config.mjs</code></i> in your preferred editor. In the <code>parameters</code> object, find the <code>workersToCompensate</code> field, which should contain an array of worker IDs. Paste in your worker ID to replace the existing ID and save this file.  </li> 
    <li> Run <code>weblab create-hit compensation -s</code>. The <code>-s</code> option is an abbreviation for <code>--sandbox</code>. Note that in this case it is actually redundant because <code>sandbox: true</code> in <i><code>mturk-config.mjs</code></i>. Remember that if you want to use the real MTurk Requester site, you must set <code>sandbox: false</code> in <i><code>mturk-config.mjs</code></i> and leave off the <code>-s</code> flag.</li> 
    <li> The console output of <code>weblab create-hit ...</code> includes a link that will take you to your created HIT. Follow it, accept the HIT, and click the Submit button.</li> 
    <li> Run <code>weblab list-hits compensation -s</code>. Again, the <code>-s</code> flag is needed whenever we want to deal with the Requester Sandbox site, unless it is hard-coded in <i><code>mturk-config.mjs</code></i>. The console output should display some information about your HIT. Copy the HIT ID, which is a string like <code>3YKP7CX6H6WHJ3HR4YTS5WC2HYXB72</code>.</li> 
    <li> Run <code>weblab review-hit &lt;HITID&gt; -s</code>, pasting in the HIT ID you copied to replace <code>&lt;HITID&gt;</code>. You will be prompted to approve or reject the submission. You can choose whichever you like! In general, it is best to approve all MTurk submissions unless you have a really good reason not to.</li> 
    <li> Since you are done with this HIT, you can now run <code>weblab delete-hit &lt;HITID&gt; -s</code> (again pasting in the copied HIT ID to replace &lt;HITID&gt;). This deletes the HIT. It is good practice to delete your HITs after you have reviewed all submissions and sent any bonuses to the participants.</li> 
  </ol>
</details>

## 2. Experiments

In **weblab**, an experiment is a stand-alone JavaScript web app using ES modules. Each experiment should therefore be a npm package with its own _`package.json`_ and _`node_modules/`_, separate from the main **weblab** package.located in its own subdirectory under _`weblab/experiments/`_. One example experiment is provided as a template for development (warning, this example is moderately complex; a simpler example is coming soon). Note that weblab was developed for research on human sensorimotor control, so the example experiments are designed to support interactivity with the mouse/trackpad or VR devices.

- The example experiments rely on [three.js](www.threejs.org) for hardware-accelerated graphics and VR support. The three.js [docs](https://threejs.org/docs/), [examples](https://threejs.org/examples/#webgl_animation_keyframes), and [manual](https://threejs.org/manual/#en/fundamentals) are great resources if you want to learn more about how to use three.js to build great experiments.
- I recommend using [Vite](https://vitejs.dev) for developing and building experiments using JavaScript modules. It is included as a dev dependency in the example experiments, and the provided _`vite.config.js`_ configuration file is set up to build a production version of your experiment in _`dist/`_ that will be hosted on Firebase.

#### Familiarize yourself with the directory structure of an example experiment

- The _`src/`_ folder contains all the source code and other assets needed for an experiment.
  - `src/index.js` is the main experiment code that you would edit for a new experiment.
  - _`src/components/`_ contains the **weblab** component library. These components are imported in _`src/index.js`_ to help manage the various processes of a well-functioning experiment. Important components used in _`src/index.js`_ include `Experiment`, `BlockOptions`, `State`, and `Firebase`.
- **Important files to replace**
  - Replace _`src/consent.pdf`_ with your own consent form.
  - Replace _`src/firebase-config.js`_ with your own Firebase configuration details (same as _`weblab/firebase-config.js`_ from [earlier](#installation)).

#### Test the example experiment

- Run
  ```
  cd experiments/example
  firebase init database # Enter N when prompted to overwrite database.rules.json
  npm i
  npm run dev # Start development server
  ```
- Open the localhost development server (indicated in the console output) in Chrome. Note that the example experiments are restricted to run only in Chrome for performance reasons. If you open them in another browser, you will encounter a message telling you to use Chrome.
- Any changes to the source code are rapidly reflected in the local host, while reloading only the necessary resources.

#### Firebase Emulator Suite

You will notice that the experiment is blocked with a message saying you are not connected to the database. If the page were hosted on one of your Firebase sites, this would not happen. But when developing on the local host, you typically do not want to write data to your actual database. Instead, you should use the [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)

- Open a **new** terminal instance (leave the existing one running), navigate to the experiment folder, and run `firebase emulators:start`.
  - If you encounter `Error: Could not start Database Emulator, port taken`, you may need to shut down other processes on port 9000 with `lsof -nti :9000 | xargs kill -9` or modify the Database Emulator port in _`firebase.json`_.
- Return to the experiment page and you should see that you are connected (refresh the page if not). Go ahead and complete the example experiment; it is only a few trials.
- When you're done, open `localhost:4001/database` in your browser and you can inspect the data that was written to the emulated database.
- When you're finished, you can shut down the Vite dev server and the Firebase Emulator Suite with control+c (Mac), or by closing the terminals.

#### Build and deploy the example experiment

- If you created multiple Hosting sites in your Firebase project, specify which one to deploy to:
  - Open _`firebase.json`_ and edit the line `"site": "projname-lab01"` to specify one of your own site names.
  - If you did not create multiple sites, delete this line to deploy to your default primary Hosting site.
- Run:
  ```shell
  npm run build # creates production version of your src code in dist folder
  weblab deploy example # deploys everything in the dist folder to your Firebase Hosting site
  ```
- Typically you will modify the local versions of _`mturk-config.mjs`_ and _`mturk-layout.html`_ for each experiment.

  - _`mturk-config.mjs`_ contains general parameters related to your HIT, like Title, Description, Allotted Time, and Payment, as well as parameters used by certain weblab subcommands.
  - _`mturk-layout.html`_ is a simple web page displayed to MTurk workers when they Preview, Accept, and Submit your experiment. It also contains some important code that aims to prevent bogus submissions. The only lines you should edit are the following:

  ```html
  <body>
    <div id="instructions">
      <p>
        Play a simple web game where you must move the cursor to hit different
        targets.<br />
        Not all systems are supported. If it doesn't work, please exit and
        return the HIT.<br />
        Do not attempt to do this HIT more than once. Only 1 submission will be
        allowed.<br />
        If you encounter a bug, please send us a brief message describing the
        problem.
      </p>

      To complete this HIT, you must use:
      <ul>
        <li>A standard mouse or trackpad (no touch-screens)</li>
        <li>A recently updated web browser</li>
        <li>Full-screen mode with pointer lock</li>
      </ul>

      ...
    </div>
  </body>
  ```

- Finally, run `weblab create-hit example -s` to post this experiment to the Sandbox. For new experiments, it's always a good idea to go through the whole process in the Sandbox at least once (create, perform, submit, download and analyze data, review, bonus, delete).
  - You may also want to test out qualifications and bonus payments using `weblab create-qual` and `weblab send-bonus`. These subcommands require modifications to _`mturk-config.mjs`_.
    - Note that qualifications are disabled by default in the sandbox. This can be overridden by commenting out the following line in _`mturk-config.mjs`_: `parameters.qualificationsDisabled = parameters.sandbox;`

#### Posting your study on Prolific

1. Create a new study on Prolific and go to the study details.
2. In the **How to record Prolific IDs** section, provide the site URL where your finalized experiment is deployed (e.g., https://projname-labXX.web.app). Then select _I'll use URL parameters_ for the next question.
3. In the **How to confirm participants have completed your study** section, select _I'll redirect them using a URL_. Then paste the provided link into the parameters of the `Experiment` constructor in _`index.js`_:

```javascript
const exp = new Experiment({
  ...
  prolificLink: '', // Get completion link from Prolific study details
  ...
});
```

Note: CLI integration with the Prolific API is in development. Try out Prolific-prefixed **weblab** functions (e.g, `p-get-submissions`). Use the `workersToXXX` fields of `mturk-config.mjs` as needed for `download-workers`, `p-approve`, and `p-send-bonus`.
