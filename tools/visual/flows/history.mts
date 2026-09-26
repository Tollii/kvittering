// Worked example for the visual-check skill with seeded data: the fixture
// member from tools/visual/start.sh signs in and opens a reviewed receipt.
//
//   npm run visual:start
//   node tools/visual/flows/history.mts
import { App } from "../app.mts";

await App.run("history", async (app) => {
  await app.signIn();
  await app.tap("Historikk");
  await app.screenshot("history");
});
