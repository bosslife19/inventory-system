import { Image } from 'expo-image';
import { Boxes } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlatform } from '@/lib/queries';
import type { Membership } from '@/lib/types';

/**
 * The platform's logo and name (the owner's, once uploaded) on the dark
 * hero, and the member's organization logo beside it on a white tile —
 * partner logos are made for white backgrounds.
 */
export function BrandStrip({ organization }: { organization?: Membership | null }) {
  const c = useTheme();
  const platform = usePlatform().data;

  return (
    <View style={styles.row}>
      {platform?.logo_url ? (
        <Image source={{ uri: platform.logo_url }} style={styles.logo} contentFit="contain" />
      ) : (
        <View style={[styles.logo, styles.mark, { backgroundColor: c.primary }]}>
          <Boxes size={16} color="#fff" />
        </View>
      )}
      <Text variant="label" tone="inverse" numberOfLines={1} style={{ flexShrink: 1 }}>
        {platform?.name ?? 'Stock Card'}
      </Text>
      {organization && (
        <>
          <Text variant="caption" style={{ color: '#7f8db0' }}>
            ×
          </Text>
          <View style={[styles.logo, styles.partner]}>
            {organization.logo_url ? (
              <Image source={{ uri: organization.logo_url }} style={StyleSheet.absoluteFill} contentFit="contain" />
            ) : (
              <Text variant="label" style={{ color: '#0a0f1c' }}>
                {organization.name.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>
          <Text variant="caption" numberOfLines={1} style={{ color: '#b8c3d8', flexShrink: 1 }}>
            {organization.name}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  partner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    padding: 2,
  },
});
