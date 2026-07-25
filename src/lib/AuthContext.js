import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const isMountedRef = React.useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (!isMountedRef.current) return;
      setLoading(true);
      if (authUser) {
        setUser(authUser);

        const profileRef = doc(db, 'users', authUser.uid);
        try {
          const docSnap = await getDoc(profileRef);
          if (!isMountedRef.current) return;
          setProfile(docSnap.exists() ? docSnap.data() : null);
        } catch (error) {
          if (!isMountedRef.current) return;
          console.warn('Error fetching profile:', error);
          setProfile(null);
        } finally {
          if (isMountedRef.current) {
            setLoading(false);
          }
        }
      } else {
        if (!isMountedRef.current) return;
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const value = {
    user,
    profile,
    role: profile?.role || undefined,
    status: profile?.status || 'active',
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
