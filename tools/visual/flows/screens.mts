// Screenshots of the main screens in light and dark mode, named like the iOS
// references in docs/design-system/patterns.md, for comparing the web build
// with the app. Uses the reviewed-receipts fixture.
//
//   npm run visual:start
//   node tools/visual/flows/screens.mts
import { App } from "../app.mts";

for (const colorScheme of ["light", "dark"] as const)
  await App.run(
    `screens-${colorScheme}`,
    async (app) => {
      await app.signIn();
      await app.tap("Innboks");
      await app.screenshot("innboks");
      await app.tap("Forbruk");
      await app.screenshot("forbruk");
      await app.tap("Historikk");
      await app.screenshot("historikk");
      await app.tap("Husstanden og innstillinger");
      await app.see("Ferdig");
      await app.screenshot("innstillinger");
      await app.tap("Ferdig");
      await app.tap("REMA 1000");
      await app.see("Kjøpsoversikt");
      await app.screenshot("kvittering");
    },
    { colorScheme, video: false },
  );
