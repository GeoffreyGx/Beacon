// Native preference storage (small values only).
import * as SecureStore from 'expo-secure-store';

export const getPref = (key: string) => SecureStore.getItemAsync(`pref_${key}`).catch(() => null);
export const setPref = (key: string, value: string) => SecureStore.setItemAsync(`pref_${key}`, value).catch(() => {});
