import { expect, it } from "@jest/globals";
import { saveNote } from "./save-note";
import type { LocalReceipt } from "@/lib/upload-queue";
import type { UploadFailure } from "@/lib/upload-failure";
import type { Id } from "../../convex/_generated/dataModel";

const uploading: LocalReceipt = {
  schemaVersion: 1,
  id: "capture",
  owner: "user",
  // SAFETY: The note reads no identifiers.
  householdId: "household" as Id<"households">,
  createdAt: 0,
  images: ["one.jpg"],
  uploaded: [false],
};

const capture = (failure: UploadFailure): LocalReceipt => ({
  ...uploading,
  failure,
});

const photos = { kind: "photos", count: 1 } as const;

it("says a deferred upload waits instead of failing, and keeps the note", () => {
  const deferred = capture({ kind: "deferred", message: "Vent ett minutt." });

  expect(saveNote(photos, [deferred], true)).toEqual({
    phase: { kind: "deferred", message: "Vent ett minutt." },
    title: "Lastes opp senere",
  });
  expect(
    saveNote(photos, [deferred, capture({ kind: "failed" })], true)?.title,
  ).toBe("Prøver igjen");
  expect(
    saveNote(photos, [capture({ kind: "rejected", message: "Nei." })], true)
      ?.title,
  ).toBe("Kunne ikke laste opp");
  expect(saveNote(photos, [], true)).toEqual({
    phase: null,
    title: "Lastet opp",
  });
});
