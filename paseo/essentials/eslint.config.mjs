import { readFileSync } from "node:fs";
import tseslint from "typescript-eslint";

// .core-files lists the host-neutral core that other hosts copy. Core code must
// not reach the Paseo SDK or this adapter's Paseo-only modules.
const coreFiles = readFileSync(new URL(".core-files", import.meta.url), "utf8")
  .split("\n")
  .filter((file) => /\.tsx?$/.test(file));

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      curly: ["error", "all"],
      "no-nested-ternary": "error",
      "padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: "*",
          next: ["return", "if", "for", "try"],
        },
        { blankLine: "always", prev: "block-like", next: "*" },
        { blankLine: "always", prev: "import", next: "*" },
        { blankLine: "any", prev: "import", next: "import" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: coreFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@getpaseo/*",
                "@getpaseo/**",
                "**/engine/paseo/*",
                "**/entrypoints/*",
              ],
              message:
                "Core files (.core-files) are host-neutral: no Paseo SDK or adapter modules.",
            },
          ],
        },
      ],
    },
  },
);
