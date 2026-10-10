// Worked example for the visual-check skill with seeded data: the fixture
// member from tools/visual/start.sh signs in and opens Kvitteringer.
//
//   npm run visual:start
//   node tools/visual/flows/receipts.mts
import { App } from "../app.mts";

await App.run("receipts", async (app) => {
  await app.signIn();
  await app.tap("Kvitteringer");
  await app.screenshot("receipts");
});
