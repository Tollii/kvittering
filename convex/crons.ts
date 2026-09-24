import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sunday evening in Norway (UTC+1/+2).
crons.weekly(
  "weekly spending digest",
  { dayOfWeek: "sunday", hourUTC: 16, minuteUTC: 0 },
  internal.digest.sendAll,
  {},
);

crons.interval(
  "remove expired catalog results",
  { hours: 24 },
  internal.retention.catalog,
  { state: "ready" },
);

crons.interval(
  "remove expired catalog errors",
  { hours: 24 },
  internal.retention.catalog,
  { state: "error" },
);

export default crons;
