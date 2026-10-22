import tseslint from "typescript-eslint";

const hostImports = {
  group: ["@getpaseo/*", "@getpaseo/**", "@get-bb/*", "@get-bb/**"],
  message:
    "The core is host-neutral: no host SDK imports. Reach a host through a host.ts port.",
};

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
    rules: {
      "no-restricted-imports": ["error", { patterns: [hostImports] }],
    },
  },
);
