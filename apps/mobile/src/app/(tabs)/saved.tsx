import { FlatList, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { useLocation } from '@/lib/location';
import { useColors } from '@/lib/theme';
import { Button, Empty, ErrorView, Loading } from '@/components/ui';
import { StationCard } from '@/components/StationCard';

export default function Saved() {
  const c = useColors();
  const { me } = useAuth();
  const loc = useLocation();
  const { data, error, loading, reload } = useFetch<any>(me.user ? `/me/favorites${loc.position ? `?lat=${loc.position.lat}&lng=${loc.position.lng}` : ''}` : null, [me.user?.id, loc.position?.lat]);
  if (!me.user) return <Empty icon="heart-outline" title="Save your favorite stations" body="Get alerts about outages, price changes and peak pricing." action={<Button title="Sign in" onPress={() => router.push('/login')} />} />;
  return (
    <FlatList style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, gap: 10 }} data={data?.stations ?? []} keyExtractor={(s) => s.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => reload()} />}
      ListEmptyComponent={error ? <ErrorView error={error} onRetry={() => reload()} /> : loading ? <Loading /> : <Empty icon="heart-outline" title="No favorites yet" body="Tap the heart on a station to save it." />}
      renderItem={({ item }) => <StationCard s={item} />} />
  );
}
