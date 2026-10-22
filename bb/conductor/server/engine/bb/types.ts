import type { BbPluginApi } from "@get-bb/plugin-sdk";

// Derive host types through the plugin API so the adapter follows the SDK.
export type BbSdk = BbPluginApi["sdk"];
export type BbKv = BbPluginApi["storage"]["kv"];
export type BbThread = Awaited<ReturnType<BbSdk["threads"]["get"]>>;
export type BbPermissionMode = NonNullable<
  Parameters<BbSdk["threads"]["spawn"]>[0]["permissionMode"]
>;
