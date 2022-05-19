require("@cadl-lang/eslint-config-cadl/patch/modern-module-resolution");

module.exports = {
  extends: "@cadl-lang/eslint-config-cadl",
  parserOptions: { tsconfigRootDir: __dirname },
};
