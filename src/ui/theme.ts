import { StyleSheet } from 'react-native';

export const colors = {
  background: '#f4f5f7',
  surface: '#ffffff',
  text: '#16181d',
  muted: '#5b6170',
  border: '#d5d8de',
  accent: '#1f5fd1',
  onAccent: '#ffffff',
  danger: '#b42318',
  dangerBg: '#fdecea',
  warningBg: '#fff4e5',
  warningText: '#7a4100',
  successBg: '#e8f6ee',
  successText: '#14532d',
};

export const typography = StyleSheet.create({
  subtitle: { fontSize: 18, fontWeight: '600', color: colors.text, flexShrink: 1 },
  text: { fontSize: 16, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
});
