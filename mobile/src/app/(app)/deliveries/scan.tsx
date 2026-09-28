import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Camera, ImageIcon, Keyboard, ScanLine, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseDeliveryNote } from '@/lib/delivery-parser';
import { setDeliveryDraft } from '@/lib/delivery-draft';
import { isOcrAvailable, recognizeWords } from '@/lib/ocr';
import { useProducts } from '@/lib/queries';

const EMPTY = { deliveryNoteNo: null, source: null, receivedDate: null, lines: [] };

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Photograph a delivery note; ML Kit reads it on the phone (offline, the
 * photo never leaves the device) and the lines go to the review screen.
 * Without OCR (Expo Go, web) or if reading fails, staff type the lines in.
 */
export default function ScanDelivery() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const products = useProducts();
  const [photo, setPhoto] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const ocr = isOcrAvailable();

  function manual(photoUri: string | null = photo) {
    setDeliveryDraft({ capture: 'manual', photoUri, parsed: EMPTY });
    router.replace('/deliveries/review');
  }

  async function read(uri: string) {
    setPhoto(uri);
    setProblem(null);
    if (!ocr) return manual(uri);
    try {
      const words = await recognizeWords(uri);
      const parsed = parseDeliveryNote(words, products.data ?? []);
      if (parsed.lines.length === 0) {
        setProblem('No item lines could be read from this photo. Try again closer, flat and in good light — or type the lines in.');
        return;
      }
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDeliveryDraft({ capture: 'ocr', photoUri: uri, parsed });
      router.replace('/deliveries/review');
    } catch {
      setProblem('The photo couldn’t be read. Try again, or type the lines in.');
    }
  }

  async function shoot() {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shot = await camera.current?.takePictureAsync({ quality: 0.85 });
    if (shot?.uri) void read(shot.uri);
  }

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!result.canceled && result.assets[0]) void read(result.assets[0].uri);
  }

  const reading = photo !== null && problem === null;

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <View style={[styles.fill, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <TopBar title="Scan delivery note" dark={false} />
        <EmptyState
          icon={Camera}
          title="Allow the camera"
          body="Photograph the delivery note and the app reads it on this phone. The photo is not uploaded.">
          <Button label="Allow camera" icon={Camera} onPress={() => void requestPermission()} />
          <Button label="Choose a photo instead" icon={ImageIcon} variant="ghost" onPress={() => void pick()} />
          <Button label="Type the lines in" icon={Keyboard} variant="ghost" onPress={() => manual(null)} />
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: '#000' }]}>
      {photo ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      )}

      <View style={[styles.overlay, { paddingTop: insets.top }]} pointerEvents="box-none">
        <TopBar title="Scan delivery note" dark />

        <View style={styles.frameWrap} pointerEvents="none">
          <View style={[styles.frame, { borderColor: problem ? c.statusWarning : 'rgba(255,255,255,0.9)' }]}>
            {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
              <View key={k} style={[styles.corner, styles[k], { borderColor: c.chart1 }]} />
            ))}
          </View>
          <Text variant="small" tone="inverse" align="center" style={styles.hint}>
            {reading ? 'Reading the note on this phone…' : 'Fit the whole note in the frame, flat and in good light'}
          </Text>
        </View>

        {problem && (
          <View style={[styles.problem, { backgroundColor: c.surface }]}>
            <Text variant="small" tone="secondary">
              {problem}
            </Text>
            <View style={styles.problemActions}>
              <Button label="Type it in" icon={Keyboard} variant="ghost" size="sm" onPress={() => manual()} />
              <Button label="Try again" icon={Camera} size="sm" onPress={() => { setPhoto(null); setProblem(null); }} />
            </View>
          </View>
        )}

        {!ocr && !photo && (
          <View style={[styles.problem, { backgroundColor: c.surface }]}>
            <Text variant="small" tone="secondary">
              Reading notes needs the installed app (not Expo Go or the browser). You can still photograph it for reference and type the lines in.
            </Text>
          </View>
        )}

        <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.five }]}>
          <RoundButton label="Choose a photo" onPress={() => void pick()} disabled={reading}>
            <ImageIcon size={22} color="#fff" />
          </RoundButton>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            disabled={reading || !!photo}
            onPress={() => void shoot()}
            style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.94 }] }]}>
            <View style={[styles.shutterInner, { backgroundColor: c.primary }]}>
              {reading ? <ActivityIndicator color="#fff" /> : <ScanLine size={30} color="#fff" />}
            </View>
          </Pressable>
          <RoundButton label="Type the lines in" onPress={() => manual()} disabled={reading}>
            <Keyboard size={22} color="#fff" />
          </RoundButton>
        </View>
      </View>
    </View>
  );
}

function TopBar({ title, dark }: { title: string; dark: boolean }) {
  return (
    <View style={styles.topBar}>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={[styles.round, !dark && { backgroundColor: 'rgba(10,15,28,0.08)' }]}>
        <X size={22} color={dark ? '#fff' : '#0a0f1c'} />
      </Pressable>
      <Text variant="heading" tone={dark ? 'inverse' : 'default'}>
        {title}
      </Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

function RoundButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.round, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      {children}
    </Pressable>
  );
}

const CORNER = 26;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  round: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.six,
    gap: Spacing.four,
  },
  frame: {
    width: '100%',
    maxWidth: 420,
    aspectRatio: 0.72,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
  },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: Radius.lg },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: Radius.lg },
  bl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: Radius.lg },
  br: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: Radius.lg },
  hint: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(10,15,28,0.6)',
    overflow: 'hidden',
  },
  problem: {
    marginHorizontal: Spacing.five,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    gap: Spacing.three,
  },
  problemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: Spacing.five,
    backgroundColor: 'rgba(10,15,28,0.55)',
  },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
