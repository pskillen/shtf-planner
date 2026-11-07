import type { Question } from '../../../model';
import { Field, FieldGroup, NumberInput, Segmented, Switch } from '../../components/controls';
import type { Answer } from './questionnaire';

/**
 * One asset question as a control: a yes/no as a switch, a number as a box with its unit, a choice
 * as segmented buttons. `onAnswer` gets the raw value; `setAnswer` coerces and stores it.
 */
export function QuestionField({
  question,
  value,
  onAnswer,
  hint,
}: {
  question: Question;
  value: Answer | undefined;
  onAnswer: (raw: Answer | undefined) => void;
  hint?: string;
}) {
  if (question.kind === 'bool') {
    return <Switch label={question.text} checked={value === true} onChange={onAnswer} />;
  }
  if (question.kind === 'choice') {
    return (
      <FieldGroup label={question.text}>
        <Segmented
          label={question.text}
          value={typeof value === 'string' ? value : undefined}
          options={(question.choices ?? []).map((c) => ({
            value: c,
            label: question.choiceLabels?.[c] ?? c,
          }))}
          onChange={onAnswer}
        />
        {question.noDefault && (
          <button type="button" onClick={() => onAnswer(undefined)}>
            Other / not sure
          </button>
        )}
      </FieldGroup>
    );
  }
  const unit = question.unit ? ` (${question.unit})` : '';
  return (
    <Field label={`${question.text}${unit}`} hint={hint}>
      <NumberInput value={typeof value === 'number' ? value : undefined} onChange={onAnswer} />
    </Field>
  );
}
