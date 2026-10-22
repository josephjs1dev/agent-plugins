import tseslint from "typescript-eslint";

export default tseslint.config(
  // components/, lib/ and hooks/ are vendored bb registry source.
  { ignores: ["node_modules", "dist", "components", "lib", "hooks"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      curly: ["error", "all"],
      "no-nested-ternary": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
