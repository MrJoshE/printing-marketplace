import keycloak from "@/lib/auth/keycloak"; // Your keycloak instance
import axios, { AxiosError } from "axios";
import { type ApiErrorResponse, BackendError } from "./models";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4024",
  headers: {
    "Content-Type": "application/json",
  },
});

// 1. Request Interceptor: Attach Keycloak Token
apiClient.interceptors.request.use(async (config) => {
  // Optional: Update token if expired
  if (keycloak.isTokenExpired(30)) {
     await keycloak.updateToken(30);
  }
  
  if (keycloak.token) {
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});

// 2. Response Interceptor: Normalize Errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response?.data?.error_code) {
   
      // Convert standard axios error to your Custom BackendError
      throw new BackendError(error.response.data, error.response.status);
    }
    // Fallback for network errors (no response from server)
    throw error;
  }
);

export { apiClient };
