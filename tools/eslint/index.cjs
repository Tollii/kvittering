/** Repository rules shared by ESLint and Oxlint. */
module.exports = {
  meta: { name: "kvitto" },
  rules: {
    "no-leaked-render": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          leakedValue:
            "This value can be 0, NaN, or an empty string, which React Native renders as text outside <Text> and crashes. Compare explicitly, for example `count > 0 &&`.",
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
            "Load server data through a Convex subscription or a TanStack query. Requests started in effects have no cache, deduplication, cancellation, or ordering between responses.",
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
            "Declare the actual properties in a named type. An open dictionary whose only value is undefined does not describe application data.",
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
