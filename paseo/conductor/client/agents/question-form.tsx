import { Pressable, Text, TextInput, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { Decision, RequestForm } from "conductor/agents/models";
import { Button, Label, rowStyle } from "../ui/controls";
import {
  blankAnswers,
  toggleChoice,
  writeAnswer,
} from "conductor/podium/agents-view";

interface Props {
  form: RequestForm;
  draft: Decision | undefined;
  theme: PluginTheme;
  disabled: boolean;
  onChange(this: void, value: Decision): void;
}
export function QuestionForm({
  form,
  draft,
  theme,
  disabled,
  onChange,
}: Props) {
  if (form.kind === "native") {
    return (
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 14,
          lineHeight: 22,
        }}
      >
        {form.reason}
      </Text>
    );
  }
  if (form.kind === "actions") {
    return (
      <View style={{ gap: 10 }}>
        <Label theme={theme}>CHOOSE A RESPONSE</Label>
        <View style={rowStyle}>
          {form.actions.map((action) => (
            <Button
              key={action.id}
              theme={theme}
              label={action.label}
              selected={
                draft?.kind === "action" && draft.actionId === action.id
              }
              danger={action.behavior === "deny"}
              disabled={disabled}
              onPress={() => onChange({ kind: "action", actionId: action.id })}
            />
          ))}
        </View>
      </View>
    );
  }
  const answers =
    draft?.kind === "answers" ? draft.answers : blankAnswers(form);
  return (
    <View style={{ gap: 28 }}>
      {form.questions.map((question, index) => {
        const answer = answers[index] ?? { selected: [], text: "" };
        const update = (next: typeof answer) => {
          onChange({
            kind: "answers",
            answers: answers.map((value, i) => (i === index ? next : value)),
          });
        };
        return (
          <View key={question.header} style={{ gap: 12 }}>
            <Label
              theme={theme}
            >{`${index + 1} / ${form.questions.length} · ${question.header}`}</Label>
            <Text
              style={{
                fontSize: 16,
                lineHeight: 24,
                fontWeight: "500",
                color: theme.colors.foreground,
              }}
            >
              {question.question}
            </Text>
            {question.multiSelect && (
              <Text
                style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}
              >
                Select all that apply.
              </Text>
            )}
            {question.options.map((option, choice) => {
              const selected = answer.selected.includes(choice);
              return (
                <Pressable
                  key={`${choice}:${option.label}`}
                  accessibilityRole={
                    question.multiSelect ? "checkbox" : "radio"
                  }
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  onPress={() =>
                    update(toggleChoice(answer, choice, question.multiSelect))
                  }
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected
                      ? theme.colors.accent
                      : theme.colors.border,
                    backgroundColor: theme.colors.surface1,
                    gap: 5,
                    minHeight: 48,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: selected ? "600" : "400",
                      color: theme.colors.foreground,
                    }}
                  >
                    {selected ? "✓  " : "○  "}
                    {option.label}
                  </Text>
                  {option.description !== "" && (
                    <Text
                      style={{
                        fontSize: 12,
                        lineHeight: 19,
                        color: theme.colors.foregroundMuted,
                      }}
                    >
                      {option.description}
                    </Text>
                  )}
                </Pressable>
              );
            })}
            {question.allowOther && (
              <View style={{ gap: 8 }}>
                <Text
                  style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}
                >
                  {question.options.length
                    ? "Or write your own answer"
                    : "Your answer"}
                </Text>
                <TextInput
                  accessibilityLabel={`Answer: ${question.header}`}
                  multiline
                  editable={!disabled}
                  maxLength={4000}
                  value={answer.text}
                  onChangeText={(text) =>
                    update(writeAnswer(answer, text, question.multiSelect))
                  }
                  placeholder="Write a response…"
                  placeholderTextColor={theme.colors.foregroundMuted}
                  style={{
                    color: theme.colors.foreground,
                    backgroundColor: theme.colors.surface0,
                    borderColor: theme.colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    padding: 12,
                    minHeight: 92,
                    fontSize: 14,
                    textAlignVertical: "top",
                  }}
                />
                {question.allowEmpty && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.colors.foregroundMuted,
                    }}
                  >
                    A blank answer is allowed.
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
