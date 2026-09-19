/** Repository rules shared by ESLint and Oxlint. */
module.exports = {
  meta: { name: "kvitto" },
  rules: {
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
