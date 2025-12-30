import keycloak from "@/lib/auth/keycloak";
import type { KeycloakLogoutOptions } from "keycloak-js";
import { createContext, useContext, useEffect, useRef, useState } from "react";

export interface User {
  email: string
  name: string
  avatar?: string
}

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean; // <--- ADDED THIS
  token: string | undefined;
  user: User | null;
  login: () => void;
  register: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const logoutOptions: KeycloakLogoutOptions = {
  redirectUri: window.location.origin,
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // 1. Start loading as TRUE. The app is "loading" until Keycloak says otherwise.
  const [isLoading, setIsLoading] = useState(true); 
  const [user, setUser] = useState<User | null>(null);
  const isRun = useRef(false);

  useEffect(() => {
    if (isRun.current) return;
    isRun.current = true;

    keycloak
      .init({
        onLoad: "check-sso",
        silentCheckSsoRedirectUri: window.location.origin + "/silent-check-sso.html",
        pkceMethod: "S256",
      })
      .then(async (authenticated) => {
        setIsAuthenticated(authenticated);
        
        if (authenticated) {
            try {
                const profile = await keycloak.loadUserProfile();
                setUser({
                    ...profile, 
                    name: `${profile.firstName} ${profile.lastName}`, 
                    email: profile.email!
                });
            } catch (error) {
                console.error("Failed to load user profile", error);
            }
        }
      })
      .catch((err) => {
        console.error("Keycloak init failed", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = () => keycloak.login(logoutOptions);
  const logout = () => keycloak.logout(logoutOptions);
  const register = () => keycloak.register(logoutOptions);

  return (
    <AuthContext.Provider value={{ 
        isAuthenticated, 
        isLoading, // <--- Pass it down
        token: keycloak.token, 
        user, 
        login, 
        register,
        logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};