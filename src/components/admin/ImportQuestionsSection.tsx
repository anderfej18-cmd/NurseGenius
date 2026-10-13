import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Section } from "@/components/app/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { adminImportQuestions } from "@/functions/questions.functions";
import type { ExamType } from "@/lib/exam-type";
import { readLastUpload, saveLastUpload, type LastUpload } from "@/lib/last-upload";
import { importInBatches, parseQuestionText, PartialImportError } from "@/lib/question-import";

const FORMAT_EXAMPLE = `Q: What is the normal adult resting heart rate?
A) 40-60 bpm
B) 60-100 bpm
C) 100-140 bpm
D) 140-180 bpm
Answer: B
Explanation: The normal adult resting heart rate ranges from 60 to 100 bpm.`;

const lastUploadOnThisDevice = (): LastUpload | null => {
  try {
    return readLastUpload(localStorage);
  } catch {
    return null;
  }
};

/** Imports a .txt file of questions into the chosen exam type and subcategory. */
export function ImportQuestionsSection({
  examType,
  topic,
  onImported,
}: {
  examType: ExamType;
  /** The subcategory the file goes into; empty until one is chosen or named. */
  topic: string;
  onImported: (topic: string) => void;
}) {
  const [last, setLast] = useState<LastUpload | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  // Read after the page is on screen: the server that first renders it has no device storage.
  useEffect(() => setLast(lastUploadOnThisDevice()), []);

  const upload = async (file: File) => {
    const questions = parseQuestionText(await file.text());
    if (questions.length === 0) {
      toast.error("No complete questions found in that file. Check the format.");
      return;
    }
    setBusy(true);
    try {
      const imported = await importInBatches(questions, (batch) =>
        adminImportQuestions({ data: { examType, topic, questions: batch } }),
      );
      toast.success(`Imported ${imported} questions into ${examType}, ${topic}.`);
      const record: LastUpload = {
        fileName: file.name,
        examType,
        topic,
        imported,
        at: new Date().toISOString(),
      };
      setLast(record);
      try {
        saveLastUpload(localStorage, record);
      } catch {
        /* storage unavailable: the note only lives for this visit */
      }
      onImported(topic);
    } catch (error) {
      const saved =
        error instanceof PartialImportError && error.imported > 0
          ? ` ${error.imported} were added before it stopped.`
          : "";
      toast.error(`${(error as Error).message}${saved}`);
      if (error instanceof PartialImportError && error.imported > 0) onImported(topic);
    }
    setBusy(false);
    // A cleared input lets the same file be chosen again after it was fixed.
    setFileKey((key) => key + 1);
  };

  return (
    <Section
      title="Import a TXT file"
      description={
        topic === ""
          ? "Choose or name a subcategory above first."
          : `Questions go into ${examType}, ${topic}.`
      }
    >
      <Alert variant="info" icon={null}>
        <AlertDescription className="font-medium">
          One block per question, separated by a blank line or ---
        </AlertDescription>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs">
          {FORMAT_EXAMPLE}
        </pre>
      </Alert>
      <Field label="Question file (.txt)" hint="A file may hold any number of questions.">
        {(control) => (
          <Input
            {...control}
            key={fileKey}
            type="file"
            accept=".txt,text/plain"
            disabled={topic === "" || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        )}
      </Field>
      {busy && <p className="text-sm text-muted-foreground">Importing…</p>}
      <div className="border-t border-divider pt-4 text-sm">
        <p className="font-medium">Last upload on this device</p>
        {last ? (
          <>
            <p className="mt-1 break-all">{last.fileName}</p>
            <p className="text-muted-foreground">
              {last.imported} questions into {last.examType}, {last.topic}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {new Date(last.at).toLocaleString()}
            </p>
          </>
        ) : (
          <p className="mt-1 text-muted-foreground">No upload recorded on this device yet.</p>
        )}
      </div>
    </Section>
  );
}
