import { useCallback, useEffect, useState } from "react";
import "./index.css";
import Dashboard from "./Dashboard";
import Landing from "./module/Landing/Landing";
import Login from "./module/Auth/Login";
import { clearSession, getSession, saveSession } from "./module/Auth/auth";

// Tiny hash router: #/ (intro), #/login, #/app (dashboard).
const routeFromHash = () => {
  const name = window.location.hash.replace(/^#\/?/, "");
  return name === "login" || name === "app" ? name : "";
};

function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [user, setUser] = useState(getSession);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((to) => {
    setRoute(to);
    window.location.hash = to ? `#/${to}` : "#/";
    window.scrollTo(0, 0);
  }, []);

  // The dashboard needs a session (a guest counts); without one the login page shows instead.
  const guarded = route === "app" && !user ? "login" : route;

  function signIn(next, remember = true) {
    saveSession(next, remember);
    setUser(next);
    go("app");
  }

  function signOut() {
    clearSession();
    setUser(null);
    go("");
  }

  if (guarded === "app") return <Dashboard user={user} onLogout={signOut} onHome={() => go("")} />;

  if (guarded === "login") {
    return (
      <Login
        onSuccess={signIn}
        onGuest={() => signIn({ name: "Khách", email: "", guest: true }, false)}
        onBack={() => go("")}
      />
    );
  }

  return <Landing user={user} onStart={() => go(user ? "app" : "login")} onLogin={() => go(user ? "app" : "login")} />;
}

export default App;
