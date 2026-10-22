import { useId } from "react";
import type { Decision, Question, RequestForm } from "conductor/agents/models";
import {
  blankAnswers,
  toggleChoice,
  writeAnswer,
  type Answer,
} from "conductor/podium/agents-view";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SectionLabel } from "../ui/notice";

interface Props {
  form: RequestForm;
  draft: Decision | undefined;
  disabled: boolean;
  onChange(this: void, value: Decision): void;
}

/** A request's response form: native reason, action choice, or questions. */
export function QuestionForm({ form, draft, disabled, onChange }: Props) {
  if (form.kind === "native") {
    return <p className="text-sm text-muted-foreground">{form.reason}</p>;
  }
  if (form.kind === "actions") {
    return (
      <div className="space-y-2.5">
        <SectionLabel>Choose a response</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {form.actions.map((action) => {
            const selected =
              draft?.kind === "action" && draft.actionId === action.id;
            return (
              <Button
                key={action.id}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() =>
                  onChange({ kind: "action", actionId: action.id })
                }
                className={cn(
                  action.behavior === "deny" && "text-destructive",
                  selected && "border-foreground bg-state-active",
                )}
              >
                {action.label}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }
  const answers =
    draft?.kind === "answers" ? draft.answers : blankAnswers(form);
  return (
    <div className="space-y-7">
      {form.questions.map((question, index) => (
        <QuestionField
          key={question.header}
          question={question}
          position={`${index + 1} / ${form.questions.length}`}
          answer={answers[index] ?? { selected: [], text: "" }}
          disabled={disabled}
          onChange={(next) =>
            onChange({
              kind: "answers",
              answers: answers.map((value, i) => (i === index ? next : value)),
            })
          }
        />
      ))}
    </div>
  );
}

function QuestionField({
  question,
  position,
  answer,
  disabled,
  onChange,
}: {
  question: Question;
  position: string;
  answer: Answer;
  disabled: boolean;
  onChange(this: void, next: Answer): void;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-3" aria-labelledby={`${id}-question`}>
      <SectionLabel>{`${position} · ${question.header}`}</SectionLabel>
      <p id={`${id}-question`} className="text-base font-medium">
        {question.question}
      </p>
      {question.multiSelect && (
        <p className="text-xs text-muted-foreground">Select all that apply.</p>
      )}
      <div
        role={question.multiSelect ? "group" : "radiogroup"}
        aria-labelledby={`${id}-question`}
        className="space-y-2"
      >
        {question.options.map((option, choice) => {
          const selected = answer.selected.includes(choice);
          return (
            <button
              key={`${choice}:${option.label}`}
              type="button"
              role={question.multiSelect ? "checkbox" : "radio"}
              aria-checked={selected}
              disabled={disabled}
              onClick={() =>
                onChange(toggleChoice(answer, choice, question.multiSelect))
              }
              className={cn(
                "flex min-h-12 w-full items-start gap-2.5 rounded-md border bg-background p-3.5 text-left text-sm hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                selected ? "border-foreground" : "border-border",
              )}
            >
              <Icon
                name={selected ? "CircleCheck" : "Circle"}
                aria-hidden
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="space-y-1">
                <span className={cn("block", selected && "font-semibold")}>
                  {option.label}
                </span>
                {option.description !== "" && (
                  <span className="block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {question.allowOther && (
        <div className="space-y-2">
          <label
            htmlFor={`${id}-other`}
            className="text-xs text-muted-foreground"
          >
            {question.options.length
              ? "Or write your own answer"
              : "Your answer"}
          </label>
          <Textarea
            id={`${id}-other`}
            aria-label={`Answer: ${question.header}`}
            disabled={disabled}
            maxLength={4000}
            value={answer.text}
            onChange={(event) =>
              onChange(
                writeAnswer(answer, event.target.value, question.multiSelect),
              )
            }
            placeholder="Write a response…"
            className="min-h-24 text-sm"
          />
          {question.allowEmpty && (
            <p className="text-xs text-muted-foreground">
              A blank answer is allowed.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
