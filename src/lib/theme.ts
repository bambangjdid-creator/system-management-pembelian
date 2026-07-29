export const safeLocalStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore storage errors in sandboxed/private contexts.
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors in sandboxed/private contexts.
    }
  }
};

export function applyTheme(isDarkMode: boolean) {
  if (isDarkMode) {
    document.documentElement.classList.add('dark');
    safeLocalStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    safeLocalStorage.setItem('theme', 'light');
  }
}
