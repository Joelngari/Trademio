import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setLoading(true);
      if (authUser) {
        setUser(authUser);
        
        // Use a snapshot listener for real-time updates (like suspension)
        const profileRef = doc(db, 'users', authUser.uid);
        const unsubProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data());
          } else {
            // Profile doesn't exist yet, set empty profile but don't error
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.warn("Error fetching profile:", error);
          // Set profile to null but keep user logged in
          // This prevents infinite loops on permission errors
          setProfile(null);
          setLoading(false);
        });

        return () => unsubProfile();
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const value = {
    user,
    profile,
    role: profile?.role || null,
    status: profile?.status || 'active',
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
