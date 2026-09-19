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

export default crons;
