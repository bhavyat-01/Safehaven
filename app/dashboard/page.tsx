/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  authProvider: string;
  location?: { lat: number; lng: number };
  locationConsent?: boolean;
}

export default function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConsent, setShowConsent] = useState(false);
  const [trackingActive, setTrackingActive] = useState(false);
  const [lastSync, setLastSync] = useState<string>("");
  
  const router = useRouter();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserProfile;
          setProfile(userData);
          
          if (userData.locationConsent) {
            startTracking(user.uid);
          } else {
            setShowConsent(true);
          }
        }
      } else {
        router.push("/login");
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      stopTracking();
    };
  }, [router]);

  const startTracking = (uid: string) => {
    if (intervalRef.current) return;
    setTrackingActive(true);
    setShowConsent(false);

    const updateLocation = () => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const newLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
            try {
              const userRef = doc(db, "users", uid);
              const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              await updateDoc(userRef, { location: newLocation, lastSeen: now });
              setProfile((prev) => prev ? { ...prev, location: newLocation } : null);
              setLastSync(now);
            } catch (e) { console.error("Update error:", e); }
          },
          (err) => console.warn("Location access denied"),
          { enableHighAccuracy: true }
        );
      }
    };

    updateLocation(); 
    intervalRef.current = setInterval(updateLocation, 20000);
  };

  const stopTracking = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTrackingActive(false);
  };

  const toggleLocation = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const newStatus = !trackingActive;
    try {
      await updateDoc(doc(db, "users", user.uid), { locationConsent: newStatus });
      if (newStatus) startTracking(user.uid);
      else {
        stopTracking();
        setProfile(prev => prev ? { ...prev, location: undefined } : null);
      }
    } catch (e) { console.error(e); }
  };

  const handleConsent = async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        await updateDoc(doc(db, "users", user.uid), { locationConsent: true });
        startTracking(user.uid);
      } catch (e) { console.error(e); }
    }
  };

  const handleLogout = async () => {
    stopTracking();
    await signOut(auth);
    router.push("/login");
  };

  if (loading) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={styles.container}>
      {/* Simplified Consent Modal */}
      {showConsent && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <p style={styles.consentText}>
              Do you consent to sharing your current location while on the website?
            </p>
            <div style={styles.modalActions}>
              <button onClick={() => setShowConsent(false)} style={styles.declineBtn}>Not Now</button>
              <button onClick={handleConsent} style={styles.consentBtn}>I Consent</button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.profileCard}>
        <div style={styles.topActions}>
          <div style={styles.switchWrapper}>
             <span style={styles.switchLabel}>{trackingActive ? "Live" : "Off"}</span>
             <div 
               style={{...styles.switchBase, backgroundColor: trackingActive ? "#000" : "#ccc"}} 
               onClick={toggleLocation}
             >
                <div style={{...styles.switchThumb, left: trackingActive ? "22px" : "2px"}}></div>
             </div>
          </div>
        </div>

        <div style={styles.header}>
          <div style={styles.avatar}>{profile?.firstName?.[0]}{profile?.lastName?.[0]}</div>
          <h1 style={styles.name}>{profile?.firstName} {profile?.lastName}</h1>
          {trackingActive && (
             <div style={styles.liveTag}><span style={styles.dot}></span> Tracking Active ({lastSync})</div>
          )}
        </div>

        {profile?.location && trackingActive ? (
          <div style={styles.mapBox}>
            <iframe
              width="100%" height="160" style={{ border: 0, borderRadius: "16px" }}
              srcDoc={`<style>html,body{margin:0;overflow:hidden;}</style>
              <iframe width="100%" height="100%" frameborder="0" src="https://maps.google.com/maps?q=${profile.location.lat},${profile.location.lng}&z=14&output=embed"></iframe>`}
            />
          </div>
        ) : (
          <div style={styles.noLocation}>Location tracking is off</div>
        )}

        <div style={styles.infoSection}>
          <div style={styles.infoRow}>
            <label style={styles.label}>Email</label>
            <p style={styles.value}>{profile?.email}</p>
          </div>
          <div style={styles.infoRow}>
            <label style={styles.label}>Phone</label>
            <p style={styles.value}>{profile?.phone}</p>
          </div>
        </div>

        <button onClick={handleLogout} style={styles.logoutBtn}>Sign Out</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: "#0a0a0a", padding: "20px", fontFamily: "sans-serif" },
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  modal: { backgroundColor: "#fff", padding: "30px", borderRadius: "20px", maxWidth: "320px", textAlign: "center", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" },
  consentText: { color: "#000", fontSize: "1rem", fontWeight: 500, lineHeight: "1.5", margin: "0 0 20px 0" },
  modalActions: { display: "flex", gap: "10px" },
  consentBtn: { flex: 1, padding: "12px", borderRadius: "10px", border: "none", backgroundColor: "#000", color: "#fff", fontWeight: 700, cursor: "pointer" },
  declineBtn: { flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid #ddd", backgroundColor: "#fff", color: "#000", fontWeight: 600, cursor: "pointer" },
  profileCard: { position: "relative", backgroundColor: "#fff", width: "100%", maxWidth: "400px", borderRadius: "24px", padding: "40px", textAlign: "center" },
  topActions: { position: "absolute", top: "25px", right: "25px" },
  switchWrapper: { display: "flex", alignItems: "center", gap: "8px" },
  switchLabel: { fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", color: "#bbb" },
  switchBase: { width: "44px", height: "24px", borderRadius: "12px", position: "relative", cursor: "pointer", transition: "0.3s" },
  switchThumb: { width: "20px", height: "20px", backgroundColor: "#fff", borderRadius: "50%", position: "absolute", top: "2px", transition: "0.3s" },
  header: { marginBottom: "25px", display: "flex", flexDirection: "column", alignItems: "center" },
  avatar: { width: "65px", height: "65px", backgroundColor: "#000", color: "#fff", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "1.2rem", fontWeight: "bold", marginBottom: "12px", textTransform: "uppercase" },
  name: { fontSize: "1.5rem", fontWeight: 800, color: "#000", margin: 0 },
  liveTag: { fontSize: "0.7rem", color: "#2e7d32", fontWeight: 700, marginTop: "8px", display: "flex", alignItems: "center", gap: "5px" },
  dot: { width: "6px", height: "6px", backgroundColor: "#2e7d32", borderRadius: "50%" },
  mapBox: { marginBottom: "25px" },
  noLocation: { padding: "20px", backgroundColor: "#f5f5f5", borderRadius: "16px", color: "#999", fontSize: "0.85rem", marginBottom: "25px" },
  infoSection: { textAlign: "left", borderTop: "1px solid #eee", paddingTop: "25px", marginBottom: "25px" },
  infoRow: { marginBottom: "15px" },
  label: { fontSize: "0.7rem", color: "#aaa", fontWeight: 700, textTransform: "uppercase" },
  value: { fontSize: "0.95rem", color: "#000", fontWeight: 500, margin: "2px 0 0 0" },
  logoutBtn: { width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid #eee", backgroundColor: "#fff", fontWeight: 700, cursor: "pointer", color: "#ff4444" },
  loading: { height: "100vh", backgroundColor: "#0a0a0a", color: "#fff", display: "flex", justifyContent: "center", alignItems: "center" }
};