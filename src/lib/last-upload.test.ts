import { describe, expect, it } from "vitest";
import { LAST_UPLOAD_KEY, readLastUpload, saveLastUpload, type LastUpload } from "./last-upload";

const UPLOAD: LastUpload = {
  fileName: "maternal.txt",
  examType: "RM",
  topic: "Maternal health",
  imported: 40,
  at: "2026-10-12T09:00:00.000Z",
};

const memory = (initial?: string) => {
  const store = new Map<string, string>(initial === undefined ? [] : [[LAST_UPLOAD_KEY, initial]]);
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
};

describe("last upload note", () => {
  it("reads back what was saved", () => {
    const storage = memory();
    saveLastUpload(storage, UPLOAD);
    expect(readLastUpload(storage)).toEqual(UPLOAD);
  });

  it("is null when nothing is stored", () => {
    expect(readLastUpload(memory())).toBeNull();
  });

  it("is null for text that is not JSON or not an upload record", () => {
    expect(readLastUpload(memory("{oops"))).toBeNull();
    expect(readLastUpload(memory('{"fileName":"a.txt"}'))).toBeNull();
    expect(readLastUpload(memory(JSON.stringify({ ...UPLOAD, examType: "XX" })))).toBeNull();
    expect(readLastUpload(memory("null"))).toBeNull();
  });

  it("copes with storage that throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(readLastUpload(blocked)).toBeNull();
    expect(() => saveLastUpload(blocked, UPLOAD)).not.toThrow();
  });
});
