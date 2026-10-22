import tseslint from "typescript-eslint";

const hostImports = {
  group: ["@getpaseo/*", "@getpaseo/**", "@get-bb/*", "@get-bb/**"],
  message:
    "The core is host-neutral: no host SDK imports. Reach a host through a host.ts port.",
};
const harnessImports = {
  group: ["**/harnesses", "**/harnesses/*"],
  message:
    "Only symphonies/metrics-recorder.ts and adapter entrypoints may import harness log readers. Domain code sees tokens through metrics.",
};

export default tseslint.config(
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      curly: ["error", "all"],
      "no-nested-ternary": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-imports": ["error", { patterns: [hostImports] }],
    },
  },
  // A later no-restricted-imports entry replaces an earlier one for the same files.
  {
    files: ["**/*.ts"],
    ignores: ["symphonies/metrics-recorder.ts", "harnesses/**", "tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [hostImports, harnessImports] },
      ],
    },
  },
  // Fake asynchronous adapters preserve the production interface without artificial waits.
  {
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/require-await": "off" },
  },
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
);
