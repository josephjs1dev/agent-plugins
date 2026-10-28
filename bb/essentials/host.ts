import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { deleteEntry } from "essentials/file-explorer/delete";
import { readGitStatus } from "essentials/file-explorer/git-status";
import { readDirectory, searchFiles } from "essentials/file-explorer/reader";
import { hostContract } from "./server/entrypoints/host-contract";

// bb runs this entry on each enrolled host, so file reads, Git, and deletes
// run on the machine that owns the environment's checkout.
export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    "file_explorer.directory": ({ rootPath, ...input }, context) =>
      readDirectory(rootPath, input, context.signal),
    "file_explorer.search": ({ rootPath, ...input }, context) =>
      searchFiles(rootPath, input, context.signal),
    "file_explorer.git_status": ({ rootPath }, context) =>
      readGitStatus(rootPath, context.signal),
    "file_explorer.delete": ({ rootPath, entry }, context) =>
      deleteEntry(rootPath, entry, context.signal),
  },
});
