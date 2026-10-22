import type { BbPluginApi } from "@get-bb/plugin-sdk";

// Derive host types through the plugin API so the adapter follows the SDK.
export type BbSdk = BbPluginApi["sdk"];
export type BbKv = BbPluginApi["storage"]["kv"];
export type BbThread = Awaited<ReturnType<BbSdk["threads"]["get"]>>;
export type BbPermissionMode = NonNullable<
  Parameters<BbSdk["threads"]["spawn"]>[0]["permissionMode"]
>;
/** The thread fields that both `threads.get` and `threads.list` return. */
export type BbThreadRow = Pick<
  BbThread,
  | "id"
  | "status"
  | "deletedAt"
  | "archivedAt"
  | "environmentId"
  | "parentThreadId"
  | "providerId"
  | "title"
  | "titleFallback"
  | "createdAt"
  | "updatedAt"
  | "latestAttentionAt"
>;
