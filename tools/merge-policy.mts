export type Review = {
  user: { login: string };
  commit_id: string;
  state: string;
  body: string;
};

export type WorkflowResult = {
  head_sha: string;
  conclusion: string | null;
  status: string;
  nativeJob?: string;
};

export type MergeEvidence = {
  head: string;
  draft: boolean;
  quality?: WorkflowResult;
  native?: WorkflowResult;
  nativeRequired: boolean;
  reviews: Review[];
  unresolvedThreads: number;
};

/** A successful bot status is not evidence that a review ran. */
export function mergeObjections(evidence: MergeEvidence): string[] {
  const objections: string[] = [];

  const passed = (run: WorkflowResult | undefined) =>
    run?.head_sha === evidence.head &&
    run.status === "completed" &&
    run.conclusion === "success";

  if (evidence.draft) objections.push("The pull request is a draft.");

  if (!passed(evidence.quality))
    objections.push("Code quality has not passed for the current commit.");

  if (
    evidence.nativeRequired &&
    (!passed(evidence.native) || evidence.native?.nativeJob !== "success")
  ) {
    objections.push(
      "Required iOS flows have not passed for the current commit.",
    );
  }

  const completedReview = evidence.reviews.some(
    (review) =>
      review.user.login === "coderabbitai[bot]" &&
      review.commit_id === evidence.head &&
      ["COMMENTED", "APPROVED"].includes(review.state) &&
      (/^\*\*Actionable comments posted: \d+\*\*/m.test(review.body) ||
        /^\*\*No actionable comments generated\.\*\*/m.test(review.body)),
  );

  if (!completedReview)
    objections.push(
      "CodeRabbit has not completed a substantive review of the current commit. A rate-limited status or a reply to a comment does not count.",
    );

  if (evidence.unresolvedThreads !== 0)
    objections.push("Review threads remain unresolved.");
  const latest = new Map<string, Review>();

  for (const review of evidence.reviews) {
    if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state))
      latest.set(review.user.login, review);
  }

  if (
    [...latest.values()].some((review) => review.state === "CHANGES_REQUESTED")
  )
    objections.push("A reviewer still requests changes.");

  return objections;
}
