import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { getItemImageUrl } from './garmentVision';

export async function mirrorItemImage(serviceItemId: string): Promise<string> {
  const sourceUrl = getItemImageUrl(serviceItemId);
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return sourceUrl;
    const blob = await res.blob();
    const storageRef = ref(storage, `inventory/${serviceItemId}/image.jpg`);
    await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
    return getDownloadURL(storageRef);
  } catch {
    return sourceUrl;
  }
}
