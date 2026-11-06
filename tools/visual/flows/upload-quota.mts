// Saves more receipts than the per-minute quota admits, so the last captures
// are deferred by the service, and shows how Kamera and Kvitteringer say so.
//
//   npm run visual:start
//   node tools/visual/flows/upload-quota.mts
import { App, receiptPhoto } from "../app.mts";

await App.run("upload-quota", async (app) => {
  await app.signUp();

  const photos = await Promise.all(
    [0, 1, 2, 3, 4].map((index) =>
      receiptPhoto(`build/visual/receipt-${index}.jpg`),
    ),
  );

  for (let batch = 0; batch < 3; batch++) {
    await app.chooseFiles(photos, () => app.tap("Velg fra bilder"));
    await app.tap("Lagre som 5 kvitteringer");
  }

  // Let the admitted captures upload and the rest reach the quota.
  await app.page.waitForTimeout(20_000);
  await app.screenshot("kamera-note");
  // The web SQLite stand-in runs out of shared memory after many uploads; a
  // reload frees it. The deferred captures keep their wait across the reload.
  await app.page.reload();
  await app.tap("Kvitteringer");
  await app.see("Under behandling", 30_000);
  await app.page.waitForTimeout(2_000);
  await app.screenshot("kvitteringer");
  await app.page
    .getByText("Under behandling", { exact: true })
    .scrollIntoViewIfNeeded();
  await app.page.mouse.wheel(0, 400);
  await app.page.waitForTimeout(1_000);
  await app.screenshot("under-behandling");
});
