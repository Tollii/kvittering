/** Files changed on this branch, shared by the local and CI change checks. */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export function git(args: string[]): string[] {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Git is the contributor's own installation; the repository cannot pin its path.
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/** The commit this branch started from, or HEAD when no main branch is known. */
export function mergeBase(): string {
  for (const branch of ["origin/main", "main"]) {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- Git is the contributor's own installation; the repository cannot pin its path.
    const result = spawnSync("git", ["merge-base", "HEAD", branch], {
      encoding: "utf8",
    });

    if (result.status === 0) return result.stdout.trim();
  }

  return "HEAD";
}

/** Existing files changed since `base`, including uncommitted and untracked files. */
export function changedFiles(base: string): string[] {
  return [
    ...git(["diff", "--name-only", "--diff-filter=ACMR", base]),
    ...git(["ls-files", "--others", "--exclude-standard"]),
  ].filter(
    (path, index, all) => all.indexOf(path) === index && existsSync(path),
  );
}
