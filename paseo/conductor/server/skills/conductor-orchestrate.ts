// Embedded so Git and npm installs need no extra files or dev dependencies.
export const ORCHESTRATE_SKILL = `---
name: paseo-conductor-orchestrate
description: Turn an approved plan or request into a Paseo Conductor symphony from this session. Split it into tasks, choose a configured profile or model per task (implement, explore, plan, review), dispatch task agents, track their reports, and finish with a summary. Use when the user says "orchestrate", "conductor", "symphony", "split this into tasks", "dispatch agents", "run this plan with agents", or asks to parallelize work across agents. Requires the Paseo Conductor plugin. Do not use it to create a dedicated Conductor agent.
---

# Conductor orchestrate

This session is the Conductor. You plan, dispatch, review and finish. Task agents do the task work. Do not create a dedicated Conductor agent.

## Terms

- **Symphony**: one task orchestration: this Conductor session plus its task agents, as shown in the Podium. \`symphonyId\` is the UUID that \`orchestrate\` returns.
- **Task**: one bounded assignment for one task agent. **Attempt**: one task agent's try at a task. A retry or a reopen creates a new attempt.
- **Loop**: one pass over the score, numbered from 1. A loop ends when nothing runs and nothing more can start. It *succeeded* when every task's latest attempt is \`completed\`; otherwise it *needs changes*. Fixes run in the next loop of the same symphony.
- **Outcome**: \`completed\`: done, every check passed, no blocking findings. \`needs-changes\`: the work ran, but checks still fail or a review found blocking findings; the next loop resolves it. \`failed\`: the harness could not run the work (launch, unreachable agent, permissions, sandbox, refused scope, unavailable model); retried in the same loop.
- **Finding**: a defect in a report: \`{id, severity: blocking or minor, taskId, paths, summary, suggestedFix}\`. \`loop\`, \`deferred\` and \`unresolved\` name it as \`<reporter task>#<id>\`, such as \`review#F1\`.
- **Task agent**: a child agent that the Conductor creates for a task. Commands and profiles call this role \`worker\`.

## Use the Conductor tools

1. Conductor commands are MCP tools on the \`conductor\` server named in the \`[Conductor agent commands]\` system instructions, such as \`orchestrate\`, \`define\` and \`dispatch\`. The provider may add a prefix, such as \`mcp__conductor__orchestrate\`. Paseo binds this agent's identity to the server.
2. Call the tools directly with their arguments. Never run Conductor commands or the MCP server through a shell.
3. If the tools are missing, stop. Tell the user to enable the Conductor plugin in Paseo and start a new agent.

Example \`orchestrate\` arguments:

\`\`\`json
{"key":"task-priority","title":"Add task priority","goal":"..."}
\`\`\`

Every successful call returns an acknowledgement. An error result is a failure. Each tool's description and input schema give its fields.

## Workflow

### 1. Confirm the goal

- Use the approved plan from this conversation, or the user's request.
- Ask only if the scope or the authorized actions are unclear.
- Do not orchestrate a small edit. Do it yourself, unless the user asks for a symphony.

### 2. Start the symphony

\`orchestrate\` input:

- \`key\`: a stable request key, such as \`task-priority\`. Reuse the same key after an empty or uncertain response. A repeated key returns the same symphony, not a second one.
- \`title\`: 160 characters or fewer.
- \`goal\`: 16000 characters or fewer. Include the plan, the constraints and the acceptance criteria. Each task agent sees only the first 4000 characters, so put the shared constraints first.
- \`concurrency\`: optional, 1–4, default 3.
- \`maxLoops\`: optional loop budget, 1–5, default 3. Past it, \`loop\` needs the user's approval.
- \`autoLoop\`: optional, default \`true\`. Conductor starts a routine next loop itself (step 8b). Set \`false\` only when the user wants to approve every loop.
- Do not set \`conductor\` or \`conductorProfile\`.

Keep the returned \`symphonyId\`. Read the returned \`instructions\`. If they differ from this skill, follow the instructions.

### 3. List profiles and models

Call \`profiles\` and \`models\` once, before you split the goal. Neither takes arguments.

- \`profiles\` returns Conductor-owned profile identity, notes, provider/model/permission fields, routing classification, \`hasInstructions\`, one catalog revision and diagnostics. It does not return instruction text. A profile is classified only when it has at least one role and a size; never guess a size from a model name.
- Create and edit profiles in Podium › Profiles. Choose a provider/model and configure roles and size there. Add skill names the task agent should use to the profile's instructions; Conductor does not discover skills.
- \`profiles.providers\` supplies the provider/model/thinking-option/mode catalog used by the Podium pickers. \`models\` lists available providers and model IDs for worker selection. Podium › Profiles also offers a one-time import from Paseo profiles; imported entries become independent Conductor profiles.
- \`route\` is read-only. Pass a \`role\` and optionally an explicit profile or inline worker choice. It returns the selected profile, eligible alternatives ordered by size (small, medium, large), exclusions and concise reasons. Subject-matter fit comes from profile notes, not model-name heuristics.
- Profile data is stored by Conductor under \`~/.conductor/profiles.json\` (or \`$CONDUCTOR_HOME/profiles.json\`); edit it through Podium › Profiles. A missing store means no profiles are configured and mode is \`warn\`.

### 4. Split the goal into tasks

Size first:

1. Do not split one coherent change, a single-file change, or work that depends heavily on shared context. Define one task, or do a small edit yourself.
2. Scale the task count to the work. A fact lookup is 1 task. A comparison or a change across two layers is 2–4 tasks. Broad independent work is 5–8 tasks. The maximum is 12. Each task is a new agent that reads its files from scratch, so a split pays only when the parts can run at the same time.

Then build the score:

1. Split by file ownership or layer, not by step. Code and its tests are one task.
2. Put shared contracts, such as schemas, types and RPC shapes, in one early task. The other tasks depend on it.
3. Give each writable path to one task. Tasks that run at the same time must not write the same path.
4. Always set \`writes\`. Use \`[]\` for research and review. An omitted \`writes\` defaults to \`["."]\`, and that task then runs alone.
5. Put exclusive non-file items in \`resources\`, such as a lockfile install, a port, a database, a plugin reload or a shared check target.
6. Add \`dependsOn\` only for a real data flow or write order.
7. Add a planning task only to resolve a named open design decision. Writer count or a shared contract alone never calls for a planning task. Executing an approved design is implementation.
8. End a writing score with a read-only review task: set \`review: true\`, \`writes: []\`, and its \`reads\` to the writers' \`writes\`. Its description names the acceptance criteria to check; the review prompt already limits blocking findings to concrete failures, failed checks, unmet criteria and security defects. A review task starts once each prerequisite is \`completed\` or \`needs-changes\`, and receives their open findings and failed checks, so one loop collects every defect. Other tasks wait for \`completed\` prerequisites.
9. Add an integration task when 2 or more writers change adjacent layers. It owns the glue files and runs the full checks.

Fields:

- \`id\`: letters, digits, \`_\` and \`-\`. It starts with a letter or digit, has 64 characters or fewer, and is unique.
- \`description\`: 4000 characters or fewer. A task agent sees only a shortened goal, its own task and the reports of its prerequisites. It does not see this conversation. Write each description as a standalone contract, in the format below.
- \`dependsOn\`: the task IDs that must complete first. Do not create cycles. Each dependent task agent receives its prerequisites' reports.
- \`reads\` and \`writes\`: real checkout-relative paths, such as \`server\` or \`client/symphonies/task-card.tsx\`. Do not use \`..\`, wildcards or symbolic links. \`writes: []\` makes a read-only task.
- \`resources\`: names for exclusive non-file items, such as \`npm-install\` or \`port-8080\`. Names use the \`id\` format. Tasks that share a resource run one at a time.
- \`checks\`: the exact commands or checks the task agent must run and report, such as \`npm run check\`.
- \`review\`: \`true\` for a read-only review task. Only a review task may report findings against other tasks.
- \`role\`: optional routing intent: \`exploration\`, \`implementation\`, \`planning\` or \`review\`.
- \`openDecision\`: name the unresolved decision for a \`planning\` task. \`role: "planning"\` requires it; use \`implementation\` to carry out an approved decision. A \`review\` role requires \`review: true\`.

Description contract:

\`\`\`text
Objective: one sentence.
Context: decisions, constraints and user preferences from this conversation. Key files as path:line.
Inputs: prerequisite task IDs and what to take from each report.
Owned paths: same as writes. Do not touch: paths other tasks own.
Acceptance: testable criteria.
Out of scope: explicit exclusions.
Report: the evidence to return. Put the most important result first, because dependents receive a shortened report.
\`\`\`

Scheduling:

- Up to \`concurrency\` tasks run at the same time. Two tasks wait for each other only when one task's \`writes\` overlap the other's \`reads\` or \`writes\`, or when they share a \`resources\` name. Writers with disjoint \`writes\` run in parallel.
- Keep \`reads\` and \`writes\` narrow. A task with \`reads: ["."]\` waits for every writer.
- A writer's checks can see another writer's partial edits. When writers share a check target, such as \`npm run check\` in one package, give them one shared \`resources\` name, or give each a check scoped to its own files and leave the full check to the integration or review task.

### 5. Choose a task agent for each task

Split first, then route. Do not create tasks to match profiles.

1. Honor a profile the user named, subject to availability and the permission ceiling.
2. Otherwise run \`route\` with the task role. Match subject matter from each profile's “When to use” notes. Pick the smallest eligible profile for the role (small, then medium, then large); ties follow store order, then profile ID. Do this even when the deliverable is prose or Markdown. Use \`implementation\` to execute an approved design; use \`planning\` only for open design decisions. Prefer a reviewer on a different provider/model from the implementer.
3. Give each task focused context and a short visible selection reason in \`routing: {"reason":"..."}\`; an automatic route supplies its own concise reason. Automatic routing ignores “When to use” notes: it takes the smallest size, then store order. Omit worker fields only when exactly one eligible profile has the smallest size for the role. When two or more share the smallest size, name one with \`profile\`, chosen by its “When to use” notes, and give the reason. If none is eligible, choose an explicit profile, an inline \`provider\`/\`model\` (optional \`thinkingOptionId\`), or \`profile: "inherit"\` with a reason. Inherit is explicit opt-in; never silently inherit the Conductor's model.
4. Escalate past the eligible smaller-first choice only for an explicit user choice, a concrete capability gap, an observed model limitation after bounded corrective attempts, or no eligible configured profile. Add \`routing.override: {"category":"user-choice|capability-gap|observed-limitation|no-eligible-profile","evidence":"specific evidence"}\`. When no profile is eligible, choose an explicit profile, inline worker, or \`profile: "inherit"\` with a reason; strict mode also requires a valid \`no-eligible-profile\` override. “Needs quality” is not evidence. Diagnose missing input, permissions and sandbox issues before treating failure as a model limitation.

Profiles are owned by Conductor and edited in Podium › Profiles. Set the routing mode there with the **Enforce routing** switch: off is \`warn\` (the default), and on is \`strict\`. Each profile has routing fields (\`roles\` and \`size\`: \`small\`, \`medium\` or \`large\`), “When to use” notes, and free-text instructions. The notes guide subject-matter matching. A profile without roles or size is unclassified and shows a warning in its Profiles card; routing cannot select it. Instructions are delivered to the task agent in a clearly marked section; they cannot override user instructions, repository rules, write scope, or the permission ceiling. Put skill names the agent should use in these instructions. The Conductor filters by classification, role, provider availability and permission ceiling, then prefers the smallest eligible size. \`warn\` is the default: a larger-than-eligible, ineligible, unclassified or inline choice is accepted with a warning in the acknowledgement and attempt. \`strict\` requires a valid override category and specific evidence. Unknown/stale profile IDs appear in diagnostics.

Permissions: a task agent never gets a broader permission mode than this session. An explicit profile \`modeId\` overrides the inherited Conductor mode; a task agent on another provider without a profile mode starts in that provider's default mode. Conductor rejects an elevated mode when this session is not elevated. \`define\`, \`loop\` and \`dispatch\` validate choices; dispatch revalidates if the catalog revision changes.

### 6. Define the tasks

\`define\` arguments:

\`\`\`json
{"symphonyId":"<symphonyId>","tasks":[
  {"id":"schema","title":"Add a task priority field","description":"Add an optional priority from 1 to 3 to the task schema. Acceptance: define accepts priorities 1–3 and rejects other values.","dependsOn":[],"reads":["shared"],"writes":["shared/symphonies/commands.ts","shared/symphonies/models.ts"],"checks":["npm run typecheck"]},
  {"id":"review","title":"Review the schema change","description":"Review the schema task for validation gaps and missing tests. Report each blocking defect as a finding with taskId schema and path:line.","dependsOn":["schema"],"reads":["shared/symphonies/commands.ts","shared/symphonies/models.ts"],"writes":[],"checks":[],"review":true,"profile":"<profile id from profiles>"}
]}
\`\`\`

\`define\` runs once per symphony. A second \`define\` with a different score fails with \`This symphony already has a different score.\` Add tasks in a later loop with \`loop\` \`tasks\` (step 8b).

### 7. Dispatch the tasks and wait

\`dispatch\` arguments:

\`\`\`json
{"symphonyId":"<symphonyId>"}
\`\`\`

- Dispatch creates the task agents and follows the dependencies.
- End your turn after dispatch. Conductor wakes this conversation when a task needs attention, when a loop succeeds, or when a loop needs a decision (step 8b).
- Do not edit this checkout while task agents run. Route changes through tasks.
- Do not poll in a loop. Call \`get\` with \`{"symphonyId":"<symphonyId>"}\` only when you need the current state.

### 8. Handle blocked and failed tasks

This step covers only \`failed\` (a harness problem) and \`blocked\` tasks. A \`needs-changes\` task is not retried; it is resolved by the next loop (step 8b).

- Act on the per-task notification summary first. Call \`get\` or open a task agent's conversation only when the summary does not explain the failure. Task agents diagnose and fix their own changes for up to 3 rounds; do not fix the cause yourself.
- Choose the retry action from \`diagnosis.need\`. For \`scope\`, dispatch with \`retryTaskId\` and \`addWrites\` set to \`requestedWrites\`, or ask the user if those paths exceed the goal. For \`input\`, ask the user, then include the answer in \`note\`. For \`model\`, choose a different \`profile\` or \`provider\`/\`model\`/\`thinkingOptionId\`. For \`harness\` (or the older \`none\`), include a specific direction in \`note\`.
- A failed task gets at most 2 retries per loop (3 attempts), counted only from \`failed\` attempts in that loop. Blocker resumes and nudges do not count, and failed retries never use the loop budget. A task agent that stops without reporting after the nudge, becomes unreachable, or whose launch stays unconfirmed is \`failed\` with \`need: "harness"\`; retrying an unconfirmed launch replays the same agent identity and counts. At the limit, \`dispatch\` refuses the retry; ask the user how to proceed.
- Retry on the same worker choice first. A harness failure does not justify switching models: diagnose missing input, permissions and sandbox first. Escalate only for a concrete capability gap or observed model limitation, with a specific routing override. Never switch to a profile whose \`modeId\` is broader than this session's. If every available choice has failed, ask the user. Otherwise dispatch with \`retryTaskId\`; include \`note\` when giving guidance.
- An unchanged worker choice continues on the same agent when it still exists and is inactive; otherwise Conductor creates a new agent. A blocked task resumes on its task agent when the worker choice is unchanged and it can receive a message; a changed worker choice starts a new agent. Do not replace an active task agent.
- Task agents can request extra write paths with \`widen\`. A refusal leaves scope unchanged; use \`need: "scope"\` and \`requestedWrites\` so you can retry with \`addWrites\` or ask the user.

### 8b. Loops

A loop ends when nothing runs and nothing more can start. Its wake states the verdict once per loop. Resolve \`failed\` and \`blocked\` tasks with step 8 first; \`loop\` is refused while any remain.

- *Succeeded*: go to step 9.
- *Routine needs changes*: with \`autoLoop\` on, Conductor starts the next loop itself. It reopens the owner of every blocking finding and every needs-changes task on its existing agent, and re-runs their dependents. You are not woken, and the loop record has \`auto: true\`. Conductor leaves the loop to you when the findings repeat, the budget is used, an item was deferred, or the automatic loop could not start.
- *Needs changes*: the wake lists the blocking findings and failed checks with their owning tasks. Do not fix them yourself, and never start a new symphony for them.
  1. Group the findings by owning task: the finding's \`taskId\`, or the reporting task when it has none.
  2. Send \`loop\` with \`reopen\` for each owning task and its findings. Each reopened task continues on its existing agent when that agent can receive a message; otherwise a new agent starts with the previous report. Use \`note\` for direction, \`addWrites\` for missing scope, and \`after\` for loop-only prerequisites. Change workers after a check/review failure only through the reopen worker override (\`profile\` or inline \`provider\`/\`model\`/\`thinkingOptionId\`) with \`routing.reason\` and any required evidence-backed \`routing.override\`.
  3. Add a planning task through \`tasks\` only when the fix needs a design decision, and put it in the reopened task's \`after\`.
  4. Defer a finding or task in \`deferred\` only with a concrete reason. Every blocking finding and every \`needs-changes\` task must be reopened or deferred. A deferred item stays open: later wakes list it again, and every later \`loop\` must reopen or defer it again. Name a finding as \`<reporter task>#<id>\` when two reports use the same id.
  5. End your turn. Transitive dependents of reopened tasks, including the review, re-run automatically in the new loop; the review receives the previous findings and confirms each fix.
- *Repeated findings*: when the wake says the findings repeat the previous loop, ask the user before you start another loop.
- *Budget used*: when the wake says the loop budget is used, ask the user whether to continue or stop. Send \`loop\` with \`approval: {"loops": <next loop number>, "userAnswer": "<the user's words>"}\` only after the user answered in this conversation. If the user chooses to stop, finish with \`unresolved\` (step 9).

\`loop\` arguments:

\`\`\`json
{"symphonyId":"<symphonyId>","reason":"Fix review findings F1-F3",
 "reopen":[
  {"taskId":"api","findings":["review#F1","review#F2"],"note":"Validate concertId before lookup.","after":["plan-2"]},
  {"taskId":"ui","findings":["review#F3"]}],
 "tasks":[{"id":"plan-2","title":"Plan the concertId validation","description":"...","dependsOn":[],"reads":["server","shared"],"writes":[],"checks":[]}],
 "deferred":[{"finding":"review#F4","reason":"Needs a user decision on the API shape"}]}
\`\`\`

### 9. Finish the symphony

1. Wait until every task has explicitly reported and stopped. Do not infer completion from idle.
2. Read every report and its check results.
3. Review every attempt's \`addedWrites\` (paths the Conductor added) and \`grantedWrites\` (paths a task agent widened to), with their reasons. List those paths and reasons in the finish summary.
4. Verify the integrated result if the plan asks for it.
5. Call \`finish\` with \`{"symphonyId","summary"}\` after a loop succeeded. The summary states what changed, which checks passed or failed, the number of loops, minor findings, deferred items with their reasons, what remains, and any granted paths with their reasons.
6. Only when the user chose to stop with open work, wait until every task agent has stopped and settled, then add \`unresolved: [{"finding" or "taskId", "reason"}]\` covering every open blocking finding and every task without a completed report. The symphony then ends as failed; list each unresolved item in the summary.

## Troubleshooting

Most error messages name their fix; follow the message. These need more context:

- No Conductor tools: the Conductor MCP server did not start for this agent. Tell the user to enable the Conductor plugin and start a new agent.
- \`Command acknowledgement is uncertain.\`: call \`get\` to inspect, then retry with the same \`key\` or attempt.
- \`Conductor profiles are invalid: ...\` or \`Conductor could not load or save the worker profiles.\`: correct the profile data in Podium › Profiles, or refresh Podium, then retry.
- \`Profile catalog changed since define (...); routing was revalidated.\`: review \`profiles\` and \`route\`; reopen with a validated worker override if needed.
- \`Task "<id>" override evidence is generic; ...\`: state the specific user choice, capability gap or observed limitation.
- \`Retry requires a settled failed or blocked task agent; ...\`: the task reported \`needs-changes\`. Wait for the loop to end, then reopen it with \`loop\` (step 8b).
- \`Loop must reopen or defer every open item: ...\` or \`Loop <N> exceeds the loop budget (<max>). ...\`: follow step 8b.
- \`Widen refused: ...\`: do not edit those paths. The task agent reports \`need: "scope"\` with \`requestedWrites\`; retry with \`addWrites\` after the conflict clears, or ask the user.

## Rules

- Do not commit or push unless the user authorized it.
- Do not expand the authorized scope.
- Do not start a second symphony for the same request. Reuse the \`key\`.
- Fixes for review findings always stay in the same symphony: use \`loop\`. Never start a symphony to fix another symphony's findings.
- Never \`finish\` while a review has open blocking findings, except with \`unresolved\` after the user chose to stop.
- Never send \`approval\` unless the user answered in this conversation.
- A task agent must not use this skill. A task agent reports on its own attempt only.
`;
