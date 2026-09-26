// Web-only replacement for expo-sqlite 57's WorkerChannel, substituted by
// metro.config.js. It corrects the synchronous path that the app's
// openDatabaseSync, execSync, and getFirstSync calls use:
// - The package's worker writes a result's byte length into one byte, so the
//   main thread reads any result over 255 bytes as truncated JSON.
// - The main thread gives up after a fixed number of spin iterations, which
//   is shorter than the worker needs to load WebAssembly or open a database.
// - Errors are serialized as `{}`, which hides their messages.
// The asynchronous functions are the package's own. Remove this file when
// expo-sqlite fixes these.

/* eslint-disable import/no-unresolved -- Metro resolves this name to the package's WorkerChannel; see metro.config.js. */
export {
  invokeWorkerAsync,
  workerMessageHandler,
} from "expo-sqlite-web-worker-channel";
/* eslint-enable import/no-unresolved */

const pending = 1;

const resolved = 2;

const syncTimeout = 30_000;

type SyncTrait = {
  lockBuffer: SharedArrayBuffer;
  resultBuffer: SharedArrayBuffer;
};

type Message = { result?: unknown; error?: string };

type EncodedBytes = { __uint8array__: true; data: number[] };

// The same encoding as expo-sqlite's SyncSerializer.
function serialize(message: Message) {
  return JSON.stringify(message, (_, item: Uint8Array | Message) =>
    item instanceof Uint8Array
      ? { __uint8array__: true, data: Array.from(item) }
      : item,
  );
}

function deserialize(json: string): Message {
  return JSON.parse(
    json,
    (_, item: EncodedBytes | Message | string | number | null) =>
      item instanceof Object && "__uint8array__" in item
        ? new Uint8Array(item.data)
        : item,
  );
}

let messageId = 0;

export function invokeWorkerSync(
  worker: Worker,
  type: string,
  data: object,
): unknown {
  const lockBuffer = new SharedArrayBuffer(4);
  const resultBuffer = new SharedArrayBuffer(1024 * 1024);
  const lock = new Int32Array(lockBuffer);

  Atomics.store(lock, 0, pending);
  // Synchronous replies return through the buffers, not the message handler.
  messageId -= 1;
  worker.postMessage({
    type,
    id: messageId,
    data,
    isSync: true,
    lockBuffer,
    resultBuffer,
  });

  // Browsers do not allow Atomics.wait on the main thread.
  const deadline = Date.now() + syncTimeout;

  while (Atomics.load(lock, 0) === pending) {
    if (Date.now() > deadline) throw new Error("Sync operation timeout");
  }

  const length = new DataView(resultBuffer).getUint32(0, true);
  const bytes = new Uint8Array(resultBuffer, 4, length).slice();
  const { result, error } = deserialize(new TextDecoder().decode(bytes));

  if (error) throw new Error(error);

  return result;
}

export function sendWorkerResult({
  id,
  result,
  error,
  syncTrait,
}: {
  id: number;
  result: unknown;
  error: Error | null;
  syncTrait?: SyncTrait;
}) {
  if (!syncTrait) {
    self.postMessage(result ? { id, result } : { id, error });

    return;
  }

  const json = error
    ? serialize({ error: error.message })
    : serialize({ result });

  const bytes = new TextEncoder().encode(json);
  new DataView(syncTrait.resultBuffer).setUint32(0, bytes.length, true);
  new Uint8Array(syncTrait.resultBuffer).set(bytes, 4);
  Atomics.store(new Int32Array(syncTrait.lockBuffer), 0, resolved);
}
