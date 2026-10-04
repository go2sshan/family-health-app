import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type Picked = { uri: string; base64: string };

/** Shrink a photo so it uploads fast and stays readable; returns JPEG base64. */
export async function shrink(uri: string, maxSide = 1600, compress = 0.7, w = 0, h = 0): Promise<Picked> {
  const ctx = ImageManipulator.manipulate(uri);
  if (!w || !h || Math.max(w, h) > maxSide) {
    ctx.resize(w >= h ? { width: maxSide, height: null } : { width: null, height: maxSide });
  }
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  return { uri: saved.uri, base64: saved.base64 ?? '' };
}

/** Open the camera. Returns null if the person cancels or denies permission. */
export async function takePhoto(maxSide?: number): Promise<Picked | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera access is off. Turn it on in Settings > Family Health > Camera.');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.9 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return shrink(a.uri, maxSide, undefined, a.width, a.height);
}

/** Pick one or more photos from the library. */
export async function pickPhotos(limit = 5, maxSide?: number): Promise<Picked[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 0.9,
  });
  if (res.canceled || !res.assets) return [];
  return Promise.all(res.assets.slice(0, limit).map((a) => shrink(a.uri, maxSide, undefined, a.width, a.height)));
}
