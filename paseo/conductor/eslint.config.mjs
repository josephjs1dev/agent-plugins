import tseslint from "typescript-eslint";
import { readFileSync } from "node:fs";

// .core-files lists the host-neutral core that other hosts copy. Core code must
// not reach the Paseo SDK or this adapter's Paseo-only modules.
const coreFiles = readFileSync(new URL(".core-files", import.meta.url), "utf8")
  .split("\n")
  .filter((file) => /\.tsx?$/.test(file));
const hostImports = {
  group: [
    "@getpaseo/*",
    "@getpaseo/**",
    "**/engine/paseo/*",
    "**/entrypoints/*",
  ],
  message:
    "Core files (.core-files) are host-neutral: no Paseo SDK or adapter modules. Reach the host through a host.ts port.",
};

const sdkPeerImports = {
  group: [
    "@getpaseo/client",
    "@getpaseo/client/*",
    "@getpaseo/protocol",
    "@getpaseo/protocol/*",
  ],
  message:
    "Use the host-provided plugin SDK and derive types from its contracts; direct SDK peer imports require local packages during installation.",
};
const usePaseoMessage =
  "usePaseo is allowed only in client/paseo/; keep Paseo data access behind that module.";
const harnessImports = {
  group: ["**/harnesses", "**/harnesses/*"],
  message:
    "Only server/core/symphonies/metrics-recorder.ts and server/entrypoints may import harness log readers. Domain code sees tokens through metrics.",
};
export default tseslint.config(
  { ignores: ["dist/**", "test-results/**", "playwright-report/**"] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
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
  // Each file group gets one no-restricted-imports entry, because a later
  // entry for the same rule replaces an earlier one instead of extending it.
  {
    files: [
      "index.*.ts",
      "index.*.tsx",
      "server/engine/paseo/**",
      "server/entrypoints/**",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [sdkPeerImports] }],
    },
  },
  // The server entry file is not part of server/entrypoints; it may import the
  // Paseo SDK but not the harness readers.
  {
    files: ["index.*.ts", "index.*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [sdkPeerImports, harnessImports] },
      ],
    },
  },
  // Only the Paseo adapter, the entrypoints, and the server entry file may
  // import the Paseo SDK or server/engine/paseo modules. Domain code reaches Paseo
  // through the host.ts ports; tests exercise the adapter directly. Harness
  // readers are likewise visible only to metrics collection and entrypoints.
  {
    files: ["server/**", "shared/**"],
    ignores: [
      "server/engine/paseo/**",
      "server/entrypoints/**",
      "server/core/symphonies/metrics-recorder.ts",
      "server/core/harnesses/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            sdkPeerImports,
            {
              group: [
                "@getpaseo/plugin/server",
                "@getpaseo/plugin/server/*",
                "**/paseo/*",
              ],
              message:
                "Only server/engine/paseo, server/entrypoints, and index.server.ts may import the Paseo SDK or server/engine/paseo modules. Domain code calls Paseo through its host.ts interface.",
            },
            harnessImports,
          ],
        },
      ],
    },
  },
  // Core files: later entries replace the server/shared rule for these files.
  {
    files: coreFiles,
    ignores: [
      "server/core/symphonies/metrics-recorder.ts",
      "server/core/harnesses/**",
      "tests/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [hostImports, harnessImports] },
      ],
    },
  },
  {
    files: coreFiles.filter(
      (file) =>
        file === "server/core/symphonies/metrics-recorder.ts" ||
        file.startsWith("server/core/harnesses/") ||
        file.startsWith("tests/"),
    ),
    rules: { "no-restricted-imports": ["error", { patterns: [hostImports] }] },
  },
  // The client never imports the Paseo SDK server side or server/engine/paseo at all;
  // its Paseo data access lives behind client/paseo/.
  {
    files: ["client/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            sdkPeerImports,
            {
              group: [
                "@getpaseo/plugin/server",
                "@getpaseo/plugin/server/*",
                "**/server/engine/paseo/*",
              ],
              message:
                "The client must not import the Paseo SDK server side or server/engine/paseo modules; use client/paseo/ for Paseo data access.",
            },
            harnessImports,
          ],
        },
      ],
    },
  },
  // Paseo data access lives in client/paseo/; the Podium borrows it through
  // that module instead of calling usePaseo itself.
  {
    files: ["client/**"],
    ignores: ["client/paseo/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'ImportSpecifier[imported.name="usePaseo"]',
          message: usePaseoMessage,
        },
        // Namespace imports: Plugin.usePaseo() or const { usePaseo } = Plugin.
        {
          selector: 'MemberExpression[property.name="usePaseo"]',
          message: usePaseoMessage,
        },
        {
          selector: 'ObjectPattern > Property[key.name="usePaseo"]',
          message: usePaseoMessage,
        },
      ],
    },
  },
  // Fake asynchronous adapters preserve the production interface without artificial waits.
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: { "@typescript-eslint/require-await": "off" },
  },
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
);
