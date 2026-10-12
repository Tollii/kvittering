// Browsers have no share sheet for files, so browser checks download it instead.
export function shareTextFile(name: string, contents: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "text/csv;charset=utf-8" }),
  );

  const link = document.createElement("a");

  link.href = url;
  link.download = name;
  link.click();
  // Revoking in the same task can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);

  return Promise.resolve();
}
