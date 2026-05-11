import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { doc, getDoc, setDoc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export type Role = 'super_admin' | 'organization' | 'personal_user';

export interface User {
  id: string; // The username/id
  password?: string;
  role: Role;
  name: string;
  organizationId?: string; // For personal users belonging to an org
  maxMembers?: number; // For organizations
  expiryDate?: number; // Timestamp of when the account expires
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (id: string, pass: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => false,
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

const testConnection = async () => {
    // ચેક કરો કે યુઝરે Config અપડેટ કર્યું છે કે નહીં
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
        throw new Error("Firebase is not configured. Please update firebase-applet-config.json with your actual API keys.");
    }

    try {
        // 5 સેકન્ડનો ટાઈમઆઉટ આપો જેથી એપ્લિકેશન લટકતી ન રહે
        const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Firebase connection timeout. Check your internet or config.")), 5000)
        );
        await Promise.race([
            getDocFromServer(doc(db, 'test', 'connection')),
            timeout
        ]);
    } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration: client is offline.");
            throw new Error("Unable to connect to Firebase. Please check your internet connection.");
        }
        // If it's another error (like "not found"), it means it's online, so we are good.
    }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Seed default users if they don't exist
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
      try {
        await testConnection();
        await seedUsers();
      } catch (e) {
        console.error("Initialization error:", e);
        setLoading(false);
        return;
      }
      
      const saved = localStorage.getItem('currentUser');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Re-fetch to check if deleted/expired
          const uDoc = await getDoc(doc(db, 'users', parsed.id));
          if (uDoc.exists()) {
            const data = uDoc.data() as User;
            let isExpired = false;
            
            if (data.expiryDate && data.expiryDate < Date.now()) {
               isExpired = true;
            } else if (data.organizationId) {
               const orgDoc = await getDoc(doc(db, 'users', data.organizationId));
               if (orgDoc.exists() && orgDoc.data()?.expiryDate && orgDoc.data().expiryDate < Date.now()) {
                  isExpired = true;
               }
            }

            if (isExpired) {
               alert("Your account or organization has expired. Please contact support.");
               localStorage.removeItem('currentUser');
            } else {
               setUser(data);
            }
          } else {
            localStorage.removeItem('currentUser');
          }
        } catch (e) {
          localStorage.removeItem('currentUser');
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async (id: string, pass: string) => {
    try {
      await testConnection();
      const snap = await getDoc(doc(db, 'users', id));
      if (snap.exists()) {
        const u = snap.data() as User;
        if (u.password === pass) {
          if (u.expiryDate && u.expiryDate < Date.now()) {
            throw new Error("Account has expired.");
          }
          if (u.organizationId) {
             const orgSnap = await getDoc(doc(db, 'users', u.organizationId));
             if (orgSnap.exists()) {
                const org = orgSnap.data() as User;
                if (org.expiryDate && org.expiryDate < Date.now()) {
                   throw new Error("Organization account has expired.");
                }
             }
          }
          setUser(u);
          localStorage.setItem('currentUser', JSON.stringify(u));
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
    localStorage.removeItem('currentUser');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
