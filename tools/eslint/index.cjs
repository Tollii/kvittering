/** Repository rules shared by ESLint and Oxlint. */
module.exports = {
  meta: { name: "kvitto" },
  rules: {
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
