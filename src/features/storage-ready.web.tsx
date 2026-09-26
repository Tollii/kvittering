import { openDatabaseAsync } from "expo-sqlite";
import { useEffect, useState, type ReactNode } from "react";
import { Loading } from "@/components/ui";

// expo-sqlite's web worker loads WebAssembly and opens its file pool on the
// first call. A synchronous first open can time out before that finishes, so
// the web build waits for one asynchronous open before rendering the app.
const ready = openDatabaseAsync("kvitto-web-ready.db").then((database) =>
  database.closeAsync(),
);

export function StorageReady({ children }: Readonly<{ children: ReactNode }>) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    void ready.then(() => setDone(true));
  }, []);

  return done ? children : <Loading />;
}
