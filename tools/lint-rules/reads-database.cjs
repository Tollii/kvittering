const databaseRoots = new Set(["db", "system"]);

/** Whether a query chain starts at `ctx.db.query(...)` or `ctx.db.system.query(...)`. */
module.exports = function readsDatabase(node) {
  for (let current = node; current;) {
    if (current.type === "CallExpression") {
      const callee = current.callee;

      if (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "query" &&
        callee.object.type === "MemberExpression" &&
        callee.object.property.type === "Identifier" &&
        databaseRoots.has(callee.object.property.name)
      )
        return true;
      current = callee.type === "MemberExpression" ? callee.object : null;
    } else
      current = current.type === "MemberExpression" ? current.object : null;
  }

  return false;
};
