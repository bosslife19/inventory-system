import { Building, LogOut } from 'lucide-react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';

/** The platform owner keeps no Stock Card: organizations are managed in the web console. */
export function OwnerNotice() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();

  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: c.bg, padding: Spacing.five, paddingBottom: insets.bottom + Spacing.five }}>
      <EmptyState
        icon={Building}
        title="Owner console is on the web"
        body="Set up organizations, their logos, plans and admins from the web dashboard. The app is for the people who keep Stock Cards.">
        <Button label="Sign out" icon={LogOut} variant="ghost" onPress={() => void signOut()} />
      </EmptyState>
    </View>
  );
}
