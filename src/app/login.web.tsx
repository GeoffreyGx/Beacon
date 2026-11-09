// Web login: CAS won't redirect to our origin, so the server route
// /api/cas-login runs the CAS form login and returns the ticket.
import { useState } from 'react';
import { ActivityIndicator, Button, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { setToken } from '../lib/session';
import { makeStyles, useAppTheme } from '../lib/theme';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = useStyles();
  const { colors } = useAppTheme();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/cas-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await setToken(data.token); // the server route already exchanged the ticket
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Identifiants ENT Avignon</Text>
      <TextInput
        style={styles.input}
        placeholder="Identifiant"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoComplete="username"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        placeholderTextColor={colors.textFaint}
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {busy ? <ActivityIndicator /> : <Button title="Se connecter" color={colors.moved} onPress={submit} disabled={!username || !password} />}
      <Text style={styles.note}>
        {"Vos identifiants sont transmis une seule fois au CAS de l'université et ne sont pas conservés."}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, padding: 16, gap: 12, maxWidth: 400, width: '100%', alignSelf: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600', color: c.text },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 6, padding: 10, fontSize: 16, color: c.text },
  error: { color: c.danger },
  note: { color: c.textMuted, fontSize: 12 },
}));
