import type {
  AgentPermissionAction,
  AgentPermissionRequest,
  AgentPermissionResponse,
} from "conductor/agents/agent";
import type { BbSdk } from "./types";

type Interactions = BbSdk["threads"]["interactions"];
export type BbInteraction = Awaited<ReturnType<Interactions["list"]>>[number];
export type BbResolution = Parameters<Interactions["resolve"]>[0]["resolution"];
type Approval = Extract<BbInteraction["payload"], { kind: "approval" }>;
type Question = Extract<BbInteraction["payload"], { kind: "user_question" }>;

const decisionLabels: Record<string, string> = {
  allow_once: "Allow once",
  allow_for_session: "Allow for this session",
  deny: "Deny",
};

function approvalTitle(subject: Approval["subject"]): string {
  switch (subject.kind) {
    case "command":
      return subject.command;
    case "file_change":
      return subject.writeScope ? `Edit ${subject.writeScope}` : "Edit files";
    case "permission_grant":
      return "Grant permissions";
    case "plan":
      return "Approve plan";
    case "tool_use":
      return subject.presentation.title ?? subject.tool;
  }
}

/** Unique question headers; the core keys answers by header. */
function headers(questions: Question["questions"]): string[] {
  const labels = questions.map((question) =>
    (question.shortLabel ?? question.prompt).slice(0, 200),
  );
  return new Set(labels).size === labels.length
    ? labels
    : questions.map((question) => question.id.slice(0, 200));
}

/**
 * One pending bb interaction in the Podium's request shape. An approval offers
 * its decisions as actions. A question uses the core's question format. Any
 * other kind falls back to bb's native controls.
 */
export function toPermissionRequest(
  interaction: BbInteraction,
  provider: string,
): AgentPermissionRequest {
  const payload = interaction.payload;
  if (payload.kind === "approval") {
    const actions: AgentPermissionAction[] = payload.availableDecisions.map(
      (decision) => ({
        id: decision,
        label: decisionLabels[decision] ?? decision,
        behavior: decision === "deny" ? "deny" : "allow",
      }),
    );
    return {
      id: interaction.id,
      provider,
      kind: "tool",
      name: payload.subject.kind,
      title: approvalTitle(payload.subject),
      ...(payload.reason ? { description: payload.reason } : {}),
      input: { subject: payload.subject },
      actions,
    };
  }
  if (payload.kind === "user_question") {
    const names = headers(payload.questions);
    return {
      id: interaction.id,
      provider,
      kind: "question",
      name: "user_question",
      title: payload.questions[0]?.prompt ?? "Question",
      input: {
        questions: payload.questions.map((question, index) => ({
          header: names[index],
          question: question.prompt,
          options: (question.options ?? []).map((option) => ({
            label: option.label,
            ...(option.description ? { description: option.description } : {}),
          })),
          multiSelect: question.multiSelect,
          allowOther: question.allowFreeText,
        })),
      },
    };
  }
  return {
    id: interaction.id,
    provider,
    kind: "native",
    name: payload.kind,
    title: payload.title,
  };
}

/** The labels in `value` that name options, and any text left over. */
function answer(question: Question["questions"][number], value: string) {
  const options = question.options ?? [];
  const byLabel = new Map(options.map((option) => [option.label, option]));
  const exact = byLabel.get(value);
  if (exact) {
    return { selected: [exact.value] };
  }
  if (question.multiSelect) {
    const parts = value.split(", ");
    const selected: string[] = [];
    while (parts.length && byLabel.has(parts[0] ?? "")) {
      selected.push(byLabel.get(parts.shift() ?? "")?.value ?? "");
    }
    const freeText = parts.join(", ");
    return { selected, ...(freeText ? { freeText } : {}) };
  }
  return { selected: [], freeText: value };
}

/** The bb resolution for a core response to one pending interaction. */
export function toResolution(
  interaction: BbInteraction,
  response: AgentPermissionResponse,
): BbResolution | null {
  const payload = interaction.payload;
  if (payload.kind === "approval") {
    const decision =
      response.selectedActionId ??
      (response.behavior === "deny" ? "deny" : "allow_once");
    if (decision === "deny") {
      return { decision: "deny" };
    }
    if (decision !== "allow_once" && decision !== "allow_for_session") {
      return null;
    }
    return { decision, grantedPermissions: null };
  }
  if (payload.kind === "user_question") {
    const raw = response.updatedInput?.answers;
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const values = raw as Record<string, unknown>;
    const names = headers(payload.questions);
    const answers: Record<string, { selected: string[]; freeText?: string }> =
      {};
    for (const [index, question] of payload.questions.entries()) {
      const value = values[names[index] ?? ""];
      answers[question.id] =
        typeof value === "string" ? answer(question, value) : { selected: [] };
    }
    return { kind: "user_answer", answers };
  }
  return null;
}
