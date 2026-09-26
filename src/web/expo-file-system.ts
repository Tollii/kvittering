// Web stand-in for the parts of expo-file-system that Kvitto uses. Metro
// substitutes it only for web bundles (metro.config.js); iOS keeps the real
// module. Files live in memory for the page session, so queued images and the
// image cache do not survive a reload. Browser checks use it to exercise
// capture, upload, and receipt image flows; it does not model iOS durability.

type Stored = { blob: Blob; url: string; modified: number };

const files = new Map<string, Stored>();

const directories = new Set<string>();

const objectUrls = new Map<string, Blob>();

// Image pickers and the image manipulator return blob: URLs. Remember their
// contents so a synchronous copy can read them, as the native module does.
const createObjectURL = URL.createObjectURL.bind(URL);

URL.createObjectURL = (object: Blob | MediaSource) => {
  const url = createObjectURL(object);

  if (object instanceof Blob) objectUrls.set(url, object);

  return url;
};

type Part = string | File | Directory;

function trimSlashes(part: string, leading: boolean) {
  let start = 0;
  let end = part.length;

  while (leading && part[start] === "/") start += 1;

  while (end > start && part[end - 1] === "/") end -= 1;

  return part.slice(start, end);
}

function join(parts: Part[]) {
  return parts
    .map((part) =>
      part instanceof File || part instanceof Directory ? part.path : part,
    )
    .map((part, index) => trimSlashes(part, index > 0))
    .join("/");
}

function decodeDataUrl(uri: string) {
  const [header = "", data = ""] = uri.split(",", 2);
  const type = /^data:([^;,]+)/.exec(header)?.[1] ?? "";

  if (!header.endsWith(";base64"))
    return new Blob([decodeURIComponent(data)], { type });

  return new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], {
    type,
  });
}

function contents(path: string) {
  const blob =
    files.get(path)?.blob ??
    objectUrls.get(path) ??
    (path.startsWith("data:") ? decodeDataUrl(path) : undefined);

  if (!blob) throw new Error(`File not found: ${path}`);

  return blob;
}

function write(path: string, blob: Blob) {
  remove(path);
  files.set(path, {
    blob,
    url: createObjectURL(blob),
    modified: Date.now(),
  });
}

function remove(path: string) {
  const stored = files.get(path);

  if (stored) URL.revokeObjectURL(stored.url);
  files.delete(path);
}

function parent(path: string) {
  return path.slice(0, path.lastIndexOf("/"));
}

function baseName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

// Extending Blob lets `fetch(url, { body: file })` upload the contents, as the
// native File does.
export class File extends Blob {
  path: string;

  constructor(...parts: Part[]) {
    const path = join(parts);
    const stored = files.get(path);
    super(stored ? [stored.blob] : [], { type: stored?.blob.type });
    this.path = path;
  }

  get uri() {
    return files.get(this.path)?.url ?? this.path;
  }

  get name() {
    return baseName(this.path);
  }

  get exists() {
    return files.has(this.path);
  }

  override get size() {
    return files.get(this.path)?.blob.size ?? 0;
  }

  get lastModified() {
    return files.get(this.path)?.modified ?? null;
  }

  delete() {
    remove(this.path);
  }

  copySync(destination: File) {
    write(destination.path, contents(this.path));
  }

  async move(destination: File, options?: { overwrite?: boolean }) {
    if (files.has(destination.path) && !options?.overwrite)
      throw new Error(`File exists: ${destination.path}`);
    write(destination.path, contents(this.path));
    remove(this.path);
    this.path = destination.path;
  }

  override async text() {
    return contents(this.path).text();
  }

  static async downloadFileAsync(
    url: string,
    destination: File,
    options?: { headers?: Record<string, string> },
  ) {
    const response = await fetch(url, { headers: options?.headers });

    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    write(destination.path, await response.blob());

    return destination;
  }
}

export class Directory {
  readonly path: string;

  constructor(...parts: Part[]) {
    this.path = join(parts);
  }

  get uri() {
    return `${this.path}/`;
  }

  get name() {
    return baseName(this.path);
  }

  get exists() {
    return directories.has(this.path);
  }

  create() {
    let path = this.path;

    while (path.includes("/") && !path.endsWith(":/")) {
      directories.add(path);
      path = parent(path);
    }
  }

  delete() {
    for (const path of files.keys())
      if (path.startsWith(`${this.path}/`)) remove(path);

    for (const path of directories)
      if (path === this.path || path.startsWith(`${this.path}/`))
        directories.delete(path);
  }

  list(): (File | Directory)[] {
    return [
      ...[...directories].flatMap((path) =>
        parent(path) === this.path ? [new Directory(path)] : [],
      ),
      ...[...files.keys()].flatMap((path) =>
        parent(path) === this.path ? [new File(path)] : [],
      ),
    ];
  }
}

export const Paths = {
  document: new Directory("file:///document"),
  cache: new Directory("file:///cache"),
};
