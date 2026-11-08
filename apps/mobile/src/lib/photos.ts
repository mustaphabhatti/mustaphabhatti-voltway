import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { api } from './api';

/** Let the driver take or choose a photo; returns a local asset or null. */
export async function pickPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  return new Promise((resolve) => {
    Alert.alert('Add a photo', undefined, [
      { text: 'Take photo', onPress: async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return resolve(null);
        const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
        resolve(r.canceled ? null : r.assets[0]);
      } },
      { text: 'Choose from library', onPress: async () => {
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
        resolve(r.canceled ? null : r.assets[0]);
      } },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

export async function uploadStationPhoto(stationId: string, asset: ImagePicker.ImagePickerAsset, checkinId?: string) {
  const fd = new FormData();
  if (checkinId) fd.append('checkinId', checkinId);
  fd.append('file', { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: asset.mimeType ?? 'image/jpeg' } as any);
  return api.post(`/stations/${stationId}/photos`, fd);
}
