/** @type {import('vite').UserConfig} */
export default {
  root: 'src',
  //base: '/REPO_NAME/', // for deploying to GitHub Pages
  publicDir: 'static',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
};
