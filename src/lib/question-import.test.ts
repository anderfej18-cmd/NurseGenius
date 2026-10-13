import { describe, expect, it } from "vitest";
import {
  describeProblems,
  IMPORT_BATCH_SIZE,
  inspectQuestionText,
  importInBatches,
  parseQuestionText,
  PartialImportError,
} from "./question-import";

const ONE = `Q: What is the normal adult resting heart rate?
A) 40-60 bpm
B) 60-100 bpm
C) 100-140 bpm
D) 140-180 bpm
Answer: B
Explanation: The normal adult resting heart rate ranges from 60 to 100 bpm.`;

describe("parseQuestionText", () => {
  it("reads a question with its four options, answer and explanation", () => {
    expect(parseQuestionText(ONE)).toEqual([
      {
        question_text: "What is the normal adult resting heart rate?",
        option_a: "40-60 bpm",
        option_b: "60-100 bpm",
        option_c: "100-140 bpm",
        option_d: "140-180 bpm",
        correct_answer: "B",
        rationale: "The normal adult resting heart rate ranges from 60 to 100 bpm.",
      },
    ]);
  });

  it("splits blocks on a blank line or a line of dashes, and accepts CRLF line ends", () => {
    const text = [ONE, "---", ONE.replace("heart rate?", "pulse?"), "", ONE].join("\r\n");
    const parsed = parseQuestionText(text);
    expect(parsed).toHaveLength(3);
    expect(parsed[1].question_text).toBe("What is the normal adult resting pulse?");
  });

  it("joins an explanation that runs over several lines and leaves a missing one null", () => {
    const text = `${ONE}\nIt is lower in athletes.\n\nQ: Second?\nA. a\nB. b\nC. c\nD. d\nAns: c`;
    const [first, second] = parseQuestionText(text);
    expect(first.rationale).toMatch(/60 to 100 bpm\. It is lower in athletes\.$/);
    expect(second).toMatchObject({ correct_answer: "C", rationale: null });
  });

  it("takes an unlabelled first line as the question", () => {
    const [only] = parseQuestionText(
      "Which organ pumps blood?\nA) Lung\nB) Heart\nC) Liver\nD) Skin\nAnswer: B",
    );
    expect(only.question_text).toBe("Which organ pumps blood?");
  });

  it("skips blocks that lack text, an option or a valid answer, and returns nothing for blank input", () => {
    expect(parseQuestionText(ONE.replace("D) 140-180 bpm\n", ""))).toEqual([]);
    expect(parseQuestionText(ONE.replace("Answer: B", "Answer: E"))).toEqual([]);
    expect(parseQuestionText(ONE.replace("Answer: B\n", ""))).toEqual([]);
    expect(parseQuestionText("  \n\n ")).toEqual([]);
  });
});

describe("importInBatches", () => {
  const questions = (count: number) => Array.from({ length: count }, (_, index) => index);

  it("sends the questions in batches of the size the server accepts and counts them", async () => {
    const sizes: number[] = [];
    const imported = await importInBatches(questions(IMPORT_BATCH_SIZE * 2 + 3), async (batch) => {
      sizes.push(batch.length);
    });
    expect(sizes).toEqual([IMPORT_BATCH_SIZE, IMPORT_BATCH_SIZE, 3]);
    expect(imported).toBe(IMPORT_BATCH_SIZE * 2 + 3);
  });

  it("sends nothing for an empty list", async () => {
    let calls = 0;
    expect(await importInBatches([], async () => void calls++)).toBe(0);
    expect(calls).toBe(0);
  });

  it("stops at the first failing batch and says how many were already saved", async () => {
    let call = 0;
    const attempt = importInBatches(questions(IMPORT_BATCH_SIZE * 3), async () => {
      if (++call === 2) throw new Error("The server said no.");
    });
    await expect(attempt).rejects.toMatchObject({
      name: "PartialImportError",
      message: "The server said no.",
      imported: IMPORT_BATCH_SIZE,
    });
    expect(call).toBe(2);
    await expect(attempt).rejects.toBeInstanceOf(PartialImportError);
  });
});

describe("inspectQuestionText and describeProblems", () => {
  const BAD = "Q: Missing things?\nA) a\nB) b";

  it("returns the good questions and says, for each skipped block, what it lacked", () => {
    const { questions, problems } = inspectQuestionText(
      `${ONE}\n\n${BAD}\n---\nJust a stray heading line`,
    );
    expect(questions).toHaveLength(1);
    expect(problems).toEqual([
      {
        block: 2,
        missing: ["option C", "option D", "the answer line (Answer: A to D)"],
        preview: BAD.slice(0, 60),
      },
      {
        block: 3,
        missing: [
          "option A",
          "option B",
          "option C",
          "option D",
          "the answer line (Answer: A to D)",
        ],
        preview: "Just a stray heading line",
      },
    ]);
  });

  it("reports nothing for a clean file and for a blank one", () => {
    expect(inspectQuestionText(ONE).problems).toEqual([]);
    expect(inspectQuestionText("  \n ")).toEqual({ questions: [], problems: [] });
  });

  it("summarises the first few problems in one sentence", () => {
    const { problems } = inspectQuestionText([BAD, BAD, BAD, BAD, BAD].join("\n\n"));
    expect(describeProblems(problems)).toBe(
      "5 blocks were skipped: block 1 lacks option C, option D, the answer line (Answer: A to D); block 2 lacks option C, option D, the answer line (Answer: A to D); block 3 lacks option C, option D, the answer line (Answer: A to D); and 2 more.",
    );
    expect(describeProblems(problems.slice(0, 1))).toMatch(/^1 block was skipped: block 1 lacks/);
    expect(describeProblems([])).toBe("");
  });
});
