/** Exported async functions and Convex functions are traced where they are defined. */
const path = require("node:path");

const ts = require("typescript");

const generatedServer = /(^|\/)_generated\/server$/;

/** The untraced builders that the generated ones are made from. */
const genericBuilder =
  /^(query|internalQuery|mutation|internalMutation|action|internalAction|httpAction)Generic$/;

module.exports = {
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          tracers: { type: "array", items: { type: "string" } },
          builders: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      untraced:
        'Exported async function `{{name}}` is not traced. Wrap it where it is defined, as `traced("<file>.{{name}}", async (...) => ...)`, so every call records a span with its outcome and request context.',
      spanName:
        "Name the span `{{expected}}`, after its file and export, so a span leads back to its definition.",
      generatedBuilder:
        "Import `{{name}}` from serverFunctions; its builders trace every Convex function where it is defined.",
      genericBuilder:
        "Use the builders from serverFunctions instead of `{{name}}`; they trace every Convex function where it is defined.",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const tracers = new Set(options.tracers ?? ["traced"]);
    const builders = new Set(options.builders ?? []);
    const services = context.sourceCode.parserServices;
    const checker = services?.program?.getTypeChecker();

    const isFunction = (node) =>
      node?.type === "FunctionDeclaration" ||
      node?.type === "FunctionExpression" ||
      node?.type === "ArrowFunctionExpression";

    function promiseAnnotation(node) {
      const annotation = node.returnType?.typeAnnotation;

      return (
        annotation?.type === "TSTypeReference" &&
        annotation.typeName.type === "Identifier" &&
        /^(Promise|PromiseLike)$/.test(annotation.typeName.name)
      );
    }

    const unwrap = (node) =>
      /^TS(AsExpression|SatisfiesExpression|NonNullExpression|TypeAssertion)$/.test(
        node?.type,
      )
        ? unwrap(node.expression)
        : node;

    const tsNode = (node) => services.esTreeNodeToTSNodeMap.get(node);

    /** Every part but null and undefined must be a promise, so that a ReactNode, which may be one, does not count. */
    function isPromise(type) {
      const parts = (type.isUnion() ? type.types : [type]).filter(
        (part) =>
          !(
            part.flags &
            (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)
          ),
      );

      return (
        parts.length > 0 && parts.every((part) => part.getProperty("then"))
      );
    }

    /** With type information, any function that returns a promise counts. */
    function returnsPromise(node) {
      const signature = checker?.getSignatureFromDeclaration(tsNode(node));

      return (
        !!signature && isPromise(checker.getReturnTypeOfSignature(signature))
      );
    }

    /** A value made some other way, such as by a wrapper, counts when every way to call it returns a promise. */
    function callsReturnPromise(node) {
      if (!checker) return false;

      const signatures = checker
        .getTypeAtLocation(tsNode(node))
        .getCallSignatures();

      return (
        signatures.length > 0 &&
        signatures.every((signature) =>
          isPromise(checker.getReturnTypeOfSignature(signature)),
        )
      );
    }

    const isAsync = (node) =>
      isFunction(node) &&
      (node.async || promiseAnnotation(node) || returnsPromise(node));

    const report = (node, name) =>
      context.report({ node, messageId: "untraced", data: { name } });

    /** Exported objects count too: their async methods are exported functions. */
    function checkObject(object, owner) {
      for (const property of object.properties) {
        if (property.type !== "Property" || property.computed) continue;

        const key = property.key.name ?? property.key.value;

        if (isAsync(property.value)) report(property, `${owner}.${key}`);
      }
    }

    function checkValue(value, name) {
      const node = unwrap(value);

      if (!node || isTraced(node)) return;

      if (node.type === "ObjectExpression") checkObject(node, name);
      else if (isFunction(node) ? isAsync(node) : callsReturnPromise(node))
        report(node, name);
    }

    function isTraced(value) {
      const node = unwrap(value);

      return (
        node?.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        tracers.has(node.callee.name)
      );
    }

    const module = path
      .basename(context.filename)
      .replace(/\.(ts|tsx|js|cjs|mjs)$/, "")
      .replace(/\.(web|native|ios|android)$/, "");

    /** A literal span name must be `<file>.<export>`. */
    function checkName(call, binding) {
      const [name] = call.arguments;
      const expected = `${module}.${binding}`;

      if (name?.type === "Literal" && name.value !== expected)
        context.report({
          node: name,
          messageId: "spanName",
          data: { expected },
        });
    }

    const importedName = (specifier) =>
      specifier.imported.name ?? specifier.imported.value;

    const reportBuilder = (node, name) =>
      context.report({ node, messageId: "generatedBuilder", data: { name } });

    function checkExported(value, binding) {
      if (isTraced(value)) checkName(unwrap(value), binding);
      else checkValue(value, binding);
    }

    /** Re-exporting a generated builder hands it on untraced. */
    function checkReexport(node) {
      if (
        node.exportKind === "type" ||
        !builders.size ||
        !generatedServer.test(node.source.value)
      )
        return;

      for (const specifier of node.specifiers) {
        const name = specifier.local.name ?? specifier.local.value;

        if (specifier.exportKind !== "type" && builders.has(name))
          reportBuilder(specifier, name);
      }
    }

    /** Top-level declarations by name, for `export { name }`. */
    const declarations = new Map();

    return {
      "Program > FunctionDeclaration"(node) {
        if (node.id) declarations.set(node.id.name, node);
      },
      "Program > VariableDeclaration > VariableDeclarator"(node) {
        if (node.id.type === "Identifier")
          declarations.set(node.id.name, node.init);
      },
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;

        if (node.source) checkReexport(node);

        if (declaration?.type === "FunctionDeclaration") {
          if (isAsync(declaration)) report(declaration, declaration.id.name);
        } else if (declaration?.type === "VariableDeclaration") {
          for (const declarator of declaration.declarations) {
            if (declarator.id.type === "Identifier")
              checkExported(declarator.init, declarator.id.name);
          }
        }
      },
      ExportDefaultDeclaration(node) {
        const declaration = node.declaration;

        if (declaration.type === "FunctionDeclaration") {
          if (isAsync(declaration))
            report(declaration, declaration.id?.name ?? "default");
        } else if (declaration.type !== "ClassDeclaration")
          checkValue(declaration, "default");
      },
      "Program:exit"() {
        for (const statement of context.sourceCode.ast.body) {
          if (
            statement.type !== "ExportNamedDeclaration" ||
            statement.source ||
            statement.exportKind === "type"
          )
            continue;

          for (const specifier of statement.specifiers) {
            const local = specifier.local.name;
            const value = declarations.get(local);

            if (value) checkExported(value, local);
          }
        }
      },
      ImportDeclaration(node) {
        if (node.importKind === "type" || !builders.size) return;

        const source = node.source.value;

        for (const specifier of node.specifiers) {
          if (specifier.importKind === "type") continue;

          if (generatedServer.test(source)) {
            // A namespace import reaches every builder.
            if (specifier.type === "ImportNamespaceSpecifier")
              reportBuilder(specifier, "*");
            else if (
              specifier.type === "ImportSpecifier" &&
              builders.has(importedName(specifier))
            )
              reportBuilder(specifier, importedName(specifier));
          } else if (
            source === "convex/server" &&
            specifier.type === "ImportSpecifier" &&
            genericBuilder.test(importedName(specifier))
          )
            context.report({
              node: specifier,
              messageId: "genericBuilder",
              data: { name: importedName(specifier) },
            });
        }
      },
      ExportAllDeclaration(node) {
        if (builders.size && generatedServer.test(node.source.value))
          reportBuilder(node, "*");
      },
    };
  },
};
