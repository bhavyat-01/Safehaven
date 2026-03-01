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
  videos?: string[];
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

const TOTAL_VOTERS_LIMIT = 2;
const RATIO_NEEDED = 0.5;

export default function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackingActive, setTrackingActive] = useState(false);
  const [lastSync, setLastSync] = useState<string>("");
  const [activeVideoIndex, setActiveVideoIndex] = useState<Record<string, number>>({});

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
        }
      } else {
        router.push("/login");
      }
      setLoading(false);
    });

    const unsubscribeThreats = onSnapshot(collection(db, "threats"), (snapshot) => {
      console.log("Snapshot fired, docs:", snapshot.docs.length);
      const threatData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Threat[];

      const sorted = [...threatData].sort((a, b) => {
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

  const activeCount = nearbyThreats.filter(t => !t.resolved).length;

  const handleVote = async (threatId: string, type: 'confirm' | 'deny') => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const threatRef = doc(db, "threats", threatId);
    const freshDoc = await getDoc(threatRef);
    if (!freshDoc.exists()) return;

    const threat = freshDoc.data() as Threat;
    if (threat.resolved) return;

    const currentVoters = threat.voters || {};
    const previousVote = currentVoters[userId];
    if (previousVote === type) return;

    let newConfirms = threat.confirms || 0;
    let newDenies = threat.denies || 0;

    if (previousVote === 'confirm') newConfirms = Math.max(0, newConfirms - 1);
    if (previousVote === 'deny') newDenies = Math.max(0, newDenies - 1);

    if (type === 'confirm') newConfirms++;
    if (type === 'deny') newDenies++;

    const totalVotes = newConfirms + newDenies;
    const shouldResolve = totalVotes >= TOTAL_VOTERS_LIMIT && (newDenies / totalVotes) >= RATIO_NEEDED;
    const newScore = totalVotes > 0 ? Math.round((newConfirms / totalVotes) * 10) : threat.score;

    try {
      await updateDoc(threatRef, {
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
        {/* LEFT COLUMN */}
        <div style={styles.leftColumn}>
          <div style={styles.profileCard}>
            <div style={styles.topActions}>
              <div style={styles.switchWrapper} onClick={toggleLocation}>
                <span style={styles.switchLabel}>{trackingActive ? "ON" : "OFF"}</span>
                <div style={{ ...styles.switchBase, backgroundColor: trackingActive ? "#2e7d32" : "#ccc" }}>
                  <div style={{ ...styles.switchThumb, left: trackingActive ? "22px" : "2px" }}></div>
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

        {/* RIGHT COLUMN */}
        <div style={styles.rightColumn}>
          <div style={styles.threatCard}>
            <div style={styles.threatHeader}>
              <h2 style={styles.threatTitle}>Nearby Monitor</h2>
              <span style={styles.threatCount}>{activeCount} Active</span>
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
                      opacity: threat.resolved ? 0.5 : 1,
                      backgroundColor: threat.resolved ? '#141414' : '#1a1a1a',
                      border: threat.resolved ? '1px solid #1e1e1e' : '1px solid #2a2a2a',
                      filter: threat.resolved ? 'grayscale(1)' : 'none',
                      pointerEvents: threat.resolved ? 'none' : 'auto',
                    }}
                  >
                    {/* Severity Indicator */}
                    <div
                      style={{
                        ...styles.severityIndicator,
                        backgroundColor: threat.resolved
                          ? '#444'
                          : threat.score >= 7 ? '#ff4444'
                          : threat.score >= 4 ? '#ffbb33'
                          : '#00C851'
                      }}
                    />

                    {/* Threat Content */}
                    <div style={styles.threatContent}>
                      <div style={styles.threatTop}>
                        <span
                          style={{
                            ...styles.threatType,
                            color: threat.resolved
                              ? '#888'
                              : threat.score >= 7 ? '#ff4444'
                              : threat.score >= 4 ? '#ffbb33'
                              : '#00C851'
                          }}
                        >
                          {threat.resolved
                            ? "Resolved / Archived"
                            : threat.score >= 7 ? "High Priority"
                            : threat.score >= 4 ? "Medium Priority"
                            : "Low Priority"}
                        </span>
                      </div>

                      <p style={styles.threatDesc}>{threat.explanation}</p>
                      <p style={styles.threatSubText}>📍 {threat.metadata?.camera?.location}</p>

                      {/* Videos */}
                      {threat.videos && threat.videos.length > 0 && (
                        <div style={{ position: 'relative', marginTop: '12px' }}>
                          {threat.videos.map((clip, idx) => (
                            <video
                              key={clip}  // stable key — never changes
                              src={`http://localhost:5000/clips/${threat.id}/${clip}`}
                              controls
                              muted
                              style={{
                                width: '100%',
                                height: 'auto',
                                borderRadius: '12px',
                                backgroundColor: '#000',
                                display: idx === (activeVideoIndex[threat.id] || 0) ? 'block' : 'none'  // show/hide only
                              }}

                            />
                          ))}

                          {/* Dot indicators */}
                          {threat.videos.length > 1 && (
                            <div style={{
                              display: 'flex',
                              justifyContent: 'center',
                              gap: '6px',
                              marginTop: '8px'
                            }}>
                              {threat.videos.map((_, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => setActiveVideoIndex(prev => ({ ...prev, [threat.id]: idx }))}
                                  style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    backgroundColor: idx === (activeVideoIndex[threat.id] || 0) ? '#fff' : '#888',
                                    cursor: 'pointer',
                                    transition: '0.2s'
                                  }}
                                />
                              ))}
                            </div>
                          )}
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
  container: { minHeight: "100vh", backgroundColor: "#0a0a0a", padding: "20px", fontFamily: "sans-serif", display: "flex", justifyContent: "center", alignItems: "flex-start" },
  dashboardGrid: { display: "flex", gap: "30px", width: "100%", maxWidth: "1600px", minHeight: "auto", flexWrap: "wrap" },
  leftColumn: { flex: "1 1 350px", display: "flex", justifyContent: "center", marginBottom: "20px" },
  rightColumn: { flex: "2 1 600px", marginBottom: "20px" },
  profileCard: { position: "relative", backgroundColor: "#fff", borderRadius: "24px", padding: "30px", width: "100%", display: "flex", flexDirection: "column", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", justifyContent: "center" },
  topActions: { position: "absolute", top: "20px", right: "20px" },
  header: { marginBottom: "25px", textAlign: "center" },
  avatar: { width: "80px", height: "80px", backgroundColor: "#000", color: "#fff", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "2rem", fontWeight: "bold", margin: "0 auto 15px" },
  name: { fontSize: "1.8rem", fontWeight: 800, color: "#000", margin: 0 },
  liveTag: { fontSize: "0.9rem", color: "#2e7d32", fontWeight: 700, marginTop: "10px" },
  mapBox: { marginTop: "15px", marginBottom: "15px", borderRadius: "16px", overflow: "hidden" },
  infoSection: { textAlign: "center", borderTop: "1.5px solid #eee", borderBottom: "1.5px solid #eee", padding: "20px 0", margin: "15px 0" },
  infoRow: { marginBottom: "15px" },
  label: { fontSize: "0.8rem", color: "#aaa", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" },
  value: { fontSize: "1.1rem", color: "#000", fontWeight: 600 },
  logoutBtn: { width: "100%", padding: "14px", borderRadius: "12px", border: "2px solid #eee", backgroundColor: "#fff", fontWeight: 800, cursor: "pointer", color: "#ff4444", fontSize: "1rem" },
  threatCard: { backgroundColor: "#111", borderRadius: "24px", padding: "30px", height: "100%", display: "flex", flexDirection: "column", border: "1px solid #222" },
  threatHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", flexWrap: "wrap" },
  threatTitle: { color: "#fff", margin: 0, fontSize: "1.8rem", fontWeight: 800 },
  threatCount: { backgroundColor: "#ff4444", color: "#fff", padding: "6px 16px", borderRadius: "25px", fontSize: "0.9rem", fontWeight: 900, marginTop: "5px" },
  threatList: { overflowY: "auto", flex: 1, paddingRight: "10px" },
  threatItem: { display: "flex", backgroundColor: "#1a1a1a", borderRadius: "20px", padding: "20px", marginBottom: "15px", border: "1px solid #2a2a2a" },
  severityIndicator: { width: "6px", borderRadius: "8px", marginRight: "20px", flexShrink: 0 },
  threatContent: { flex: 1, minWidth: 0 },
  threatTop: { marginBottom: "10px" },
  threatType: { fontWeight: 800, fontSize: "1.1rem", textTransform: "uppercase" },
  threatDesc: { color: "#eee", fontSize: "1.1rem", margin: "0 0 12px 0", lineHeight: "1.5", fontWeight: 400 },
  threatSubText: { color: "#888", fontSize: "0.9rem", margin: 0, fontStyle: "italic" },
  voteContainer: { display: 'flex', gap: '12px', marginTop: '15px' },
  confirmBtn: { flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#00C851', color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', transition: '0.3s' },
  denyBtn: { flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#ff4444', color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', transition: '0.3s' },
  voteInstruction: { color: "#666", fontSize: "0.85rem", fontStyle: "italic", marginTop: "10px", textAlign: "left" },
  emptyThreats: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", textAlign: "center", fontSize: "1rem" },
  switchWrapper: { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" },
  switchLabel: { fontSize: "0.8rem", fontWeight: 800, color: "#bbb" },
  switchBase: { width: "45px", height: "24px", borderRadius: "12px", position: "relative" },
  switchThumb: { width: "20px", height: "20px", backgroundColor: "#fff", borderRadius: "50%", position: "absolute", top: "2px", transition: "0.2s" },
  loading: { height: "100vh", backgroundColor: "#0a0a0a", color: "#fff", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "1.5rem" }
};