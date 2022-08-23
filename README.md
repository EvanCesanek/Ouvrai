![weblab logo](/docs/favicon.png)
# weblab
> Develop and run human behavioral experiments on the web.  
Database and hosting : [Firebase](https://firebase.google.com)  
Crowdsourcing : [MTurk](https://www.mturk.com), [Prolific](https://www.prolific.co)  
2D and 3D interactivity : [three.js](https://threejs.org)

## Prerequisites

### git
Pre-installed on most systems. Check with `git --version`. If you don't have it, download from https://git-scm.com.

### Node.js
If you use bash on a Mac, add `source ~/.bashrc` to *`~/.bash_profile`* (or *`~/.profile`* if you use that). You can do this from terminal by running `echo -e '\nsource ~/.bashrc' >> ~/.bash_profile`

Linux/Mac: [nvm](https://github.com/nvm-sh/nvm)
  ```shell
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
  # Restart shell (or run the code provided by the install script)
  ```
  ```shell
  nvm install node
  nvm alias default node
  ```
  
Windows: [nvm-windows](https://github.com/coreybutler/nvm-windows) provides an installer, then `install` and `use` as above.

### Firebase
  - Create a new project [here](https://console.firebase.google.com/). Choose a unique name so Firebase doesn't add random characters to the ID. You probably don't need Google Analytics.  
  - From the Console, set up the following:
    1. **Realtime Database**  
      Build → Realtime Database → Create Database → choose nearest location → locked mode
    2. **Anonymous Authentication**  
      Build → Authentication → Get started → Anonymous (under Native providers) → Enable → Save
    3. **Hosting**  
      Build → Hosting → Get started → click through remaining  
      Scroll to the bottom of the Hosting page → Add another site → choose a site name → (repeat up to 35x)  
      Recommended naming convention: <a href="_">projname-lab01.web.app</a>
    4. **Credentials**  
      Gear icon → Project settings → Service accounts → Create service account → Generate new private key  
      Rename and move the downloaded file to:
        - Linux/Mac: *`~/.firebase/credentials.json`*  
          Windows: *`C:\Users\%USERNAME%\.firebase\credentials.json`*
    5. **Configuration**  
      Project Overview → Web (</>) → Choose nickname → click through remaining  
      Gear icon → Project settings → scroll to bottom → select Config
        - Leave this tab open. You will need the Firebase configuration object displayed here in a later step.

### Firebase CLI
Open a terminal and run:
```shell
npm install -g firebase-tools
firebase login
firebase projects:list
```
Make sure your project is listed.  
More information: https://firebase.google.com/docs/cli

### AWS & Mechanical Turk (optional)
- Create a new AWS account and a new MTurk account together [here](https://portal.aws.amazon.com/billing/signup?client=mturk).  
- Obtain your access credentials (access key ID and secret access key).
  - Detailed instructions are [here](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-your-credentials.html).  
- Insert your credentials into a plain text file named *`credentials`* (no extension).  The contents should look like this:
  ```shell
  [default]
  aws_access_key_id = AKIAIOSFODNN7EXAMPLE
  aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
  ```
- Move this file to:
  - Linux/Mac: *`~/.aws/credentials`*
  - Windows: *`C:\Users\%USERNAME%\.aws\credentials`*

## 1. Installation
Now you're ready to start building and running experiments with **weblab**!
```shell
git clone https://www.github.com/EvanCesanek/weblab
cd weblab
npm i -g
npm i
weblab install-completion # follow the instructions
```
  - If you use zsh, add the following line to ~/.zshrc: `autoload -Uz compinit && compinit`  
  - If you use bash on a Mac, you may need to add `source ~/.bashrc` to ~/.bash_profile or ~/.profile.

Add your Firebase configuration information.
  1. Return to the Firebase Console tab that you left open and copy the displayed code for the configuration object:  
    `const firebaseConfig = {...}`
  2. Open *`weblab/firebase-config.js`* in your editor, replace the configuration object with your own, and save the file.  
    **Make sure you keep the `export` keyword!** You should have `export const firebaseConfig = { ... }`.

<details>
  <summary>
    <b>Test your installation</b> (click to expand)
  </summary>
  Create, submit, approve, and delete a Compensation HIT in the <a target="_blank" rel="noopener noreferrer" href="https://requester.mturk.com/developer/sandbox">MTurk Sandbox</a>. Compensation HITs are normally used to pay workers who tried but could not submit a HIT you posted for some reason (e.g., bug or timeout).
  <ol>
    <li> Sign in to <a target="_blank" rel="noopener noreferrer" href="https://workersandbox.mturk.com">workersandbox.mturk.com</a>. Copy your worker ID by clicking on it in the top-left.  </li> 
    <li> Open <i><code>weblab/experiments/compensation/mturk-config.mjs</code></i> in your preferred editor. In the <code>parameters</code> object, find the <code>workersToCompensate</code> field, which should contain an array of worker IDs. Paste in your worker ID to replace the existing ID and save this file.  </li> 
    <li> Run <code>weblab create-hit compensation -s</code>. The <code>-s</code> option is an abbreviation for <code>--sandbox</code>. Note that in this case it is actually redundant because <code>sandbox: true</code> in <i><code>mturk-config.mjs</code></i>. Remember that if you want to use the real MTurk Requester site, you must set <code>sandbox: false</code> in <i><code>mturk-config.mjs</code></i> and leave off the <code>-s</code> flag.</li> 
    <li> The console output of <code>weblab create-hit ...</code> includes a link that will take you to your created HIT. Follow it, accept the HIT, and click the Submit button.</li> 
    <li> Run <code>weblab list-hits compensation -s</code>. Again, the <code>-s</code> flag is needed whenever we want to deal with the Requester Sandbox site, unless it is hard-coded in <i><code>mturk-config.mjs</code></i>. The console output should display some information about your HIT. Copy the HIT ID, which is a string like <code>3YKP7CX6H6WHJ3HR4YTS5WC2HYXB72</code>.</li> 
    <li> Run <code>weblab review-hit &lt;HITID&gt; -s</code>, pasting in the HIT ID you copied to replace <code>&lt;HITID&gt;</code>. You will be prompted to approve or reject the submission. You can choose whichever you like! In general, it is best to approve all MTurk submissions unless you have a really good reason not to.</li> 
    <li> Since you are done with this HIT, you can now run <code>weblab delete-hit &lt;HITID&gt; -s</code> (again pasting in the copied HIT ID to replace &lt;HITID&gt;). This deletes the HIT. It is good practice to delete your HITs after you have reviewed all submissions and sent any bonuses to the participants.</li> 
  </ol>
</details>

## 2. Experiments
In **weblab**, each experiment is a stand-alone JavaScript web app located in its own subdirectory under *`weblab/experiments/`*. Two example experiments are provided as templates for development. Note that weblab was developed for research on human sensorimotor control, so the example experiments are designed to support interactivity with the mouse/trackpad or virtual reality interfaces.

#### Familiarize yourself with the `src` folder of an example experiment.
This is primarily where you would work on an experiment. It contains the code and any other assets for an experiment.
  - `src/index.js` is the main experiment code that you would edit for a new experiment.
  - **Important**: Replace *`src/consent.pdf`* with your own consent form
  - **Important**: Replace *`src/firebase-config.pdf`* with your own Firebase configuration object (from earlier)
  - *`src/components/`* contains the **weblab** experiment components library. They are used in *`src/index.js`* to manage all of the various processes that are important for a well-functioning experiment. You should not have to worry about these very much.

#### Install an example experiment
Each experiment is a npm package, with its own package.json, separate from the main **weblab** package.
  ```shell
  cd weblab/experiments/example
  firebase init database # Enter N when prompted to overwrite database.rules.json
  npm i
  npm run start # Initialize snowpack, build dependencies, and fire up dev server
  ```
  
**Warning**: Snowpack will throw an error when it gets to three.js! This is due to a bug in parsing certain glob expressions in the exports section of package.json files. To get around this, you must manually edit this section of the three.js package.json. Add the following lines to the exports section of example/node_modules/three/package.json: 
```
"exports": {
...
    "./examples/jsm/controls/*": "./examples/jsm/controls/*",
    "./examples/jsm/environments/*": "./examples/jsm/environments/*",
    "./examples/jsm/libs/*": "./examples/jsm/libs/*",
    "./examples/jsm/loaders/*": "./examples/jsm/loaders/*",
    "./examples/jsm/renderers/*": "./examples/jsm/renderers/*",
    "./examples/jsm/webxr/*": "./examples/jsm/webxr/*",
...
```

Now run `npm run start` again. This time, a new tab should open in Chrome (if your default browser is already open, the tab may open there instead). In the snowpack development server (`localhost:8080`), any changes to the code in *`src`* are rapidly reflected on the locally hosted page.

#### Start the Firebase Emulator Suite
You will notice that the experiment is blocked with a message saying you are not connected to the database. During development, you should use the Firebase Emulator suite by opening a new terminal instance and running `firebase emulators:start`. Go back to the snowpack dev server and you should be connected and good to go! Go ahead and complete the example experiment to see the general flow of the experiment. When you're done, open `localhost:9000` and you can inspect all the data that was written to the (emulated) Realtime Database.

#### Build and deploy the example experiment
  1. If you set up multiple Hosting sites in your Firebase project, you must specify which one to deploy to, otherwise you will deploy to your primary, default Hosting site.
    - Open *`firebase.json`* and edit the line `"site": "projname-lab01"` to specify one of your own site names.
  2. Run:
  ```shell
  npm run build # creates production version of your src code in public folder
  weblab deploy example # deploys everything in the public folder to your Firebase Hosting site
  ```

### Final notes
When you are developing experiments, remember that you can install and use *most* npm packages in your experiment code by running `npm install *xxx*` as needed (from the experiment folder). However, beware that some Node modules do not function as proper ES modules and thus will not work in the browser. Snowpack has some polyfill options to remedy this as much as possible, which you can read about [here](https://www.snowpack.dev/reference/configuration#packageoptionspolyfillnode).
