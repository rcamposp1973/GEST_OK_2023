import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export function useUserPreferences() {
  const [moduleOrder, setModuleOrder] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const prefRef = doc(db, 'userPreferences', auth.currentUser.uid);
    const unsubscribe = onSnapshot(prefRef, (snap) => {
      if (snap.exists()) {
        setModuleOrder(snap.data().moduleOrder || {});
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [auth.currentUser]);

  const updateModuleOrder = useCallback(async (category: string, newOrder: string[]) => {
    if (!auth.currentUser) return;
    const prefRef = doc(db, 'userPreferences', auth.currentUser.uid);
    const newModuleOrder = { ...moduleOrder, [category]: newOrder };
    await setDoc(prefRef, { userId: auth.currentUser.uid, moduleOrder: newModuleOrder }, { merge: true });
    setModuleOrder(newModuleOrder);
  }, [auth.currentUser, moduleOrder]);

  return { moduleOrder, updateModuleOrder, loading };
}
