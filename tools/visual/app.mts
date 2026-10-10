// A small Playwright API for driving the web build started by
// tools/visual/start.sh. Flows import it; see tools/visual/flows/.
//
// The web build approximates the iOS app: layout, text, and JavaScript flows
// are real, but native modules (camera, Keychain, widgets, share sheet) are
// not exercised. The page has an iPhone's full screen, safe areas, and status
// bar, so screenshots line up with simulator screenshots of the same screen.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  chromium,
  devices,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const iPhone = devices["iPhone 15"];

// Playwright's iPhone viewport is Safari's, without the browser chrome. The app
// fills the whole screen, so use the screen and its safe areas instead.
const screen = { width: 393, height: 852 };

const safeArea = { top: 59, bottom: 34, left: 0, right: 0 };

/**
 * The reviewed-receipts fixture's purchases are from 21 to 23 September 2026.
 * A fixed date keeps screens that show the current month the same as the iOS
 * references in docs/design-system, whenever a flow runs.
 */
const fixtureTime = new Date("2026-09-24T18:37:00+02:00");

export type AppOptions = {
  /** Record a video of the session (default true). */
  video?: boolean;
  /** Output directory (default build/visual/media/<name>). */
  output?: string;
  url?: string;
  colorScheme?: "light" | "dark";
  /** The browser's clock (default fixtureTime); null keeps the real time. */
  now?: Date | null;
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
      viewport: screen,
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
          size: { width: screen.width * 2, height: screen.height * 2 },
        },
      }),
    });

    const now = options.now === undefined ? fixtureTime : options.now;

    // Date moves on from `now`; timers stay real, so the backend connection and
    // animations behave as usual.
    if (now) await context.clock.setSystemTime(now);
    await context.addInitScript(statusBar);

    const page = await context.newPage();

    // env(safe-area-inset-*) drives react-native-safe-area-context on web.
    const devtools = await context.newCDPSession(page);
    await devtools.send("Emulation.setSafeAreaInsetsOverride", {
      insets: safeArea,
    });

    // Errors in the browser often explain a failed step.
    page.on("pageerror", (error) => console.error(`page error: ${error}`));
    page.on("console", (message) => {
      if (message.type() === "error")
        console.error(`console error: ${message.text()}`);
    });
    await page.goto(url);

    return new App(page, output, browser, context);
  }

  /**
   * Open the app, run a flow, and close it. A failed flow saves a `failed`
   * screenshot before the error propagates. Prints the saved media paths.
   */
  static async run(
    name: string,
    flow: (app: App) => Promise<void>,
    options: AppOptions = {},
  ) {
    const app = await App.open(name, options);

    try {
      await flow(app);
    } catch (error) {
      await app.screenshot("failed");
      throw error;
    } finally {
      await app.close();
      console.log(app.output);
    }
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

  /** Sign in with an existing account, by default the seeded fixture account. */
  async signIn(account = seededAccount()) {
    // The welcome screen offers email sign-in; without it, the form shows directly.
    await this.page
      .getByText(/^(Logg inn med e-post|Ny her\? Opprett konto)$/)
      .first()
      .waitFor({ state: "visible", timeout: 60_000 });

    if (await this.find("Logg inn med e-post").isVisible())
      await this.tap("Logg inn med e-post");
    await this.type("sign-in-email", account.email);
    await this.type("sign-in-password", account.password);
    await this.tap("sign-in-submit");
    await this.see("Historikk");

    return account;
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
    const { video: path } = encodeRecording(await video.path(), this.output);
    rmSync(join(this.output, "raw"), { recursive: true, force: true });

    return path;
  }

  private find(target: string) {
    return (
      this.page
        .getByTestId(target)
        .or(this.page.getByLabel(target, { exact: true }))
        .or(this.page.getByText(target, { exact: true }))
        // Tabs keep earlier screens mounted but hidden.
        .filter({ visible: true })
        .first()
    );
  }
}

/**
 * Draw an iOS-style status bar in the top safe area, as the simulator's
 * screenshots have. Runs in the page; its text turns light over dark screens.
 */
function statusBar() {
  if (window !== window.top) return;

  const icons = `
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
    <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.6c2.2 0 4.2.9 5.7 2.3l1.2-1.2A9.8 9.8 0 0 0 8 1 9.8 9.8 0 0 0 1.1 3.7l1.2 1.2A8.1 8.1 0 0 1 8 2.6Zm0 3.3c1.3 0 2.5.5 3.4 1.3l1.2-1.2A6.5 6.5 0 0 0 8 4.3a6.5 6.5 0 0 0-4.6 1.7l1.2 1.2c.9-.8 2.1-1.3 3.4-1.3Zm0 3.2c-.6 0-1.1.2-1.5.6L8 11.2l1.5-1.5c-.4-.4-.9-.6-1.5-.6Z"/></svg>
    <svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x=".5" y=".5" width="23" height="12" rx="3.8" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.5" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity=".5"/></svg>`;

  const backdrop = () => {
    for (
      let element = document.elementFromPoint(innerWidth / 2, 64);
      element;
      element = element.parentElement
    ) {
      const rgb = getComputedStyle(element).backgroundColor.match(/[\d.]+/g);

      if (rgb && (rgb.length < 4 || Number(rgb[3]) > 0.5)) {
        const [r = 0, g = 0, b = 0] = rgb.map(Number);

        return 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }

    return 255;
  };

  addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.setAttribute("aria-hidden", "true");
    bar.style.cssText =
      "position:fixed;inset:0 0 auto 0;height:54px;z-index:2147483647;pointer-events:none;display:flex;align-items:center;justify-content:space-between;padding:4px 30px 0 52px;box-sizing:border-box;font:600 17px/1 -apple-system,system-ui,sans-serif;letter-spacing:-0.4px";
    const time = document.createElement("span");
    bar.append(time);
    bar.insertAdjacentHTML(
      "beforeend",
      `<span style="display:flex;gap:6px;align-items:center">${icons}</span>`,
    );
    document.body.append(bar);

    const update = () => {
      time.textContent = new Date().toLocaleTimeString("nb-NO", {
        hour: "2-digit",
        minute: "2-digit",
      });
      bar.style.color = backdrop() < 128 ? "#fff" : "#000";
    };

    update();
    setInterval(update, 200);
  });
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

// Recordings stay well below GitHub's 10 MB file view limit.
const maxMediaBytes = 9_000_000;

function ffmpeg(args: string[], output: string) {
  execFileSync(
    // oxlint-disable-next-line sonarjs/no-os-command-from-path -- ffmpeg comes from the environment's setup script; see the visual-check skill.
    "ffmpeg",
    ["-y", "-loglevel", "error", ...args, output],
    { stdio: "inherit" },
  );

  const size = statSync(output).size;

  if (size > maxMediaBytes)
    throw new Error(
      `${output} is ${Math.round(size / 1e6)} MB. Record a shorter flow.`,
    );
}

/**
 * Encode a recording as an H.264 MP4, which browsers play, and a small GIF
 * preview, which a PR description shows inline.
 */
export function encodeRecording(input: string, directory: string) {
  const video = join(directory, "flow.mp4");
  const preview = join(directory, "flow.gif");

  ffmpeg(
    [
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
    ],
    video,
  );
  ffmpeg(
    [
      "-i",
      video,
      "-vf",
      "fps=8,scale=320:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer",
    ],
    preview,
  );

  return { video, preview };
}

/** The account that tools/visual/start.sh seeded with the fixture. */
export function seededAccount(output = "build/visual/seed"): Account {
  return z
    .object({ name: z.string(), email: z.string(), password: z.string() })
    .parse(JSON.parse(readFileSync(join(output, "account.json"), "utf8")));
}
