// Native login: show the real CAS page in a WebView and intercept the redirect
// back to edt.univ-avignon.fr so we capture the ticket before that page uses it.
import { useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import { CAS_LOGIN_URL, edt, extractTicket } from '../lib/edt';
import { setToken } from '../lib/session';
import { makeStyles } from '../lib/theme';

export default function Login() {
  const handled = useRef(false);
  const styles = useStyles();
  const [status, setStatus] = useState<'cas' | 'exchanging' | { error: string }>('cas');

  const onTicket = async (ticket: string) => {
    if (handled.current) return;
    handled.current = true;
    setStatus('exchanging');
    try {
      const { token } = await edt.exchangeTicket(ticket);
      await setToken(token);
      router.back();
    } catch (e) {
      setStatus({ error: String(e) });
    }
  };

  if (status !== 'cas') {
    return (
      <View style={styles.center}>
        {status === 'exchanging' ? <ActivityIndicator /> : <Text style={styles.error}>{status.error}</Text>}
      </View>
    );
  }

  return (
    <WebView
      source={{ uri: CAS_LOGIN_URL }}
      incognito // start from a clean CAS session each time
      onShouldStartLoadWithRequest={(req) => {
        const ticket = extractTicket(req.url);
        if (ticket) {
          onTicket(ticket);
          return false; // block the load so the official app never consumes the ticket
        }
        return true;
      }}
      // Fallback for platforms that don't route redirects through the hook above.
      onNavigationStateChange={(nav) => {
        const ticket = extractTicket(nav.url);
        if (ticket) onTicket(ticket);
      }}
    />
  );
}

const useStyles = makeStyles((c) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: c.bg },
  error: { color: c.danger },
}));
