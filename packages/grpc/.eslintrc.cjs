require("@cadl-lang/eslint-config-cadl/patch/modern-module-resolution");

module.exports = {
  plugins: ["@cadl-lang/eslint-plugin"],
  extends: ["@cadl-lang/eslint-config-cadl", "plugin:@cadl-lang/eslint-plugin/recommended"],
  parserOptions: { tsconfigRootDir: __dirname },
};
