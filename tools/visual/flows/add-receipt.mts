// Worked example for the visual-check skill: a new member signs up, adds a
// receipt photo from the library, and opens the processed receipt from the
// inbox. The local backend's mock provider supplies the receipt contents.
//
//   npm run visual:start
//   node tools/visual/flows/add-receipt.mts
import { App, receiptPhoto } from "../app.mts";

await App.run("add-receipt", async (app) => {
  await app.signUp();
  await app.screenshot("capture");

  const photo = await receiptPhoto("build/visual/receipt.jpg");
  await app.chooseFiles([photo], () => app.tap("Velg fra bilder"));
  await app.see("Lagre kvittering");
  await app.screenshot("selected-photo");
  await app.tap("Lagre kvittering");

  await app.tap("Innboks");
  await app.see("Eksempelbutikk", 60_000);
  await app.screenshot("inbox");
  await app.tap("Eksempelbutikk");
  await app.see("Godkjenn kvittering");
  await app.screenshot("receipt");
});
