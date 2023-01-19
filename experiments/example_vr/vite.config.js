/** @type {import('vite').UserConfig} */
export default {
  root: 'src',
  //base: '/<REPO>/', // for deploying to GitHub Pages
  publicDir: 'static',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
};
