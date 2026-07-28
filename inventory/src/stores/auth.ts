import { create } from "zustand";

interface AuthState {
  staffId: number | null;
  staffName: string | null;
  isLoggedIn: boolean;
  login: (staffId: number, passcode: string, name: string) => void;
  logout: () => void;
  restore: () => boolean;
}

export const useAuthStore = create<AuthState>((set) => ({
  staffId: null,
  staffName: null,
  isLoggedIn: false,

  login: (staffId, passcode, name) => {
    sessionStorage.setItem(
      "inventory_auth",
      JSON.stringify({ staffId, passcode })
    );
    set({ staffId, staffName: name, isLoggedIn: true });
  },

  logout: () => {
    sessionStorage.removeItem("inventory_auth");
    set({ staffId: null, staffName: null, isLoggedIn: false });
  },

  restore: () => {
    const auth = sessionStorage.getItem("inventory_auth");
    if (auth) {
      const { staffId } = JSON.parse(auth);
      set({ staffId, isLoggedIn: true });
      return true;
    }
    return false;
  },
}));
