// metro.config.js resolves this name to expo-sqlite's own WorkerChannel.ts,
// which is TypeScript source that does not type-check under this project.
declare module "expo-sqlite-web-worker-channel" {
  export const invokeWorkerAsync: unknown;
  export const workerMessageHandler: unknown;
}
