import { defineRpc, defineSettings } from "@getpaseo/plugin";
import {
  contextReminderSettingsDefinition,
  demoReminderDefinition,
  readReminderConfigDefinition,
  snoozeReminderDefinition,
} from "./contracts";

export const readReminderConfig = defineRpc(readReminderConfigDefinition);
export const snoozeReminder = defineRpc(snoozeReminderDefinition);
export const demoReminder = defineRpc(demoReminderDefinition);
export const contextReminderSettings = defineSettings(
  contextReminderSettingsDefinition,
);
