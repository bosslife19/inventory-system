import { CheckCircle2, CloudOff, XCircle } from 'lucide-react-native';
import { createContext, use, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Kind = 'success' | 'queued' | 'error';
interface Toast {
  id: number;
  kind: Kind;
  title: string;
  body?: string;
}

const ToastContext = createContext<((t: Omit<Toast, 'id'>) => void) | null>(null);

export function useToast() {
  const show = use(ToastContext);
  if (!show) throw new Error('useToast() outside ToastProvider');
  return show;
}

/** One toast at a time, sliding in at the top. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const seq = useRef(0);
  const show = useCallback((t: Omit<Toast, 'id'>) => setToast({ ...t, id: ++seq.current }), []);
  const dismiss = useCallback(() => setToast(null), []);

  return (
    <ToastContext value={show}>
      {children}
      {toast && <ToastView key={toast.id} toast={toast} onDone={dismiss} />}
    </ToastContext>
  );
}

function ToastView({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  // One Animated.Value per toast (each toast mounts fresh via its key).
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }),
      Animated.delay(3200),
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => finished && onDone());
  }, [anim, onDone]);

  const { Icon, color } = {
    success: { Icon: CheckCircle2, color: c.statusOk },
    queued: { Icon: CloudOff, color: c.statusWarning },
    error: { Icon: XCircle, color: c.statusCritical },
  }[toast.kind];

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        { top: insets.top + Spacing.two, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] },
      ]}>
      <View style={[styles.toast, { backgroundColor: c.ink }]}>
        <Icon size={20} color={color} />
        <View style={{ flex: 1 }}>
          <Text variant="label" tone="inverse">
            {toast.title}
          </Text>
          {toast.body && (
            <Text variant="caption" style={{ color: c.inkMuted }}>
              {toast.body}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    width: '100%',
    maxWidth: 520,
    paddingVertical: Spacing.three + 2,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
