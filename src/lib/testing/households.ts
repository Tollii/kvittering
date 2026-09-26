import type { TestConvex } from "convex-test";
import { api } from "../../../convex/_generated/api";
import type schema from "../../../convex/schema";

type Backend = TestConvex<typeof schema>;

export const invitation = "0123456789abcdef0123456789abcdef";

export function testUser(t: Backend, subject: string) {
  return t.withIdentity({
    subject,
    issuer: "https://test.local",
    name: subject.charAt(0).toUpperCase() + subject.slice(1),
  });
}

/** `first` and `second` share a household; `outsider` has none. */
export async function sharedHousehold(t: Backend) {
  const first = testUser(t, "first");
  const second = testUser(t, "second");
  const outsider = testUser(t, "outsider");

  const householdId = await first.mutation(api.households.create, {
    name: "Test household",
    invitation,
  });

  await second.mutation(api.households.join, { invitation });

  return { first, second, outsider, householdId };
}

/** `first` and `other` each belong to their own household. */
export async function separateHouseholds(t: Backend) {
  const first = testUser(t, "first");
  const other = testUser(t, "other");

  const householdId = await first.mutation(api.households.create, {
    name: "First",
    invitation,
  });

  await other.mutation(api.households.create, {
    name: "Other",
    invitation: "fedcba9876543210fedcba9876543210",
  });

  return { first, other, householdId };
}
