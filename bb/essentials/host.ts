import { mkdir } from "node:fs/promises";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { deleteCodexCatalog } from "essentials/cleaner/codex-catalog";
import { lstatOrNull } from "essentials/cleaner/fs";
import { resolveProviderHome } from "essentials/cleaner/provider-home";
import { cleanupThreadSessions } from "essentials/cleaner/thread-cleanup";
import { searchContent } from "essentials/file-explorer/content-search";
import { deleteEntry } from "essentials/file-explorer/delete";
import { readGitStatus } from "essentials/file-explorer/git-status";
import { readDirectory, searchFiles } from "essentials/file-explorer/reader";
import { hostContract } from "./server/entrypoints/host-contract";

// bb runs this entry on each enrolled host, so file reads, Git, deletes, and
// provider session cleanup run on the machine that owns the data.
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    "cleaner.observe_storage": async ({ storagePath, create }) => {
      if (create) {
        await mkdir(storagePath, { recursive: true });
      }
      const stat = await lstatOrNull(storagePath);
      return { exists: !!stat && stat.isDirectory() && !stat.isSymbolicLink() };
    },
    "cleaner.delete_sessions": ({ target, codexBin }, context) =>
      cleanupThreadSessions(
        target,
        {
          codexBin: () =>
            codexBin || process.env.ESSENTIALS_CODEX_BIN || "codex",
        },
        context.signal,
      ),
    "cleaner.delete_codex_catalog": ({ session }, context) =>
      deleteCodexCatalog(
        resolveProviderHome(session),
        session.id,
        context.signal,
        { python: process.env.ESSENTIALS_PYTHON_BIN || "python3" },
      ),
    "file_explorer.directory": ({ rootPath, ...input }, context) =>
      readDirectory(rootPath, input, context.signal),
    "file_explorer.search": ({ rootPath, ...input }, context) =>
      searchFiles(rootPath, input, context.signal, {
        bin: process.env.ESSENTIALS_RG_BIN || "rg",
      }),
    "file_explorer.content": ({ rootPath, ...input }, context) =>
      searchContent(rootPath, input, context.signal, {
        bin: process.env.ESSENTIALS_RG_BIN || "rg",
      }),
    "file_explorer.git_status": ({ rootPath }, context) =>
      readGitStatus(rootPath, context.signal),
    "file_explorer.delete": ({ rootPath, entry }, context) =>
      deleteEntry(rootPath, entry, context.signal),
  },
});
