// query-string 7 loads decode-uri-component with require(), but its patched
// releases are ESM-only. Metro and Jest route that require here.
module.exports =
  // eslint-disable-next-line sonarjs/no-internal-api-use -- The bare specifier resolves back to this file.
  require("../../node_modules/decode-uri-component/index.js").default;
