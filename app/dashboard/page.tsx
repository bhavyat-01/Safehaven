/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, onSnapshot } from "firebase/firestore";
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

interface Threat {
  id: string;
  explanation: string;
  score: number;
  threat_detected: boolean;
  last_seen: number;
  confirms?: number;
  denies?: number;
  resolved?: boolean;
  voters?: Record<string, 'confirm' | 'deny'>;
  start_time?: any;
  metadata?: { camera?: { lat: number; lng: number; location: string } };
  images?: string[]; // <-- add this
}
const getDistanceInMiles = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 3958.8; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConsent, setShowConsent] = useState(false);
  const [trackingActive, setTrackingActive] = useState(false);
  const [lastSync, setLastSync] = useState<string>("");
  
  const router = useRouter();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserProfile;
          setProfile(userData);
          if (userData.locationConsent) startTracking(user.uid);
          else setShowConsent(true);
        }
      } else {
        router.push("/login");
      }
      setLoading(false);
    });

    const unsubscribeThreats = onSnapshot(collection(db, "threats"), (snapshot) => {
      const threatData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Threat[];
      
      const sorted = threatData.sort((a, b) => {
        const timeA = a.start_time?.seconds || a.last_seen || 0;
        const timeB = b.start_time?.seconds || b.last_seen || 0;
        return timeB - timeA;
      });
      setThreats(sorted);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeThreats();
      stopTracking();
    };
  }, [router]);

  const nearbyThreats = useMemo(() => {
    return threats.filter(threat => {
      const userLoc = profile?.location;
      const cam = threat.metadata?.camera;
      if (!userLoc?.lat || !userLoc?.lng || !cam?.lat || !cam?.lng) return false;
      const dist = getDistanceInMiles(userLoc.lat, userLoc.lng, cam.lat, cam.lng);
      return dist <= 5; 
    });
  }, [threats, profile?.location]);

  const handleVote = async (threatId: string, type: 'confirm' | 'deny') => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const threat = threats.find(t => t.id === threatId);
    if (!threat || threat.resolved) return;

    const currentVoters = threat.voters || {};
    const previousVote = currentVoters[userId];

    if (previousVote === type) return;

    let newConfirms = threat.confirms || 0;
    let newDenies = threat.denies || 0;

    // Adjust counts based on swap
    if (previousVote === 'confirm') newConfirms = Math.max(0, newConfirms - 1);
    if (previousVote === 'deny') newDenies = Math.max(0, newDenies - 1);

    if (type === 'confirm') newConfirms++;
    if (type === 'deny') newDenies++;

    const totalVotes = newConfirms + newDenies;
    const shouldResolve = totalVotes >= 10 && (newDenies / totalVotes) >= 0.75;
    const newScore = totalVotes > 0 ? Math.round((newConfirms / totalVotes) * 10) : threat.score;

    try {
      await updateDoc(doc(db, "threats", threatId), {
        confirms: newConfirms,
        denies: newDenies,
        score: newScore,
        resolved: shouldResolve,
        [`voters.${userId}`]: type
      });
    } catch (e) {
      console.error("Voting error:", e);
    }
  };

  const startTracking = (uid: string) => {
    if (intervalRef.current) return;
    setTrackingActive(true);
    const updateLocation = () => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const newLoc = { lat: position.coords.latitude, lng: position.coords.longitude };
            try {
              const userRef = doc(db, "users", uid);
              const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              await updateDoc(userRef, { location: newLoc, lastSeen: now });
              setProfile((prev) => prev ? { ...prev, location: newLoc } : null);
              setLastSync(now);
            } catch (e) { console.error(e); }
          },
          null, { enableHighAccuracy: true }
        );
      }
    };
    updateLocation(); 
    intervalRef.current = setInterval(updateLocation, 12000);
  };

  const stopTracking = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
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

  const handleLogout = async () => {
    stopTracking();
    await signOut(auth);
    router.push("/login");
  };

  if (loading) return <div style={styles.loading}>Establishing Secure Link...</div>;

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      <div style={styles.dashboardGrid}>
        {/* LEFT COLUMN: PROFILE (Now on the left) */}
        <div style={styles.leftColumn}>
          <div style={styles.profileCard}>
            <div style={styles.topActions}>
              <div style={styles.switchWrapper} onClick={toggleLocation}>
                 <span style={styles.switchLabel}>{trackingActive ? "ON" : "OFF"}</span>
                 <div style={{...styles.switchBase, backgroundColor: trackingActive ? "#2e7d32" : "#ccc"}}>
                    <div style={{...styles.switchThumb, left: trackingActive ? "22px" : "2px"}}></div>
                 </div>
              </div>
            </div>

            <div style={styles.header}>
              <div style={styles.avatar}>{profile?.firstName?.[0]}</div>
              <h1 style={styles.name}>{profile?.firstName} {profile?.lastName}</h1>
              {trackingActive && (
                 <div style={styles.liveTag}>Monitoring Area ({lastSync})</div>
              )}
            </div>

            <div style={styles.infoSection}>
               <div style={styles.infoRow}><label style={styles.label}>Email</label><p style={styles.value}>{profile?.email}</p></div>
               <div style={styles.infoRow}><label style={styles.label}>Phone</label><p style={styles.value}>{profile?.phone}</p></div>
            </div>

            {profile?.location && trackingActive && (
              <div style={styles.mapBox}>
                <iframe width="100%" height="220" style={{ border: 0, borderRadius: "20px" }}
                  src={`https://maps.google.com/maps?q=${profile.location.lat},${profile.location.lng}&z=15&output=embed`}
                />
              </div>
            )}
            
            <button onClick={handleLogout} style={styles.logoutBtn}>Sign Out</button>
          </div>
        </div>

        {/* RIGHT COLUMN: THREATS (Now on the right) */}
        <div style={styles.rightColumn}>
          <div style={styles.threatCard}>
            <div style={styles.threatHeader}>
              <h2 style={styles.threatTitle}>Nearby Monitor</h2>
              <span style={styles.threatCount}>{nearbyThreats.length} Active</span>
            </div>
            
            <div style={styles.threatList}>
              {nearbyThreats.map((threat) => {
                const userVote = threat.voters?.[auth.currentUser?.uid || ""];
                return (
                  <div
                    key={threat.id}
                    style={{
                      ...styles.threatItem,
                      animation: 'slideIn 0.3s ease-out',
                      opacity: threat.resolved ? 0.6 : 1
                    }}
                  >
                    {/* Severity Indicator */}
                    <div
                      style={{
                        ...styles.severityIndicator,
                        backgroundColor: threat.resolved
                          ? '#444'
                          : threat.score >= 7
                            ? '#ff4444'
                            : threat.score >= 4
                              ? '#ffbb33'
                              : '#00C851'
                      }}
                    />

                    {/* Threat Content */}
                    <div style={styles.threatContent}>
                      {/* Header */}
                      <div style={styles.threatTop}>
                        <span
                          style={{
                            ...styles.threatType,
                            color: threat.resolved
                              ? '#888'
                              : threat.score >= 7
                                ? '#ff4444'
                                : threat.score >= 4
                                  ? '#ffbb33'
                                  : '#00C851'
                          }}
                        >
                          {threat.resolved
                            ? "Resolved / Archived"
                            : threat.score >= 7
                              ? "High Priority"
                              : threat.score >= 4
                                ? "Medium Priority"
                                : "Low Priority"}
                        </span>
                      </div>

                      {/* Explanation */}
                      <p style={styles.threatDesc}>{threat.explanation}</p>
                      <p style={styles.threatSubText}>📍 {threat.metadata?.camera?.location}</p>

                      {/* Images */}
                      {threat.images && threat.images.length > 0 && (
                        <div style={{
                          display: 'flex',
                          gap: '10px',
                          overflowX: 'auto',
                          marginTop: '12px'
                        }}>
                          {threat.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={`http://localhost:5000/screenshots/${threat.id}/${img}`}
                              alt={`Threat ${threat.id} screenshot ${idx + 1}`}
                              style={{ height: '120px', borderRadius: '12px', objectFit: 'cover', marginRight: '8px' }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Voting */}
                      {!threat.resolved && (
                        <>
                          <div style={styles.voteContainer}>
                            <button
                              onClick={() => handleVote(threat.id, 'confirm')}
                              style={{
                                ...styles.confirmBtn,
                                opacity: userVote === 'deny' ? 0.4 : 1,
                                filter: userVote === 'deny' ? 'grayscale(1)' : 'none',
                                border: userVote === 'confirm' ? '3px solid #fff' : 'none'
                              }}
                            >
                              Confirm {threat.confirms || 0}
                            </button>
                            <button
                              onClick={() => handleVote(threat.id, 'deny')}
                              style={{
                                ...styles.denyBtn,
                                opacity: userVote === 'confirm' ? 0.4 : 1,
                                filter: userVote === 'confirm' ? 'grayscale(1)' : 'none',
                                border: userVote === 'deny' ? '3px solid #fff' : 'none'
                              }}
                            >
                              Deny {threat.denies || 0}
                            </button>
                          </div>
                          <p style={styles.voteInstruction}>
                            Click confirm if you witnessed the threat or deny if you did not see it.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* No threats */}
              {nearbyThreats.length === 0 && (
                <div style={styles.emptyThreats}>
                  <p>{trackingActive ? "Monitoring for entries within 5 miles..." : "Enable location to view local activity."}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", backgroundColor: "#0a0a0a", padding: "40px", fontFamily: "sans-serif", display: "flex", justifyContent: "center", alignItems: "center" },
  dashboardGrid: { display: "flex", gap: "40px", width: "100%", maxWidth: "1400px", height: "85vh" },
  leftColumn: { flex: "1", minWidth: "400px", height: "100%", display: "flex", alignItems: "center" },
  rightColumn: { flex: "1.8", height: "100%" },
  profileCard: { position: "relative", backgroundColor: "#fff", borderRadius: "32px", padding: "50px", width: "100%", display: "flex", flexDirection: "column", boxShadow: "0 15px 40px rgba(0,0,0,0.6)", justifyContent: "center" },
  topActions: { position: "absolute", top: "30px", right: "30px" },
  header: { marginBottom: "35px", textAlign: "center" },
  avatar: { width: "100px", height: "100px", backgroundColor: "#000", color: "#fff", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "2.5rem", fontWeight: "bold", margin: "0 auto 20px" },
  name: { fontSize: "2.2rem", fontWeight: 800, color: "#000", margin: 0 },
  liveTag: { fontSize: "1rem", color: "#2e7d32", fontWeight: 700, marginTop: "12px" },
  mapBox: { marginTop: "20px", marginBottom: "20px" },
  infoSection: { textAlign: "center", borderTop: "2px solid #eee", borderBottom: "2px solid #eee", padding: "30px 0", margin: "20px 0" },
  infoRow: { marginBottom: "20px" },
  label: { fontSize: "0.85rem", color: "#aaa", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" },
  value: { fontSize: "1.2rem", color: "#000", fontWeight: 600 },
  logoutBtn: { width: "100%", padding: "18px", borderRadius: "18px", border: "2px solid #eee", backgroundColor: "#fff", fontWeight: 800, cursor: "pointer", color: "#ff4444", fontSize: "1.1rem" },
  threatCard: { backgroundColor: "#111", borderRadius: "32px", padding: "40px", height: "100%", display: "flex", flexDirection: "column", border: "1px solid #222" },
  threatHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" },
  threatTitle: { color: "#fff", margin: 0, fontSize: "2rem", fontWeight: 800 },
  threatCount: { backgroundColor: "#ff4444", color: "#fff", padding: "8px 20px", borderRadius: "30px", fontSize: "1rem", fontWeight: 900 },
  threatList: { overflowY: "auto", flex: 1, paddingRight: "10px" },
  threatItem: { display: "flex", backgroundColor: "#1a1a1a", borderRadius: "24px", padding: "30px", marginBottom: "20px", border: "1px solid #2a2a2a" },
  severityIndicator: { width: "8px", borderRadius: "8px", marginRight: "25px" },
  threatContent: { flex: 1 },
  threatTop: { marginBottom: "12px" },
  threatType: { fontWeight: 800, fontSize: "1.2rem", textTransform: "uppercase" },
  threatDesc: { color: "#eee", fontSize: "1.25rem", margin: "0 0 15px 0", lineHeight: "1.6", fontWeight: 400 },
  threatSubText: { color: "#888", fontSize: "1rem", margin: 0, fontStyle: "italic" },
  voteContainer: { display: 'flex', gap: '15px', marginTop: '20px' },
  confirmBtn: { flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#00C851', color: '#fff', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', transition: '0.3s' },
  denyBtn: { flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#ff4444', color: '#fff', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer', transition: '0.3s' },
  voteInstruction: { color: "#666", fontSize: "0.9rem", fontStyle: "italic", marginTop: "12px", textAlign: "left" },
  emptyThreats: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", textAlign: "center", fontSize: "1.2rem" },
  switchWrapper: { display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" },
  switchLabel: { fontSize: "0.9rem", fontWeight: 800, color: "#bbb" },
  switchBase: { width: "50px", height: "28px", borderRadius: "14px", position: "relative" },
  switchThumb: { width: "24px", height: "24px", backgroundColor: "#fff", borderRadius: "50%", position: "absolute", top: "2px", transition: "0.2s" },
  loading: { height: "100vh", backgroundColor: "#0a0a0a", color: "#fff", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "1.5rem" }
};