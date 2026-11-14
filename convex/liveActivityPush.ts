"use node";

import { connect } from "node:http2";
import { v } from "convex/values";
import { env } from "./_generated/server";
import { internalAction } from "./serverFunctions";
import { internal } from "./_generated/api";
import { appleJwt } from "./appleJwt";
import {
  annotate,
  annotateFailure,
  annotateFailureCode,
} from "../src/lib/tracing";

function authorization() {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_PRIVATE_KEY)
    return null;

  return appleJwt({
    keyId: env.APNS_KEY_ID,
    privateKey: env.APNS_PRIVATE_KEY,
    claims: { iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) },
  });
}

function send(
  token: string,
  jwt: string,
  payload: string,
  environment: "development" | "production",
): Promise<number> {
  return new Promise((resolve, reject) => {
    const connection = connect(
      environment === "development"
        ? "https://api.sandbox.push.apple.com"
        : "https://api.push.apple.com",
    );

    connection.on("error", (error) => {
      connection.close();
      reject(error);
    });

    const request = connection.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": "no.tolnes.kvitto.push-type.liveactivity",
      "apns-push-type": "liveactivity",
      "apns-priority": "5",
      "apns-expiration": "0",
    });

    let status = 0;
    request.setTimeout(10000, () => {
      request.close();
      connection.close();
      reject(new Error("APNs timed out"));
    });
    request.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    request.on("data", () => {});
    request.on("error", (error) => {
      connection.close();
      reject(error);
    });
    request.on("end", () => {
      connection.close();
      resolve(status);
    });
    request.end(payload);
  });
}

export const deliver = internalAction({
  args: {
    id: v.id("receiptActivities"),
    attempt: v.number(),
    expired: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.runQuery(internal.liveActivities.delivery, {
      id: args.id,
    });

    if (!delivery) return null;
    const { activity } = delivery;

    const ended =
      args.expired ||
      delivery.progress.ended ||
      activity.expiresAt <= Date.now();

    const progress = { ...delivery.progress, ended };
    let status = 0;

    annotate({
      "kvitto.activity.attempt": args.attempt,
      "kvitto.activity.ended": ended,
    });

    try {
      const jwt = await authorization();

      if (!jwt || !activity.token || !activity.environment) {
        // Without APNs credentials, the Live Activity only changes while the app is open.
        if (!jwt && activity.token && !args.expired)
          annotateFailureCode("activity.push", "apns_unconfigured", {
            defect: true,
          });

        if (args.expired || activity.expiresAt <= Date.now())
          await ctx.runMutation(internal.liveActivities.remove, {
            id: activity._id,
            updatedAt: activity.updatedAt,
          });

        return null;
      }

      const timestamp = Math.max(
        Math.floor(activity.updatedAt / 1000),
        args.expired ? Math.floor(Date.now() / 1000) : 0,
      );

      const aps = ended
        ? {
            timestamp,
            event: "end",
            "content-state": {
              name: "ReceiptActivity",
              props: JSON.stringify(progress),
            },
            "dismissal-date": Math.floor(Date.now() / 1000) + 300,
          }
        : {
            timestamp,
            event: "update",
            "content-state": {
              name: "ReceiptActivity",
              props: JSON.stringify(progress),
            },
            "stale-date": Math.floor(Date.now() / 1000) + 300,
          };

      status = await send(
        activity.token,
        jwt,
        JSON.stringify({ aps }),
        activity.environment,
      );
    } catch (error) {
      annotateFailure("activity.delivery", error);
    }

    annotate({ "kvitto.activity.status": status });

    // Status 0 is a request that threw, recorded above. A refused key or
    // malformed request is a defect; Apple's throttling and outages are not.
    if (status !== 0 && status !== 200)
      annotateFailureCode("activity.delivery", `http_${status}`, {
        defect: status === 403 || status === 400,
      });

    const retryable = status === 0 || status === 429 || status >= 500;

    if (retryable && args.attempt < 3) {
      await ctx.scheduler.runAfter(
        2000 * 2 ** args.attempt,
        internal.liveActivityPush.deliver,
        { ...args, attempt: args.attempt + 1 },
      );
    } else if (ended || status === 410 || status === 400) {
      await ctx.runMutation(internal.liveActivities.remove, {
        id: activity._id,
        updatedAt: activity.updatedAt,
      });
    }

    return null;
  },
});
