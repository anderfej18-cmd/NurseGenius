import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExamType } from "@/lib/exam-type";

/** The RN or RM choice every admin form starts with. */
export function ExamTypeField({
  value,
  onChange,
  label = "Exam",
}: {
  value: ExamType;
  onChange: (value: ExamType) => void;
  label?: string;
}) {
  return (
    <Field label={label}>
      {(control) => (
        <Select value={value} onValueChange={(next) => onChange(next === "RM" ? "RM" : "RN")}>
          <SelectTrigger {...control}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RN">RN, Registered Nurse</SelectItem>
            <SelectItem value="RM">RM, Registered Midwife</SelectItem>
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
