import { createContext, useContext, useEffect, useState } from "react";

import * as api from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;

    api
      .getMe()
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus("ready");
      });

    return () => {
      active = false;
    };
  }, []);

  async function login(credentials) {
    const currentUser = await api.login(credentials);
    setUser(currentUser);
    return currentUser;
  }

  async function signup(details) {
    const currentUser = await api.signup(details);
    setUser(currentUser);
    return currentUser;
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, status, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
