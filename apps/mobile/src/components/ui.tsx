import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { scoreHex, useColors } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'electric' | 'ghost';

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, small }: {
  title: string; onPress?: () => void; variant?: Variant; icon?: keyof typeof Ionicons.glyphMap; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const c = useColors();
  const bg = { primary: c.accent, electric: c.electric, danger: c.danger, secondary: c.surface2, outline: c.surface, ghost: 'transparent' }[variant];
  const fg = variant === 'primary' ? c.onAccent : ['electric', 'danger'].includes(variant) ? '#fff' : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: 14, height: small ? 36 : 48, paddingHorizontal: small ? 12 : 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderWidth: variant === 'outline' ? StyleSheet.hairlineWidth * 2 : 0, borderColor: c.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useColors();
  const base: ViewStyle = { backgroundColor: c.surface, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.border, padding: 16 };
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}>{children}</Pressable>;
  return <View style={[base, style]}>{children}</View>;
}

export function T({ children, style, muted, weight, size, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; weight?: TextStyle['fontWeight']; size?: number; numberOfLines?: number }) {
  const c = useColors();
  return <Text numberOfLines={numberOfLines} style={[{ color: muted ? c.muted : c.text, fontSize: size ?? 15, fontWeight: weight }, style]}>{children}</Text>;
}

export function H({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <T size={17} weight="700" style={[{ letterSpacing: -0.2 }, style]}>{children}</T>;
}

export function Badge({ label, color, bg, icon }: { label: string; color?: string; bg?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: bg ?? c.surface2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      {icon && <Ionicons name={icon} size={11} color={color ?? c.muted} />}
      <Text style={{ color: color ?? c.muted, fontSize: 11.5, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityState={{ selected: !!active }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accentSoft : c.surface }}>
      {icon && <Ionicons name={icon} size={14} color={active ? c.accent : c.muted} />}
      <Text style={{ color: active ? c.accent : c.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const c = useColors();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label && <T size={13} weight="600">{label}</T>}
      <TextInput placeholderTextColor={c.subtle} {...rest}
        style={[{ height: rest.multiline ? 96 : 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, color: c.text, paddingHorizontal: 12, paddingTop: rest.multiline ? 10 : 0, fontSize: 15, textAlignVertical: rest.multiline ? 'top' : 'center' }, style]} />
    </View>
  );
}

/** Lightweight touch slider (no native dependency). */
export function Slider({ value, onChange, min = 0, max = 100, step = 1, color }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; color?: string }) {
  const c = useColors();
  const [width, setWidth] = useState(1);
  const startX = useRef(0);
  const pct = (value - min) / (max - min);
  const fromX = (x: number) => {
    const raw = min + Math.max(0, Math.min(1, x / width)) * (max - min);
    return Math.round(raw / step) * step;
  };
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => { startX.current = e.nativeEvent.locationX; onChange(fromX(e.nativeEvent.locationX)); }}
      onResponderMove={(e) => onChange(fromX(e.nativeEvent.locationX))}
      accessibilityRole="adjustable"
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === 'increment' ? step * 5 : -step * 5))))}
      style={{ height: 32, justifyContent: 'center' }}
    >
      <View pointerEvents="none" style={{ height: 8, borderRadius: 4, backgroundColor: c.surface3, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: color ?? c.accent }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(0, pct * width - 12), width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 }} />
    </View>
  );
}

export function SocSlider({ label, value, onChange, color, max = 100 }: { label: string; value: number; onChange: (v: number) => void; color?: string; max?: number }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T size={13} muted>{label}</T><T size={13} weight="700">{value}%</T></View>
      <Slider value={value} onChange={onChange} color={color} max={max} />
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const c = useColors();
  return <View style={{ padding: 32, alignItems: 'center', gap: 10 }}><ActivityIndicator color={c.accent} />{label && <T muted size={13}>{label}</T>}</View>;
}

export function Empty({ icon = 'file-tray-outline', title, body, action }: { icon?: keyof typeof Ionicons.glyphMap; title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={24} color={c.subtle} /></View>
      <T weight="700">{title}</T>
      {body && <T muted size={14} style={{ textAlign: 'center' }}>{body}</T>}
      {action}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: { message: string } | null; onRetry?: () => void }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <Ionicons name="warning-outline" size={28} color={c.danger} />
      <T weight="700">Something went wrong</T>
      <T muted size={14} style={{ textAlign: 'center' }}>{error?.message}</T>
      {onRetry && <Button title="Try again" variant="outline" small onPress={onRetry} />}
    </View>
  );
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Fact({ label, value, sub, est }: { label: string; value: string; sub?: string; est?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, minWidth: '45%', backgroundColor: c.surface2, borderRadius: 14, padding: 12 }}>
      <T size={11.5} muted weight="600">{label}{est ? '  · est.' : ''}</T>
      <T size={16} weight="700" style={{ marginTop: 2 }}>{value}</T>
      {sub && <T size={11.5} muted>{sub}</T>}
    </View>
  );
}

export function ScorePill({ score, large }: { score: number | null; large?: boolean }) {
  return (
    <View style={{ backgroundColor: scoreHex(score), borderRadius: large ? 12 : 8, minWidth: large ? 46 : 30, height: large ? 46 : 24, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: large ? 18 : 12 }}>{score == null ? '–' : score.toFixed(1)}</Text>
    </View>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.border, marginVertical: 12 }} />;
}

export function SourceBadge({ source, updatedAt }: { source: string; updatedAt?: string | null }) {
  const c = useColors();
  if (source === 'live') return <Badge label="Live" color={c.accent} bg={c.accentSoft} icon="radio-outline" />;
  if (source === 'simulated') return <Badge label="Demo feed (simulated)" color={c.violet} bg={c.violetSoft} icon="flask-outline" />;
  if (source === 'user_reported') return <Badge label="Driver report" icon="people-outline" />;
  if (source === 'estimated') return <Badge label="Estimated" icon="sparkles-outline" />;
  return <Badge label={`Reported${updatedAt ? '' : ''}`} icon="time-outline" />;
}
