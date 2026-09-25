/** Repository rules shared by ESLint and Oxlint. */
const readsDatabase = require("./reads-database.cjs");

const quoted = /^["'`]/;

module.exports = {
  meta: { name: "kvitto" },
  rules: {
    "no-calendar-string-ops": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          operation:
            "Use the CalendarDate and CalendarMonth operations instead of string methods or interpolation; they parse, clamp, and shift dates correctly.",
        },
      },
      create(context) {
        const services = context.sourceCode.parserServices;

        if (!services?.program) return {};
        const checker = services.program.getTypeChecker();
        const brands = /dateBrand|monthBrand/;

        function isCalendar(node) {
          const type = checker.getTypeAtLocation(
            services.esTreeNodeToTSNodeMap.get(node),
          );

          return (type.isUnion() ? type.types : [type]).some((part) =>
            part
              .getProperties()
              .some((property) => brands.test(property.getName())),
          );
        }

        return {
          MemberExpression(node) {
            if (
              node.property.type === "Identifier" &&
              node.property.name !== "length" &&
              isCalendar(node.object) &&
              node.parent.type === "CallExpression" &&
              node.parent.callee === node
            )
              context.report({ node, messageId: "operation" });
          },
          TemplateLiteral(node) {
            if (node.expressions.some(isCalendar))
              context.report({ node, messageId: "operation" });
          },
        };
      },
    },
    "no-ore-arithmetic": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          operation:
            "Combine amounts with Ore.add, Ore.subtract, Ore.sum, Ore.scale, or Ore.ratio. Arithmetic operators turn an amount into a plain number. See docs/quality.md.",
        },
      },
      create(context) {
        const services = context.sourceCode.parserServices;

        if (!services?.program) return {};
        const checker = services.program.getTypeChecker();

        function isOre(node) {
          const type = checker.getTypeAtLocation(
            services.esTreeNodeToTSNodeMap.get(node),
          );

          return (type.isUnion() ? type.types : [type]).some((part) =>
            part
              .getProperties()
              .some((property) => property.getName().includes("oreBrand")),
          );
        }

        const operators = new Set(["+", "-", "*", "/", "%"]);
        const assignments = new Set(["+=", "-=", "*=", "/=", "%="]);

        return {
          BinaryExpression(node) {
            if (
              operators.has(node.operator) &&
              (isOre(node.left) || isOre(node.right))
            )
              context.report({ node, messageId: "operation" });
          },
          AssignmentExpression(node) {
            if (
              assignments.has(node.operator) &&
              (isOre(node.left) || isOre(node.right))
            )
              context.report({ node, messageId: "operation" });
          },
          UnaryExpression(node) {
            if (node.operator === "-" && isOre(node.argument))
              context.report({ node, messageId: "operation" });
          },
        };
      },
    },
    "no-inline-literal-set": {
      meta: {
        type: "suggestion",
        schema: [],
        messages: {
          nameSet:
            "Name this set of values: a domain predicate such as isReceiptProcessing, or a module-level Set. Inline lists repeat a rule without an owner. See docs/quality.md.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            const callee = node.callee;

            if (
              callee.type !== "MemberExpression" ||
              callee.property.type !== "Identifier" ||
              callee.property.name !== "includes"
            )
              return;
            let list = callee.object;

            while (list.type === "TSAsExpression") list = list.expression;

            if (
              list.type === "ArrayExpression" &&
              list.elements.length > 1 &&
              list.elements.every(
                (element) =>
                  element?.type === "Literal" && quoted.test(element.raw),
              )
            )
              context.report({ node: list, messageId: "nameSet" });
          },
        };
      },
    },
    "no-db-query-filter": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          index:
            "Select documents with an index range instead of `.filter()`. A filter reads every document in the range and can exceed read limits as data grows. See docs/quality.md.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (
              node.callee.type === "MemberExpression" &&
              node.callee.property.type === "Identifier" &&
              node.callee.property.name === "filter" &&
              readsDatabase(node.callee.object)
            )
              context.report({
                node: node.callee.property,
                messageId: "index",
              });
          },
        };
      },
    },
    "no-unbounded-collect": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          bound:
            "Bound this read with `.take(n)`, `.first()`, `.unique()`, or pagination. `.collect()` grows with the household's data. See docs/quality.md.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (
              node.callee.type === "MemberExpression" &&
              node.callee.property.type === "Identifier" &&
              node.callee.property.name === "collect" &&
              readsDatabase(node.callee.object)
            )
              context.report({
                node: node.callee.property,
                messageId: "bound",
              });
          },
        };
      },
    },
    "no-silent-catch": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          silent:
            "This catch discards the error. Bind it and rethrow, log, or hand it to a named handler, or state how the failure is handled in a `// Handled:` comment at the start of the block.",
        },
      },
      create(context) {
        const { sourceCode } = context;

        return {
          CatchClause(node) {
            const used = sourceCode
              .getDeclaredVariables(node)
              .some((variable) => variable.references.length > 0);

            const explained = sourceCode
              .getCommentsInside(node.body)
              .some(
                (comment) =>
                  comment.range[0] <
                    (node.body.body[0]?.range[0] ?? Infinity) &&
                  comment.value.trim().startsWith("Handled:"),
              );

            if (!used && !explained)
              context.report({ node, messageId: "silent" });
          },
        };
      },
    },
    "structured-log": {
      meta: {
        type: "suggestion",
        schema: [],
        messages: {
          event:
            "Start a backend log with a literal event name such as `receipt.processing_failed`, and put details in a fields object, so log search can find it.",
        },
      },
      create(context) {
        const methods = new Set(["debug", "log", "info", "warn", "error"]);

        const eventName = /^[a-z]+(\.[a-z_]+)+$/;

        return {
          CallExpression(node) {
            const { callee } = node;

            if (
              callee.type !== "MemberExpression" ||
              callee.object.type !== "Identifier" ||
              callee.object.name !== "console" ||
              callee.property.type !== "Identifier" ||
              !methods.has(callee.property.name)
            )
              return;

            const [first] = node.arguments;

            if (
              first?.type !== "Literal" ||
              !eventName.test(String(first.value))
            )
              context.report({ node: first ?? node, messageId: "event" });
          },
        };
      },
    },
    "convex-function-access": {
      meta: {
        type: "problem",
        schema: [
          {
            type: "object",
            properties: {
              builders: { type: "array", items: { type: "string" } },
              checks: { type: "array", items: { type: "string" } },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          access:
            "Public Convex function `{{name}}` does not call an access check ({{checks}}). Call one in the handler, or state why the function is public in a preceding `// Access:` comment. See docs/quality.md.",
        },
      },
      create(context) {
        const options = context.options[0] ?? {};

        const builders = new Set(
          options.builders ?? ["query", "mutation", "action"],
        );

        const checks = new Set(options.checks ?? []);

        function calleeName(callee) {
          if (callee.type === "Identifier") return callee.name;

          return callee.type === "MemberExpression" &&
            callee.property.type === "Identifier"
            ? callee.property.name
            : null;
        }

        /** Each exported builder call collects the access checks made inside it. */
        const exports = [];

        function publicFunction(node) {
          const declarator = node.declaration?.declarations?.[0];
          const init = declarator?.init;

          return init?.type === "CallExpression" &&
            init.callee.type === "Identifier" &&
            builders.has(init.callee.name)
            ? declarator
            : null;
        }

        return {
          ExportNamedDeclaration(node) {
            const declarator = publicFunction(node);

            if (declarator) exports.push({ declarator, checked: false });
          },
          CallExpression(node) {
            if (exports.length && checks.has(calleeName(node.callee)))
              exports.at(-1).checked = true;
          },
          "ExportNamedDeclaration:exit"(node) {
            if (!publicFunction(node)) return;
            const { declarator, checked } = exports.pop();

            const documented = context.sourceCode
              .getCommentsBefore(node)
              .some((comment) => comment.value.trim().startsWith("Access:"));

            if (!checked && !documented)
              context.report({
                node: declarator.id,
                messageId: "access",
                data: {
                  name: declarator.id.name,
                  checks: [...checks].join(", "),
                },
              });
          },
        };
      },
    },
    "no-leaked-render": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          leakedValue:
            "This value can be 0, NaN, or an empty string, which React Native renders as text outside <Text> and crashes. Compare explicitly, for example `count > 0 &&`. See docs/quality.md.",
        },
      },
      create(context) {
        const services = context.sourceCode.parserServices;

        // The rule needs TypeScript types; Oxlint and untyped files skip it.
        if (!services?.program) return {};
        const ts = require("typescript");
        const checker = services.program.getTypeChecker();

        function canRenderAsText(type) {
          return (type.isUnion() ? type.types : [type]).some((part) => {
            const flags = part.getFlags();

            if (part.isStringLiteral()) return part.value === "";

            if (part.isNumberLiteral()) return part.value === 0;

            return (
              (flags &
                (ts.TypeFlags.String |
                  ts.TypeFlags.Number |
                  ts.TypeFlags.BigInt |
                  ts.TypeFlags.BigIntLiteral |
                  ts.TypeFlags.Any |
                  ts.TypeFlags.Unknown)) !==
              0
            );
          });
        }

        function operands(node) {
          return node.type === "LogicalExpression" && node.operator === "&&"
            ? [...operands(node.left), ...operands(node.right)]
            : [node];
        }

        return {
          JSXExpressionContainer(container) {
            const expression = container.expression;

            if (
              expression.type !== "LogicalExpression" ||
              expression.operator !== "&&" ||
              (container.parent.type !== "JSXElement" &&
                container.parent.type !== "JSXFragment")
            )
              return;

            for (const operand of operands(expression).slice(0, -1)) {
              const type = checker.getTypeAtLocation(
                services.esTreeNodeToTSNodeMap.get(operand),
              );

              if (canRenderAsText(type))
                context.report({ node: operand, messageId: "leakedValue" });
            }
          },
        };
      },
    },
    "no-effect-fetch": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          subscription:
            "Load server data through a Convex subscription or a TanStack query. Requests started in effects have no cache, deduplication, cancellation, or ordering between responses. See docs/quality.md.",
        },
      },
      create(context) {
        const effectHooks = new Set([
          "useEffect",
          "useLayoutEffect",
          "useInsertionEffect",
        ]);

        /** Whether a function node is the callback passed to a React effect hook. */
        function isEffectCallback(node) {
          const call = node.parent;

          if (call?.type !== "CallExpression" || call.arguments[0] !== node)
            return false;
          const callee = call.callee;

          const name =
            callee.type === "Identifier"
              ? callee.name
              : callee.type === "MemberExpression" &&
                  callee.property.type === "Identifier"
                ? callee.property.name
                : null;

          return effectHooks.has(name);
        }

        function insideEffect(node) {
          for (let current = node.parent; current; current = current.parent) {
            if (
              (current.type === "ArrowFunctionExpression" ||
                current.type === "FunctionExpression") &&
              isEffectCallback(current)
            )
              return true;
          }

          return false;
        }

        return {
          CallExpression(node) {
            if (
              node.callee.type === "Identifier" &&
              node.callee.name === "fetch" &&
              insideEffect(node)
            )
              context.report({ node, messageId: "subscription" });
          },
          NewExpression(node) {
            if (
              node.callee.type === "Identifier" &&
              node.callee.name === "XMLHttpRequest" &&
              insideEffect(node)
            )
              context.report({ node, messageId: "subscription" });
          },
        };
      },
    },
    "no-undefined-record": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          explicitType:
            "Declare the actual properties in a named type. An open dictionary whose only value is undefined does not describe application data. See docs/quality.md.",
        },
      },
      create(context) {
        function unwrap(type) {
          while (type?.type === "TSParenthesizedType")
            type = type.typeAnnotation;

          return type;
        }

        return {
          TSTypeReference(node) {
            if (
              node.typeName.type !== "Identifier" ||
              node.typeName.name !== "Record"
            )
              return;
            // A locally declared Record is not the TypeScript utility type.
            let scope = context.sourceCode.getScope(node);

            while (scope) {
              if (scope.set.get("Record")?.defs.length) return;
              scope = scope.upper;
            }

            const parameters = (node.typeArguments ?? node.typeParameters)
              ?.params;

            if (
              parameters?.length === 2 &&
              unwrap(parameters[0]).type === "TSStringKeyword" &&
              unwrap(parameters[1]).type === "TSUndefinedKeyword"
            ) {
              context.report({ node, messageId: "explicitType" });
            }
          },
          TSIndexSignature(node) {
            const key = node.parameters[0]?.typeAnnotation?.typeAnnotation;
            const value = node.typeAnnotation?.typeAnnotation;

            if (
              unwrap(key)?.type === "TSStringKeyword" &&
              unwrap(value)?.type === "TSUndefinedKeyword"
            ) {
              context.report({ node, messageId: "explicitType" });
            }
          },
        };
      },
    },
  },
};
