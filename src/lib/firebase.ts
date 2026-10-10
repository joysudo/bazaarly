import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAeknBowjqJNOvyqaYsA6APJy06kwg3MSc',
  authDomain: 'bazaarly-98718.firebaseapp.com',
  projectId: 'bazaarly-98718',
  storageBucket: 'bazaarly-98718.firebasestorage.app',
  messagingSenderId: '995011873930',
  appId: '1:995011873930:web:7a7d6c138605b42d0d7173',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
