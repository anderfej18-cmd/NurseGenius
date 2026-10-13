import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  adminCreateSubtopic,
  adminDeleteSubtopic,
  adminListSubtopics,
  adminRenameSubtopic,
} from "@/functions/questions.functions";
import { useServerData } from "@/hooks/use-server-data";
import type { ExamType } from "@/lib/exam-type";

type Subtopic = Awaited<ReturnType<typeof adminListSubtopics>>[number];

interface Props {
  examType: ExamType;
  topic: string;
  /** Called after any change, so the question list can reload its subtopic choices. */
  onChanged: () => void;
}

/** Create, rename and delete the subtopics of one topic. Deleting leaves the questions in place. */
export function SubtopicManager({ examType, topic, onChanged }: Props) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Subtopic | null>(null);
  const list = useServerData(
    () => adminListSubtopics({ data: { examType, topic } }),
    [examType, topic],
  );

  /** Runs one change; true when it worked (a failure has already been said in a toast). */
  const run = async (work: () => Promise<unknown>): Promise<boolean> => {
    try {
      await work();
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
    await list.reload();
    onChanged();
    return true;
  };

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h3 className="font-sans text-base font-semibold tracking-normal">Subtopics of {topic}</h3>
      {list.error && (
        <p role="alert" className="text-sm text-destructive">
          The subtopics could not be loaded. {list.error}
        </p>
      )}
      {list.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No subtopics yet.</p>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="divide-y divide-divider">
          {list.data.map((subtopic) => (
            <li key={subtopic.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 break-words text-sm">{subtopic.name}</span>
              <span className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Rename ${subtopic.name}`}
                  onClick={() => setRenaming(subtopic)}
                >
                  <Pencil />
                </Button>
                <ConfirmDialog
                  title={`Delete “${subtopic.name}”?`}
                  description="Its questions stay in the bank, without a subtopic."
                  confirmLabel="Delete subtopic"
                  destructive
                  onConfirm={() =>
                    run(() => adminDeleteSubtopic({ data: { subtopicId: subtopic.id } }))
                  }
                  trigger={(open) => (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${subtopic.name}`}
                      onClick={open}
                    >
                      <Trash2 />
                    </Button>
                  )}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await adminCreateSubtopic({ data: { examType, topic, name } });
            setName("");
          });
        }}
      >
        <Field label="New subtopic" className="min-w-0 flex-1">
          {(control) => (
            <Input
              {...control}
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="outline" disabled={name.trim() === ""}>
          Add
        </Button>
      </form>

      {renaming && (
        <RenameDialog
          subtopic={renaming}
          onClose={() => setRenaming(null)}
          onRename={async (next) => {
            if (
              await run(() =>
                adminRenameSubtopic({ data: { subtopicId: renaming.id, name: next } }),
              )
            )
              setRenaming(null);
          }}
        />
      )}
    </Card>
  );
}

function RenameDialog({
  subtopic,
  onClose,
  onRename,
}: {
  subtopic: Subtopic;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(subtopic.name);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            await onRename(name.trim());
            setBusy(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename “{subtopic.name}”</DialogTitle>
          </DialogHeader>
          <Field label="Name">
            {(control) => (
              <Input
                {...control}
                value={name}
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={name.trim() === "" || name.trim() === subtopic.name}
            >
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
