import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**"] },
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
    },
  },
  // The core is host-neutral: no host SDK, and harness log readers stay
  // behind metrics collection.
  {
    files: ["src/**"],
    ignores: ["src/symphonies/metrics-recorder.ts", "src/harnesses/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@getpaseo/*", "**/engine/paseo/*"],
              message:
                "The Conductor core is host-neutral. Host adapters implement the host.ts ports.",
            },
            {
              group: ["**/harnesses", "**/harnesses/*"],
              message:
                "Only src/symphonies/metrics-recorder.ts may import harness log readers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/require-await": "off" },
  },
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
);
