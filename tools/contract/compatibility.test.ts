import { describe, expect, test } from "vitest";
import {
  compareContracts,
  incompatibilities,
  type Contract,
  type FunctionContract,
  type ValidatorJson,
} from "./compatibility";

const string: ValidatorJson = { type: "string" };

const number: ValidatorJson = { type: "number" };

const literal = (value: string): ValidatorJson => ({ type: "literal", value });

const union = (...value: ValidatorJson[]): ValidatorJson => ({
  type: "union",
  value,
});

function object(
  required: Record<string, ValidatorJson>,
  optional: Record<string, ValidatorJson> = {},
): ValidatorJson {
  const field = (fieldType: ValidatorJson, isOptional: boolean) => ({
    fieldType,
    optional: isOptional,
  });

  return {
    type: "object",
    value: {
      ...Object.fromEntries(
        Object.entries(required).map(([name, type]) => [
          name,
          field(type, false),
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(optional).map(([name, type]) => [
          name,
          field(type, true),
        ]),
      ),
    },
  };
}

function contract(functions: Record<string, FunctionContract>): Contract {
  return { functions, httpRoutes: [] };
}

function query(
  args: ValidatorJson,
  returns: ValidatorJson | null = null,
): FunctionContract {
  return { kind: "query", visibility: "public", args, returns };
}

function internalQuery(returns: ValidatorJson): FunctionContract {
  return { kind: "query", visibility: "internal", args: object({}), returns };
}

describe("argument compatibility", () => {
  test("accepts a new optional argument and a widened union", () => {
    const before = object({ platform: literal("ios") });

    const after = object(
      { platform: union(literal("ios"), literal("android")) },
      { channel: string },
    );

    expect(incompatibilities(after, before, "exact")).toEqual([]);
  });

  test("rejects a new required argument", () => {
    expect(
      incompatibilities(
        object({ id: string, revision: number }),
        object({ id: string }),
        "exact",
        "args",
      ),
    ).toEqual(["args.revision: became required"]);
  });

  test("rejects a removed argument that old clients still send", () => {
    expect(
      incompatibilities(
        object({}),
        object({}, { legacy: string }),
        "exact",
        "args",
      ),
    ).toEqual(["args.legacy: is no longer accepted (removed)"]);
  });

  test("rejects a narrowed literal union", () => {
    expect(
      incompatibilities(
        literal("ios"),
        union(literal("ios"), literal("android")),
        "exact",
        "args.platform",
      ),
    ).toEqual(['args.platform: "android" is no longer accepted']);
  });

  test("accepts a document id where a string was accepted before", () => {
    expect(
      incompatibilities(string, { type: "id", tableName: "receipts" }, "exact"),
    ).toEqual([]);
  });
});

describe("result compatibility", () => {
  test("allows new result fields that installed clients ignore", () => {
    expect(
      incompatibilities(
        object({ total: number }),
        object({ total: number, currency: string }),
        "open",
      ),
    ).toEqual([]);
  });

  test("rejects a result field that installed clients require", () => {
    expect(
      incompatibilities(
        object({ total: number, currency: string }),
        object({ total: number }),
        "open",
        "returns",
      ),
    ).toEqual(["returns.currency: became required"]);
  });

  test("rejects a result field that became optional", () => {
    expect(
      incompatibilities(
        object({ total: number }),
        object({}, { total: number }),
        "open",
        "returns",
      ),
    ).toEqual(["returns.total: became required"]);
  });
});

describe("contract comparison", () => {
  test("reports removed public functions and routes as breaking", () => {
    const base: Contract = {
      functions: { "receipts:list": query(object({})) },
      httpRoutes: ["GET /receipt-image"],
    };

    expect(compareContracts(base, { functions: {}, httpRoutes: [] })).toEqual([
      { subject: "receipts:list", breaking: true, detail: "removed" },
      { subject: "GET /receipt-image", breaking: true, detail: "removed" },
    ]);
  });

  test("reports additions and compatible changes as non-breaking", () => {
    const changes = compareContracts(
      contract({ "receipts:get": query(object({ id: string })) }),
      contract({
        "receipts:get": query(object({ id: string }, { full: string })),
        "receipts:count": query(object({})),
      }),
    );

    expect(changes.every((change) => !change.breaking)).toBe(true);
    expect(
      changes
        .map((change) => change.subject)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["receipts:count", "receipts:get"]);
  });

  test("checks internal arguments that queued work may still carry", () => {
    const internal = (args: ValidatorJson): FunctionContract => ({
      kind: "mutation",
      visibility: "internal",
      args,
      returns: null,
    });

    expect(
      compareContracts(
        contract({ "digest:send": internal(object({ householdId: string })) }),
        contract({
          "digest:send": internal(
            object({ householdId: string, week: number }),
          ),
        }),
      ),
    ).toEqual([
      {
        subject: "digest:send",
        breaking: true,
        detail: "args.week: became required",
      },
    ]);
  });

  test("allows removal of internal fields that old workflow results may retain", () => {
    expect(
      compareContracts(
        contract({ "a:b": internalQuery(object({ x: number })) }),
        contract({ "a:b": internalQuery(object({})) }),
      ).filter((change) => change.breaking),
    ).toEqual([]);
  });

  test("rejects a new internal field missing from stored workflow results", () => {
    expect(
      compareContracts(
        contract({ "a:b": internalQuery(object({ total: number })) }),
        contract({ "a:b": internalQuery(object({ totalOre: number })) }),
      ),
    ).toContainEqual({
      subject: "a:b",
      breaking: true,
      detail: "returns.totalOre: became required",
    });
    expect(
      compareContracts(
        contract({ "a:b": internalQuery(object({ total: number })) }),
        contract({
          "a:b": internalQuery(object({ total: number }, { currency: string })),
        }),
      ).filter((change) => change.breaking),
    ).toEqual([]);
  });

  test("treats a public function made internal as removed from clients", () => {
    expect(
      compareContracts(
        contract({ "a:b": query(object({})) }),
        contract({ "a:b": { ...query(object({})), visibility: "internal" } }),
      ),
    ).toContainEqual({
      subject: "a:b",
      breaking: true,
      detail: "changed from public to internal",
    });
  });
});
