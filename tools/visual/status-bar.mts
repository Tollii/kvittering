/**
 * Draw an iOS-style status bar in the top safe area, as the simulator's
 * screenshots have. Runs in the page through addInitScript, so it can use no
 * imports; its text turns light over dark screens.
 */
export function statusBar() {
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
