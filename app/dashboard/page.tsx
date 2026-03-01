/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Volume2 } from "lucide-react";


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

  // ✅ ELEVENLABS TTS FUNCTION

  const startEmergencyConversation = () => {
    const SpeechRecognition =
    (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
  
    const recognition = new SpeechRecognition();
  
    recognition.lang = "en-US";
    recognition.interimResults = false;
  
    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
  
      console.log("User said:", transcript);
  
      const res = await fetch("/api/dispatcher", {
        method: "POST",
        body: JSON.stringify({
          message: transcript,
          location: profile?.location,
          threats: nearbyThreats
        }),
      });
  
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
  
      const audio = new Audio(audioUrl);
      audio.play();
    };
  
    recognition.start();
  };

  if (loading) return <div style={styles.loading}>Establishing Secure Link...</div>;

  return (
    <div style={styles.container} className="dashboard-container">
      {/* Twinkling Stars Background */}
      <style>{`
        @keyframes twinkle {
          0% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 0.3; transform: scale(1); }
        }
        .stars-background {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%);
          overflow: hidden;
          z-index: 0;
        }
        .star {
          position: absolute;
          background: white;
          border-radius: 50%;
          opacity: 0.5;
          animation: twinkle var(--duration) infinite ease-in-out;
        }
        @media (max-width: 768px) {
          .dashboard-container {
            padding: 12px !important;
          }
          .profile-card, .threat-card {
            padding: 20px !important;
            border-radius: 20px !important;
          }
          .avatar-size {
            width: 72px !important;
            height: 72px !important;
            font-size: 1.8rem !important;
          }
          .name-text {
            font-size: 1.5rem !important;
          }
          .threat-title-text {
            font-size: 1.5rem !important;
          }
          .threat-desc-text {
            font-size: 1rem !important;
          }
          .top-actions-mobile {
            top: 16px !important;
            right: 16px !important;
          }
        }
        @media (max-width: 480px) {
          .dashboard-container {
            padding: 8px !important;
          }
          .profile-card, .threat-card {
            padding: 16px !important;
            border-radius: 16px !important;
          }
          .avatar-size {
            width: 64px !important;
            height: 64px !important;
            font-size: 1.5rem !important;
          }
          .name-text {
            font-size: 1.25rem !important;
          }
          .threat-title-text {
            font-size: 1.25rem !important;
          }
          .vote-container-mobile {
            flex-direction: column !important;
            gap: 10px !important;
          }
        }
        .profile-card-hover:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(27, 39, 53, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.1);
        }
        .threat-card-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(27, 39, 53, 0.12);
        }
        .button-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(27, 39, 53, 0.4);
        }
        .button-hover:active {
          transform: translateY(0);
        }
        .switch-wrapper-hover:hover {
          background: rgba(27, 39, 53, 0.08);
        }
        .speaker-btn-hover:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 20px rgba(27, 39, 53, 0.4);
        }
        .speaker-btn-hover:active {
          transform: scale(0.98);
        }
        .threat-list::-webkit-scrollbar {
          width: 8px;
        }
        .threat-list::-webkit-scrollbar-track {
          background: rgba(27, 39, 53, 0.05);
          border-radius: 10px;
        }
        .threat-list::-webkit-scrollbar-thumb {
          background: rgba(27, 39, 53, 0.2);
          border-radius: 10px;
        }
        .threat-list::-webkit-scrollbar-thumb:hover {
          background: rgba(27, 39, 53, 0.3);
        }
      `}</style>

            <div className="stars-background">
        {[...Array(70)].map((_, i) => (
          <div
            key={i}
            className="star"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 3}px`,
              height: `${Math.random() * 3}px`,
              // @ts-ignore
              "--duration": `${2 + Math.random() * 4}s`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <div style={styles.dashboardGrid}>
        {/* LEFT COLUMN */}
        <div style={styles.leftColumn}>
          <div style={styles.profileCard} className="profile-card-hover profile-card">
            <div style={styles.topActions} className="top-actions-mobile">
              <div style={styles.switchWrapper} className="switch-wrapper-hover" onClick={toggleLocation}>
                <span style={styles.switchLabel}>{trackingActive ? "ON" : "OFF"}</span>
                <div style={{ ...styles.switchBase, backgroundColor: trackingActive ? "#1B2735" : "#e0e0e0" }}>
                  <div style={{ ...styles.switchThumb, left: trackingActive ? "22px" : "2px" }}></div>
                </div>
              </div>
            </div>

            <div style={styles.header}>
              <div style={styles.avatar} className="avatar-size">{profile?.firstName?.[0]}</div>
              <h1 style={styles.name} className="name-text">{profile?.firstName} {profile?.lastName}</h1>
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
                <iframe 
                  width="100%" 
                  height="220" 
                  style={{ border: 0, borderRadius: "20px", maxWidth: "100%" }}
                  src={`https://maps.google.com/maps?q=${profile.location.lat},${profile.location.lng}&z=15&output=embed`}
                />
              </div>
            )}

            <button onClick={handleLogout} style={styles.logoutBtn} className="button-hover">Sign Out</button>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={styles.rightColumn}>
          <div style={styles.threatCard} className="threat-card-hover threat-card">
            <div style={styles.threatHeader}>
              <h2 style={styles.threatTitle} className="threat-title-text">Nearby Monitor</h2>
              <span style={styles.threatCount}>{activeCount} Active</span>
            </div>

            <div style={styles.threatList} className="threat-list">
              {nearbyThreats.map((threat) => {
                const userVote = threat.voters?.[auth.currentUser?.uid || ""];
                return (
                  <div
                    key={threat.id}
                    style={{
                      ...styles.threatItem,
                      animation: 'slideIn 0.3s ease-out',
                      opacity: threat.resolved ? 0.5 : 1,
                      backgroundColor: threat.resolved ? 'rgba(20, 30, 45, 0.15)' : 'rgba(50, 60, 75, 0.2)',
                      border: threat.resolved ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(255, 255, 255, 0.15)',
                      filter: threat.resolved ? 'grayscale(1)' : 'none',
                      pointerEvents: threat.resolved ? 'none' : 'auto',
                    }}
                  >
                    {/* ✅ SPEAKER BUTTON */}
                    <button
                      onClick={startEmergencyConversation}
                      style={styles.speakerBtn}
                      className="speaker-btn-hover"
                      title="Read threat aloud"
                    >
                       <Volume2 size={20} />
                    </button>

                    {/* Threat Content */}
                    <div style={styles.threatContent}>
                      <div style={styles.threatTop}>
                        <span
                          style={{
                            ...styles.threatType,
                            color: threat.resolved
                              ? '#9ca3af'
                              : threat.score >= 7 ? '#ef4444'
                              : threat.score >= 4 ? '#f59e0b'
                              : '#10b981',
                            background: threat.resolved
                              ? 'rgba(156, 163, 175, 0.1)'
                              : threat.score >= 7 ? 'rgba(239, 68, 68, 0.1)'
                              : threat.score >= 4 ? 'rgba(245, 158, 11, 0.1)'
                              : 'rgba(16, 185, 129, 0.1)',
                          }}
                        >
                          {threat.resolved
                            ? "Resolved / Archived"
                            : threat.score >= 7 ? "High Priority"
                            : threat.score >= 4 ? "Medium Priority"
                            : "Low Priority"}
                        </span>
                      </div>

                      <p style={styles.threatDesc} className="threat-desc-text">{threat.explanation}</p>
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
                                borderRadius: '16px',
                                backgroundColor: '#000',
                                display: idx === (activeVideoIndex[threat.id] || 0) ? 'block' : 'none',
                                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
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
                                    backgroundColor: idx === (activeVideoIndex[threat.id] || 0) ? '#1B2735' : 'rgba(27, 39, 53, 0.3)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    transform: idx === (activeVideoIndex[threat.id] || 0) ? 'scale(1.2)' : 'scale(1)',
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
                          <div style={styles.voteContainer} className="vote-container-mobile">
                            <button
                              onClick={() => handleVote(threat.id, 'confirm')}
                              className="button-hover"
                              style={{
                                ...styles.confirmBtn,
                                opacity: userVote === 'deny' ? 0.5 : 1,
                                filter: userVote === 'deny' ? 'grayscale(0.8)' : 'none',
                                border: userVote === 'confirm' ? '2px solid rgba(255, 255, 255, 0.5)' : 'none'
                              }}
                            >
                              Confirm {threat.confirms || 0}
                            </button>
                            <button
                              onClick={() => handleVote(threat.id, 'deny')}
                              className="button-hover"
                              style={{
                                ...styles.denyBtn,
                                opacity: userVote === 'confirm' ? 0.5 : 1,
                                filter: userVote === 'confirm' ? 'grayscale(0.8)' : 'none',
                                border: userVote === 'deny' ? '2px solid rgba(255, 255, 255, 0.5)' : 'none'
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
  container: {
    minHeight: "100vh",
    backgroundColor: "transparent",
    padding: "48px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    position: "relative",
    color: "#eee",
    boxSizing: "border-box",
  },
  dashboardGrid: {
    display: "flex",
    gap: "56px",
    width: "100%",
    maxWidth: "100%",
    minHeight: "auto",
    flexWrap: "wrap",
    alignItems: "stretch",
    zIndex: 1,
    position: "relative",
    boxSizing: "border-box",
  },
  leftColumn: { 
    flex: "1 1 320px", 
    minWidth: "280px",
    maxWidth: "100%",
    display: "flex", 
    justifyContent: "center",
    alignItems: "stretch",
    marginBottom: "20px",
    boxSizing: "border-box",
  },
  rightColumn: { 
    flex: "2 1 600px", 
    minWidth: "280px",
    maxWidth: "100%",
    display: "flex",
    alignItems: "stretch",
    marginBottom: "20px",
    boxSizing: "border-box",
  },
  profileCard: {
    position: "relative",
    background: "linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)",
    backdropFilter: "blur(20px)",
    borderRadius: "24px",
    padding: "24px",
    width: "100%",
    maxWidth: "100%",
    height: "100%",
    maxHeight: "calc(100vh - 80px)",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 32px rgba(27, 39, 53, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1)",
    color: "#1B2735",
    transition: "transform 0.3s ease, box-shadow 0.3s ease",
    boxSizing: "border-box",
  },
  topActions: { position: "absolute", top: "20px", right: "20px", zIndex: 10 },
  header: { marginBottom: "24px", textAlign: "center", paddingTop: "8px" },
  avatar: {
    width: "80px",
    height: "80px",
    background: "linear-gradient(135deg, #1B2735 0%, #2a3d55 100%)",
    color: "#fff",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "2rem",
    fontWeight: 700,
    margin: "0 auto 16px",
    boxShadow: "0 8px 24px rgba(27, 39, 53, 0.4), 0 0 0 4px rgba(255, 255, 255, 0.1)",
    border: "3px solid rgba(255, 255, 255, 0.2)",
  },
  name: { 
    fontSize: "1.75rem", 
    fontWeight: 700, 
    margin: "0 0 8px 0", 
    color: "#1B2735",
    letterSpacing: "-0.02em",
    wordBreak: "break-word",
  },
  liveTag: {
    fontSize: "0.875rem",
    color: "#1B2735",
    fontWeight: 600,
    marginTop: "12px",
    padding: "6px 16px",
    borderRadius: "20px",
    background: "rgba(27, 39, 53, 0.08)",
    display: "inline-block",
  },
  mapBox: { 
    marginTop: "16px", 
    marginBottom: "16px", 
    borderRadius: "16px", 
    overflow: "hidden", 
    border: "2px solid rgba(27, 39, 53, 0.1)",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
    width: "100%",
    maxWidth: "100%",
    position: "relative",
  },
  infoSection: { 
    textAlign: "center", 
    borderTop: "1px solid rgba(27, 39, 53, 0.1)", 
    borderBottom: "1px solid rgba(27, 39, 53, 0.1)", 
    padding: "20px 0", 
    margin: "16px 0" 
  },
  infoRow: { marginBottom: "16px" },
  label: { 
    fontSize: "0.75rem", 
    color: "#6b7280", 
    fontWeight: 700, 
    textTransform: "uppercase", 
    letterSpacing: "0.1em",
    display: "block",
    marginBottom: "6px",
  },
  value: { 
    fontSize: "1.125rem", 
    fontWeight: 600, 
    color: "#1B2735",
    margin: 0,
  },
  logoutBtn: {
    width: "100%",
    padding: "16px",
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #1B2735 0%, #2a3d55 100%)",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "1rem",
    transition: "all 0.3s ease",
    boxShadow: "0 4px 16px rgba(27, 39, 53, 0.3)",
    marginTop: "8px",
  },
  threatCard: {
    background: "linear-gradient(135deg, rgba(40, 50, 65, 0.15) 0%, rgba(30, 40, 55, 0.12) 100%)",
    backdropFilter: "blur(8px)",
    borderRadius: "24px",
    padding: "24px",
    height: "100%",
    maxHeight: "calc(100vh - 80px)",
    display: "flex",
    flexDirection: "column",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.1)",
    boxSizing: "border-box",
  },
  threatHeader: { 
    display: "flex", 
    justifyContent: "space-between", 
    alignItems: "center", 
    marginBottom: "24px", 
    flexWrap: "wrap",
    gap: "12px",
  },
  threatTitle: { 
    color: "#f0f0f0", 
    margin: 0, 
    fontSize: "1.75rem", 
    fontWeight: 700,
    letterSpacing: "-0.02em",
    wordBreak: "break-word",
  },
  threatCount: { 
    background: "linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.15) 100%)",
    color: "#fff", 
    padding: "8px 20px", 
    borderRadius: "24px", 
    fontSize: "0.875rem", 
    fontWeight: 700, 
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
    letterSpacing: "0.05em",
    border: "1px solid rgba(255, 255, 255, 0.2)",
  },
  threatList: { 
    overflowY: "auto", 
    flex: 1, 
    paddingRight: "8px",
    scrollbarWidth: "thin",
    minHeight: 0,
    maxHeight: "100%",
  },
  threatItem: {
    position: "relative",
    display: "flex",
    background: "linear-gradient(135deg, rgba(50, 60, 75, 0.2) 0%, rgba(40, 50, 65, 0.18) 100%)",
    borderRadius: "20px",
    padding: "20px",
    marginBottom: "16px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
    transition: "all 0.3s ease",
    boxSizing: "border-box",
  },
  severityIndicator: { 
    width: "8px", 
    borderRadius: "12px", 
    marginRight: "24px", 
    boxShadow: "0 0 12px currentColor",
    minHeight: "60px",
  },
  threatContent: { flex: 1 },
  threatTop: { marginBottom: "16px" },
  threatType: { 
    fontWeight: 700, 
    fontSize: "0.8125rem", 
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    padding: "8px 16px",
    borderRadius: "12px",
    display: "inline-block",
  },
  threatDesc: { 
    color: "#e0e0e0", 
    fontSize: "1rem", 
    margin: "0 0 12px 0", 
    lineHeight: "1.6",
    fontWeight: 400,
    wordBreak: "break-word",
  },
  threatSubText: { 
    color: "#b0b0b0", 
    fontSize: "0.9375rem", 
    margin: 0, 
    fontStyle: "normal",
    fontWeight: 500,
  },
  voteContainer: { 
    display: 'flex', 
    gap: '14px', 
    marginTop: '20px' 
  },
  confirmBtn: { 
    flex: 1, 
    padding: '14px 20px', 
    borderRadius: '12px', 
    border: 'none', 
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: '#fff', 
    fontSize: '0.9375rem', 
    fontWeight: 700, 
    cursor: 'pointer', 
    transition: 'all 0.3s ease', 
    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)',
    letterSpacing: "0.02em",
  },
  denyBtn: { 
    flex: 1, 
    padding: '14px 20px', 
    borderRadius: '12px', 
    border: 'none', 
    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    color: '#fff', 
    fontSize: '0.9375rem', 
    fontWeight: 700, 
    cursor: 'pointer', 
    transition: 'all 0.3s ease', 
    boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)',
    letterSpacing: "0.02em",
  },
  voteInstruction: { 
    color: "#b0b0b0", 
    fontSize: "0.8125rem", 
    fontStyle: "normal", 
    marginTop: "12px", 
    textAlign: "left",
    fontWeight: 500,
  },
  emptyThreats: { 
    height: "100%", 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center", 
    color: "#b0b0b0", 
    textAlign: "center", 
    fontSize: "1rem",
    fontWeight: 500,
  },
  switchWrapper: { 
    display: "flex", 
    alignItems: "center", 
    gap: "10px", 
    cursor: "pointer",
    padding: "8px 12px",
    borderRadius: "16px",
    background: "rgba(27, 39, 53, 0.05)",
    transition: "all 0.2s ease",
  },
  switchLabel: { 
    fontSize: "0.8125rem", 
    fontWeight: 700, 
    color: "#1B2735",
    letterSpacing: "0.05em",
  },
  switchBase: { 
    width: "48px", 
    height: "26px", 
    borderRadius: "14px", 
    position: "relative", 
    backgroundColor: "#e5e7eb",
    transition: "all 0.3s ease",
  },
  switchThumb: { 
    width: "22px", 
    height: "22px", 
    backgroundColor: "#fff", 
    borderRadius: "50%", 
    position: "absolute", 
    top: "2px", 
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
  },
  loading: { 
    height: "100vh", 
    backgroundColor: "transparent", 
    background: "radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%)", 
    color: "#fff", 
    display: "flex", 
    justifyContent: "center", 
    alignItems: "center", 
    fontSize: "1.5rem",
    fontWeight: 500,
    letterSpacing: "0.05em",
  },
  ttsButton: { 
    position: "absolute", 
    top: "14px", 
    right: "14px", 
    backgroundColor: "#222", 
    border: "1px solid #333", 
    color: "#fff", 
    borderRadius: "10px", 
    width: "36px", 
    height: "36px", 
    cursor: "pointer", 
    fontSize: "16px", 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center", 
    zIndex: 10, 
    transition: "0.2s" 
  },
  speakerBtn: { 
    marginLeft: "12px", 
    marginRight: "24px",
    background: "linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 100%)",
    border: "1px solid rgba(255, 255, 255, 0.25)", 
    color: "#fff", 
    fontSize: "1rem", 
    padding: "8px 12px", 
    borderRadius: "10px", 
    cursor: "pointer", 
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)", 
    transition: "all 0.3s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};