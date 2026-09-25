"use node";

import { Buffer } from "node:buffer";
import { connect } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import { v } from "convex/values";
import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";

function authorization() {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_PRIVATE_KEY)
    return null;

  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: env.APNS_KEY_ID }),
  ).toString("base64url");

  const claims = Buffer.from(
    JSON.stringify({
      iss: env.APNS_TEAM_ID,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url");

  const message = `${header}.${claims}`;

  const signature = sign("sha256", Buffer.from(message), {
    key: createPrivateKey(env.APNS_PRIVATE_KEY.replaceAll("\\n", "\n")),
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");

  return `${message}.${signature}`;
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

    try {
      const jwt = authorization();

      if (!jwt || !activity.token || !activity.environment) {
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
      console.warn("receipt.activity_delivery_failed", {
        attempt: args.attempt,
        error: String(error),
      });
    }

    if (status !== 200)
      console.warn("receipt.activity_delivery_status", {
        status,
        attempt: args.attempt,
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
