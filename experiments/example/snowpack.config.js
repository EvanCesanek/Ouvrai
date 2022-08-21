// Snowpack Configuration File
// See all supported options: https://www.snowpack.dev/reference/configuration

/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  root: './src',
  mount: {
    /* ... */
  },
  plugins: [
    /* ... */
  ],
  packageOptions: {
    /* ... */
  },
  devOptions: {
    open: 'chrome',
  },
  buildOptions: {
    out: 'public',
  },
  optimize: {
    bundle: true,
    minify: true,
    treeshake: true,
    target: 'es2018',
  },
};
