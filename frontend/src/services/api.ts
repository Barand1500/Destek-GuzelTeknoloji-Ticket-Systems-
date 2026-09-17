import axios from "axios";
export const api = axios.create({ baseURL: "/api/v1", withCredentials: true });
let accessToken: string | null = null;
export function setToken(token: string | null) {
  accessToken = token;
}
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});
let refreshRequest: Promise<string> | null = null;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (
      error.response?.status !== 401 ||
      !config ||
      config._retried ||
      config.url?.startsWith("/auth/")
    )
      throw error;
    config._retried = true;
    if (!refreshRequest)
      refreshRequest = api
        .post("/auth/refresh")
        .then((r) => {
          setToken(r.data.data.accessToken);
          return r.data.data.accessToken as string;
        })
        .finally(() => {
          refreshRequest = null;
        });
    try {
      await refreshRequest;
      return await api(config);
    } catch (refreshError) {
      setToken(null);
      window.dispatchEvent(new Event("session-expired"));
      throw refreshError;
    }
  },
);
export function errorText(error: unknown) {
  return axios.isAxiosError(error)
    ? (error.response?.data?.error?.message ??
        "Sunucuya bağlanılamadı. Lütfen tekrar deneyin.")
    : "İşlem tamamlanamadı.";
}
