import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**"] },
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
  // The core is host-neutral. Host adapters wrap its RPC definitions and
  // register its services.
  {
    files: ["src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@getpaseo/*", "**/engine/paseo/*"],
              message:
                "The Essentials core is host-neutral. Host adapters wrap its definitions.",
            },
          ],
        },
      ],
    },
  },
);
