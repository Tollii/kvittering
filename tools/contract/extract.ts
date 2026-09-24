import { z } from "zod";
import {
  parseValidatorJson,
  type Contract,
  type FunctionContract,
} from "./compatibility";

/** Convex declares these exports as functions returning validator JSON. */
const exportedJson = z.custom<() => string>(
  (value) => value instanceof Function,
);

/** The parts of a registered Convex function that define its contract. */
const registeredFunction = z.looseObject({
  isQuery: z.literal(true).optional(),
  isMutation: z.literal(true).optional(),
  isAction: z.literal(true).optional(),
  isPublic: z.literal(true).optional(),
  exportArgs: exportedJson,
  exportReturns: exportedJson,
});

/** Module namespaces by path, parsed so each export can be inspected. */
export const moduleNamespaces = z.record(
  z.string(),
  z.record(z.string(), z.unknown()),
);

type ModuleNamespaces = z.infer<typeof moduleNamespaces>;

const httpRouter = z.looseObject({
  getRoutes: z.custom<() => object>((value) => value instanceof Function),
});

const routes = z.array(z.tuple([z.string(), z.string()]).rest(z.unknown()));

/**
 * Build the contract from loaded Convex modules, keyed by module path relative
 * to `convex/` without the extension, as Convex names functions.
 */
export function extractContract(modules: ModuleNamespaces): Contract {
  const functions: Record<string, FunctionContract> = {};
  let httpRoutes: string[] = [];

  for (const [modulePath, exports] of byKey(modules)) {
    for (const [name, value] of byKey(exports)) {
      if (modulePath === "http" && name === "default") {
        const router = httpRouter.parse(value);

        httpRoutes = routes
          .parse(router.getRoutes())
          .map(([path, method]) => `${method} ${path}`)
          .sort((a, b) => a.localeCompare(b));
        continue;
      }

      // Registered functions are callables carrying their contract as properties.
      if (!(value instanceof Function)) continue;

      const registered = registeredFunction.safeParse({ ...value });

      if (!registered.success) continue;

      const fn = registered.data;

      functions[`${modulePath}:${name}`] = {
        kind: fn.isQuery ? "query" : fn.isMutation ? "mutation" : "action",
        visibility: fn.isPublic ? "public" : "internal",
        args: parseValidatorJson(fn.exportArgs()),
        returns: parseValidatorJson(fn.exportReturns()),
      };
    }
  }

  return { functions, httpRoutes };
}

function byKey<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
}

/** One function per line keeps review diffs to the functions that changed. */
export function formatContract(contract: Contract): string {
  const functions = byKey(contract.functions).map(
    ([name, fn]) => `    ${JSON.stringify(name)}: ${JSON.stringify(fn)}`,
  );

  const routes = contract.httpRoutes.map(
    (route) => `    ${JSON.stringify(route)}`,
  );

  return `{\n  "functions": {\n${functions.join(",\n")}\n  },\n  "httpRoutes": [\n${routes.join(",\n")}\n  ]\n}\n`;
}
