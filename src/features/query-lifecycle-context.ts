import { createContext, useContext } from "react";

export const QueryLifecycleContext = createContext({
  active: true,
  online: true,
});

export const useQueryLifecycle = () => useContext(QueryLifecycleContext);
