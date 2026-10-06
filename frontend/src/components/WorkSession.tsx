import { Activity, createContext, useContext, useEffect, useState, type ReactNode, type ReactElement } from "react";
import { UNSAFE_LocationContext, useLocation, useOutlet } from "react-router-dom";
import { workspacePath } from "../router/paths";
import type { User } from "../types";

type WorkSessionState = {
  resumePath: string;
  revisions: Record<string, number>;
  startNewRequest: () => void;
  completePhoneRequest: (conversationPath: string) => void;
  forgetConversation: (conversationPath: string) => void;
};

const WorkSessionContext = createContext<WorkSessionState | null>(null);
const isConversation = (path: string) => /^\/(admin|agent)\/conversations\/[^/]+$/.test(path)
  || (/^\/customer\/tickets\/[^/]+$/.test(path) && !path.endsWith("/new"));
const isPhoneRequest = (path: string) => /^\/(admin|agent)\/phone-support$/.test(path);

export function WorkSessionProvider({ user, children }: { user: User; children: ReactNode }) {
  const location = useLocation();
  const phonePath = workspacePath(user.role, "phone-support");
  const [resumePath, setResumePath] = useState(phonePath);
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  useEffect(() => {
    if (isPhoneRequest(location.pathname) || isConversation(location.pathname)) {
      setResumePath(location.pathname + location.search + location.hash);
    }
  }, [location.pathname, location.search, location.hash]);
  useEffect(() => {
    document.documentElement.dataset.conversationActive = String(isConversation(location.pathname));
    return () => { delete document.documentElement.dataset.conversationActive; };
  }, [location.pathname]);

  const reset = (path: string) => setRevisions(previous => ({ ...previous, [path]: (previous[path] ?? 0) + 1 }));
  const startNewRequest = () => {
    reset(phonePath);
    setResumePath(phonePath);
  };
  const completePhoneRequest = (path: string) => {
    reset(phonePath);
    setResumePath(path);
  };
  const forgetConversation = (path: string) => {
    reset(path);
    setResumePath(previous => previous.split(/[?#]/)[0] === path ? phonePath : previous);
  };

  return <WorkSessionContext.Provider value={{ resumePath, revisions, startNewRequest, completePhoneRequest, forgetConversation }}>{children}</WorkSessionContext.Provider>;
}

export function useWorkSession() {
  const session = useContext(WorkSessionContext);
  if (!session) throw new Error("WorkSessionProvider missing");
  return session;
}

type Screen = {
  key: string;
  pathname: string;
  revision: number;
  outlet: ReactElement | null;
  location: NonNullable<React.ContextType<typeof UNSAFE_LocationContext>>;
};

export function WorkScreenOutlet() {
  const outlet = useOutlet();
  const locationContext = useContext(UNSAFE_LocationContext);
  const location = useLocation();
  const { revisions } = useWorkSession();
  const [screens, setScreens] = useState<Screen[]>([]);
  const preserve = isPhoneRequest(location.pathname) || isConversation(location.pathname);
  const revision = revisions[location.pathname] ?? 0;
  const key = `${location.pathname}${location.search}@${revision}`;
  const current: Screen = { key, pathname: location.pathname, revision, outlet, location: locationContext! };

  useEffect(() => {
    setScreens(previous => {
      const retained = previous.filter(screen => screen.revision === (revisions[screen.pathname] ?? 0));
      if (preserve && !retained.some(screen => screen.key === key)) return [...retained, current];
      return retained.length === previous.length ? previous : retained;
    });
  }, [key, preserve, revisions, outlet, locationContext]);

  const retained = screens.filter(screen => screen.revision === (revisions[screen.pathname] ?? 0));
  const visibleScreens = preserve && !retained.some(screen => screen.key === key) ? [...retained, current] : retained;
  return <>
    {visibleScreens.map(screen => {
      const active = preserve && screen.key === key;
      // Freeze each hidden screen's URL as well as its outlet, so its hooks keep
      // their original conversation ID and customer query parameters.
      return <Activity key={screen.key} mode={active ? "visible" : "hidden"}>
        <UNSAFE_LocationContext.Provider value={active ? locationContext! : screen.location}>
          {active ? outlet : screen.outlet}
        </UNSAFE_LocationContext.Provider>
      </Activity>;
    })}
    {!preserve && outlet}
  </>;
}
