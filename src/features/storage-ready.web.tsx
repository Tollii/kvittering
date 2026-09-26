import { openDatabaseAsync } from "expo-sqlite";
import { useEffect, useState, type ReactNode } from "react";
import { Loading } from "@/components/ui";

// expo-sqlite's web worker cannot start while a synchronous call blocks the
// page, so the web build starts it with one asynchronous open before rendering
// the app. An in-memory database keeps the worker's small file pool free.
const ready = openDatabaseAsync(":memory:").then((database) =>
  database.closeAsync(),
);

export function StorageReady({ children }: Readonly<{ children: ReactNode }>) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    void ready.then(() => setDone(true));
  }, []);

  return done ? children : <Loading />;
}
