// Web preference storage. localStorage can be unavailable (private mode, blocked storage).
export const getPref = async (key: string): Promise<string | null> => {
  try {
    return localStorage.getItem(`pref_${key}`);
  } catch {
    return null;
  }
};

export const setPref = async (key: string, value: string): Promise<void> => {
  try {
    localStorage.setItem(`pref_${key}`, value);
  } catch {
    // ignore
  }
};
