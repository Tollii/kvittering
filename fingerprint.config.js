/**
 * The app config plugins copy these Swift sources into the generated iOS
 * project, so a change to them needs a new build, not an OTA update.
 */
module.exports = {
  extraSources: [
    {
      type: "dir",
      filePath: "native/ios",
      reasons: ["Swift sources copied by app config plugins"],
    },
  ],
};
