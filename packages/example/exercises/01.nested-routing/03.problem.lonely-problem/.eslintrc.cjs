/**
 * @type {import('@types/eslint').Linter.Config}
 */
module.exports = {
  extends: ["kentcdodds"],
  parserOptions: {
    project: require.resolve("./tsconfig.json"),
    sourceType: "module",
    ecmaVersion: 2023,
  },
  rules: {
    complexity: "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-shadow": "off",
    "vars-on-top": "off",
    "no-var": "off",
    "no-await-in-loop": "off",
    "@typescript-eslint/no-throw-literal": "off",
    "@typescript-eslint/no-invalid-void-type": "off",
    "@typescript-eslint/prefer-nullish-coalescing": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-ts-expect-error": "off",
    "react/display-name": "off",
  },
  // we're using vitest which has a very similar API to jest
  // (so the linting plugins work nicely), but it means we have to explicitly
  // set the jest version.
  settings: {
    jest: {
      version: 27,
    },
  },
};
