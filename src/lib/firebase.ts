import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// CRITICAL: The app will break without the firestoreDatabaseId in initializeFirestore
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
    // Campos vacíos (undefined) se omiten en vez de provocar error al guardar (p. ej. RUT auxiliar opcional)
    ignoreUndefinedProperties: true,
  },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);

