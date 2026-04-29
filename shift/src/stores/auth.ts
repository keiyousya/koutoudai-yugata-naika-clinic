import { create } from "zustand";

interface AuthState {
  staffId: number | null;
  staffName: string | null;
  staffRole: "nurse" | "clerk" | null;
  isLoggedIn: boolean;
  login: (staffId: number, passcode: string, name: string, role: "nurse" | "clerk") => void;
  logout: () => void;
  restore: () => boolean;
}

export const useAuthStore = create<AuthState>((set) => ({
  staffId: null,
  staffName: null,
  staffRole: null,
  isLoggedIn: false,

  login: (staffId, passcode, name, role) => {
    sessionStorage.setItem("shift_auth", JSON.stringify({ staffId, passcode }));
    set({ staffId, staffName: name, staffRole: role, isLoggedIn: true });
  },

  logout: () => {
    sessionStorage.removeItem("shift_auth");
    set({ staffId: null, staffName: null, staffRole: null, isLoggedIn: false });
  },

  restore: () => {
    const auth = sessionStorage.getItem("shift_auth");
    if (auth) {
      const { staffId } = JSON.parse(auth);
      set({ staffId, isLoggedIn: true });
      return true;
    }
    return false;
  },
}));
