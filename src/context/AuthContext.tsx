import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, firebaseConfigError, isFirebaseConfigured } from '../services/firebase';
import { doc, getDoc, setDoc, getDocFromServer } from 'firebase/firestore';

export type Role = 'super_admin' | 'organization' | 'personal_user';

export interface User {
  id: string;
  password?: string;
  role: Role;
  name: string;
  organizationId?: string;
  maxMembers?: number;
  expiryDate?: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: string;
  login: (id: string, pass: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  authError: '',
  login: async () => false,
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

const testConnection = async () => {
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firebase connection timeout. Check your internet or config.')), 5000)
    );

    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: client is offline.');
      throw new Error('Unable to connect to Firebase. Please check your internet connection.');
    }
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const seedUsers = async () => {
    const defaultUsers: User[] = [
      { id: 'admin', password: 'adminpass', role: 'super_admin', name: 'Super Admin', expiryDate: Date.now() + 31536000000 },
      { id: 'school_org', password: 'orgpass', role: 'organization', name: 'Global School', maxMembers: 5, expiryDate: Date.now() + 31536000000 },
      { id: 'student1', password: 'stupass', role: 'personal_user', name: 'Student One', organizationId: 'school_org', expiryDate: Date.now() + 31536000000 },
    ];

    for (const u of defaultUsers) {
      const ref = doc(db, 'users', u.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, u);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!isFirebaseConfigured) {
        setAuthError(firebaseConfigError);
        setLoading(false);
        return;
      }

      try {
        await testConnection();
        await seedUsers();
      } catch (e) {
        console.error('Initialization error:', e);
        setAuthError(e instanceof Error ? e.message : 'Unable to connect to Firebase.');
        setLoading(false);
        return;
      }

      localStorage.removeItem('currentUser');
      sessionStorage.removeItem('currentUser');

      setLoading(false);
    };

    init();
  }, []);

  const login = async (id: string, pass: string) => {
    try {
      if (!isFirebaseConfigured) {
        throw new Error(firebaseConfigError);
      }

      await testConnection();
      const snap = await getDoc(doc(db, 'users', id));
      if (snap.exists()) {
        const u = snap.data() as User;
        if (u.password === pass) {
          if (u.expiryDate && u.expiryDate < Date.now()) {
            throw new Error('Account has expired.');
          }
          if (u.organizationId) {
            const orgSnap = await getDoc(doc(db, 'users', u.organizationId));
            if (orgSnap.exists()) {
              const org = orgSnap.data() as User;
              if (org.expiryDate && org.expiryDate < Date.now()) {
                throw new Error('Organization account has expired.');
              }
            }
          }
          setUser(u);
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem('currentUser');
    localStorage.removeItem('currentUser');
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
