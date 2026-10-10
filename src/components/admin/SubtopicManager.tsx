import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  adminCreateSubtopic,
  adminDeleteSubtopic,
  adminListSubtopics,
  adminRenameSubtopic,
} from "@/functions/questions.functions";
import { useServerData } from "@/hooks/use-server-data";

interface Props {
  examType: "RN" | "RM";
  topic: string;
  /** Called after any change, so the question list can reload its subtopic choices. */
  onChanged: () => void;
}

/** Create, rename and delete the subtopics of one topic. Deleting leaves the questions in place. */
export function SubtopicManager({ examType, topic, onChanged }: Props) {
  const [name, setName] = useState("");
  const list = useServerData(
    () => adminListSubtopics({ data: { examType, topic } }),
    [examType, topic],
  );

  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await list.reload();
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold text-sm">Subtopics of {topic}</h3>
      <div className="flex flex-wrap gap-2">
        {list.data?.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {list.data?.map((subtopic) => (
          <Badge key={subtopic.id} variant="secondary" className="gap-2 py-1">
            {subtopic.name}
            <button
              type="button"
              className="underline text-xs"
              onClick={() => {
                const next = prompt("Rename subtopic", subtopic.name);
                if (next !== null && next.trim() !== "") {
                  void run(() =>
                    adminRenameSubtopic({ data: { subtopicId: subtopic.id, name: next } }),
                  );
                }
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="underline text-xs"
              onClick={() => {
                if (confirm(`Delete "${subtopic.name}"? Its questions stay, without a subtopic.`)) {
                  void run(() => adminDeleteSubtopic({ data: { subtopicId: subtopic.id } }));
                }
              }}
            >
              Delete
            </button>
          </Badge>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await adminCreateSubtopic({ data: { examType, topic, name } });
            setName("");
          });
        }}
      >
        <Input
          value={name}
          maxLength={120}
          placeholder="New subtopic name"
          aria-label="New subtopic name"
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={name.trim() === ""}>
          Add
        </Button>
      </form>
    </Card>
  );
}
