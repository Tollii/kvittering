import { describe, expect, it } from "vitest";
import { mergeObjections, type MergeEvidence } from "./merge-policy.mjs";

const head = "a".repeat(40);

const success = { head_sha: head, status: "completed", conclusion: "success" };

const ready = (): MergeEvidence => ({
  head,
  draft: false,
  quality: success,
  native: { ...success, nativeJob: "success" },
  nativeRequired: true,
  reviews: [
    {
      user: { login: "coderabbitai[bot]" },
      commit_id: head,
      state: "COMMENTED",
      body: "**Actionable comments posted: 0**",
    },
  ],
  unresolvedThreads: 0,
});

describe("merge evidence", () => {
  it("accepts successful checks and a completed review of the current commit", () => {
    expect(mergeObjections(ready())).toEqual([]);
  });
  it.each([
    undefined,
    { ...success, status: "in_progress" },
    { ...success, head_sha: "old" },
    { ...success, conclusion: "failure" },
  ])(
    "rejects missing, pending, old or failed quality evidence: %j",
    (quality) => {
      expect(mergeObjections({ ...ready(), quality }).join()).toContain(
        "Code quality",
      );
    },
  );
  it.each([
    undefined,
    { ...success, nativeJob: "skipped" },
    { ...success, nativeJob: "failure" },
    { ...success, head_sha: "old", nativeJob: "success" },
  ])("rejects inadequate required native evidence: %j", (native) => {
    expect(mergeObjections({ ...ready(), native }).join()).toContain(
      "iOS flows",
    );
  });
  it("does not require native tests for unrelated documentation", () => {
    expect(
      mergeObjections({ ...ready(), native: undefined, nativeRequired: false }),
    ).toEqual([]);
  });
  it.each(["Review rate limited", "", "Review in progress", "Thanks, fixed."])(
    "does not treat %j as a completed review",
    (body) => {
      const evidence = ready();
      evidence.reviews[0]!.body = body;
      expect(mergeObjections(evidence).join()).toContain("CodeRabbit");
    },
  );
  it("rejects old reviews and another user's copied bot summary", () => {
    const evidence = ready();
    evidence.reviews[0]!.commit_id = "old";
    expect(mergeObjections(evidence).join()).toContain("CodeRabbit");
    evidence.reviews[0]!.commit_id = head;
    evidence.reviews[0]!.user.login = "contributor";
    expect(mergeObjections(evidence).join()).toContain("CodeRabbit");
  });
  it("requires resolved discussions and respects requests for changes", () => {
    expect(
      mergeObjections({ ...ready(), unresolvedThreads: 1 }).join(),
    ).toContain("unresolved");
    const evidence = ready();
    evidence.reviews.push({
      user: { login: "reviewer" },
      commit_id: head,
      state: "CHANGES_REQUESTED",
      body: "Fix data loss",
    });
    expect(mergeObjections(evidence).join()).toContain("requests changes");
  });
});
