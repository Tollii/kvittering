// A small Playwright API for driving the web build started by
// tools/visual/start.sh. Flows import it; see tools/visual/flows/.
//
// The web build approximates the iOS app: layout, text, and JavaScript flows
// are real, but native modules (camera, Keychain, widgets, share sheet) are
// not exercised.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  chromium,
  devices,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const iPhone = devices["iPhone 15"];

export type AppOptions = {
  /** Record a video of the session (default true). */
  video?: boolean;
  /** Output directory (default build/visual/media/<name>). */
  output?: string;
  url?: string;
  colorScheme?: "light" | "dark";
};

export type Account = { name: string; email: string; password: string };

export class App {
  readonly page: Page;
  readonly output: string;
  private readonly browser: Browser;
  private readonly context: BrowserContext;
  private shots = 0;

  private constructor(
    page: Page,
    output: string,
    browser: Browser,
    context: BrowserContext,
  ) {
    this.page = page;
    this.output = output;
    this.browser = browser;
    this.context = context;
  }

  /** Open the app in an iPhone-sized Chromium page. */
  static async open(name: string, options: AppOptions = {}) {
    const url = options.url ?? "http://127.0.0.1:8081";
    const output = resolve(options.output ?? join("build/visual/media", name));
    const recording = options.video ?? true;

    try {
      await fetch(url);
    } catch {
      throw new Error(`No app at ${url}. Run npm run visual:start first.`);
    }

    rmSync(output, { recursive: true, force: true });
    mkdirSync(output, { recursive: true });
    const browser = await chromium.launch();

    const context = await browser.newContext({
      viewport: iPhone.viewport,
      deviceScaleFactor: iPhone.deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
      userAgent: iPhone.userAgent,
      locale: "nb-NO",
      timezoneId: "Europe/Oslo",
      colorScheme: options.colorScheme ?? "light",
      ...(recording && {
        recordVideo: {
          dir: join(output, "raw"),
          size: {
            width: iPhone.viewport.width * 2,
            height: iPhone.viewport.height * 2,
          },
        },
      }),
    });

    const page = await context.newPage();

    // Errors in the browser often explain a failed step.
    page.on("pageerror", (error) => console.error(`page error: ${error}`));
    page.on("console", (message) => {
      if (message.type() === "error")
        console.error(`console error: ${message.text()}`);
    });
    await page.goto(url);

    return new App(page, output, browser, context);
  }

  /** Press the element with this test ID, label, or exact text. */
  async tap(target: string) {
    await this.find(target).click();
  }

  /** Replace the text in the input with this test ID. */
  async type(testId: string, text: string) {
    await this.page.getByTestId(testId).fill(text);
  }

  /** Wait until the element with this test ID, label, or text is visible. */
  async see(target: string, timeout = 30_000) {
    await this.find(target).waitFor({ state: "visible", timeout });
  }

  /** Choose files in the next file dialog that `action` opens. */
  async chooseFiles(files: string[], action: () => Promise<void>) {
    const chooser = this.page.waitForEvent("filechooser");
    await action();
    await (await chooser).setFiles(files);
  }

  /** Save a numbered screenshot of the viewport and return its path. */
  async screenshot(label: string) {
    this.shots += 1;

    const path = join(
      this.output,
      `${String(this.shots).padStart(2, "0")}-${label}.png`,
    );

    // Let transitions and images settle before capturing.
    await this.page.waitForTimeout(500);
    await this.page.screenshot({ path });

    return path;
  }

  /** Create an email account and a household, ending on the main tabs. */
  async signUp(account = testAccount()) {
    await this.see("Ny her? Opprett konto", 60_000);
    await this.tap("Ny her? Opprett konto");
    await this.type("sign-in-name", account.name);
    await this.type("sign-in-email", account.email);
    await this.type("sign-in-password", account.password);
    await this.tap("sign-in-submit");
    await this.see("Start med mine kvitteringer");
    await this.tap("Start med mine kvitteringer");
    await this.see("Innboks");

    return account;
  }

  /** Close the browser and return the compressed video path, if recorded. */
  async close() {
    const video = this.page.video();
    await this.context.close();
    await this.browser.close();

    if (!video) return undefined;
    const path = join(this.output, "flow.mp4");
    compressVideo(await video.path(), path);
    rmSync(join(this.output, "raw"), { recursive: true, force: true });

    return path;
  }

  private find(target: string) {
    return this.page
      .getByTestId(target)
      .or(this.page.getByLabel(target, { exact: true }))
      .or(this.page.getByText(target, { exact: true }))
      .first();
  }
}

/**
 * Render a synthetic receipt photo. The local backend's mock provider does not
 * read images, so any picture works; this one looks like a receipt on screen.
 */
export async function receiptPhoto(path: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } });

  const lines = [
    ["Lettmelk 1 l", "21,90"],
    ["Grovbrød", "34,50"],
    ["Bananer 0,82 kg", "22,06"],
    ["AA-batterier 4 pk", "89,00"],
  ];

  await page.setContent(`
    <body style="margin:0;background:#8a8f98;display:grid;place-items:center;height:100vh">
      <div style="width:380px;background:#fbfaf5;padding:28px;font:18px monospace;box-shadow:0 8px 30px #0006;transform:rotate(-2deg)">
        <h2 style="text-align:center;margin:0 0 12px">BUTIKKEN</h2>
        <p style="text-align:center;margin:0 0 20px">Storgata 1, Oslo</p>
        ${lines.map(([item, price]) => `<div style="display:flex;justify-content:space-between"><span>${item}</span><span>${price}</span></div>`).join("")}
        <hr><div style="display:flex;justify-content:space-between;font-weight:bold"><span>TOTAL</span><span>167,46</span></div>
      </div>
    </body>`);
  await page.screenshot({ path, type: "jpeg", quality: 85 });
  await browser.close();

  return path;
}

export function testAccount(): Account {
  return {
    name: "Visuell Test",
    email: `visual-${Date.now()}@example.com`,
    password: "correct horse battery staple",
  };
}

/** GitHub rejects attachments over 10 MB; keep recordings well below that. */
const maxVideoBytes = 9_000_000;

/** Re-encode a recording as H.264 MP4, which GitHub plays inline. */
export function compressVideo(input: string, output: string) {
  execFileSync(
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- ffmpeg comes from the environment's setup script; see the visual-check skill.
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-i",
      input,
      "-vf",
      "fps=24,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-preset",
      "veryslow",
      "-crf",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      output,
    ],
    { stdio: "inherit" },
  );

  const size = statSync(output).size;

  if (size > maxVideoBytes)
    throw new Error(
      `${output} is ${Math.round(size / 1e6)} MB. Record a shorter flow.`,
    );
}
