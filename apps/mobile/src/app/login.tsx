import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/lib/theme';
import { Button, Chip, Input, Row, T } from '@/components/ui';

export default function Login() {
  const c = useColors();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (id = identifier, pw = password) => {
    setBusy(true); setError(null);
    try {
      if (mode === 'login') await login(id, pw);
      else await register({ fullName: name, password: pw, ...(id.includes('@') ? { email: id } : { phone: id }) });
      router.back();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <T size={26} weight="800">{mode === 'login' ? 'Welcome to Wattly Drive' : 'Create your Wattly account'}</T>
        <Row gap={8}><Chip label="Sign in" active={mode === 'login'} onPress={() => setMode('login')} /><Chip label="Create account" active={mode === 'register'} onPress={() => setMode('register')} /></Row>
        {mode === 'register' && <Input label="Full name" value={name} onChangeText={setName} autoComplete="name" />}
        <Input label="Email or phone (+92…)" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" autoComplete="username" />
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'password' : 'new-password'} />
        {error && <T size={13} style={{ color: c.danger }}>{error}</T>}
        <Button title={mode === 'login' ? 'Sign in' : 'Create account'} onPress={() => go()} loading={busy} disabled={!identifier || password.length < (mode === 'login' ? 1 : 8) || (mode === 'register' && name.length < 2)} />
        <View style={{ marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, gap: 8 }}>
          <T size={12} weight="700" muted>DEMO ACCOUNT</T>
          <T size={12} muted>driver@wattly.demo · Demo1234!</T>
          <Button title="Use demo driver" variant="secondary" small onPress={() => { setMode('login'); setIdentifier('driver@wattly.demo'); setPassword('Demo1234!'); go('driver@wattly.demo', 'Demo1234!'); }} />
        </View>
        <T size={11.5} muted>Google and Apple sign-in are available on the web; native sign-in can be enabled with expo-auth-session once client IDs are configured.</T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
