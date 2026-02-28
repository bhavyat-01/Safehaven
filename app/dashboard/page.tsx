"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../firebase"; // Ensure this path is correct
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  authProvider: string;
}

export default function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Fetch the custom data we saved in Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        } else {
          // Fallback if Firestore doc doesn't exist yet
          setProfile({
            firstName: user.displayName?.split(" ")[0] || "User",
            lastName: user.displayName?.split(" ")[1] || "",
            email: user.email || "",
            phone: "Not provided",
            authProvider: "Google/Unknown",
          });
        }
      } else {
        router.push("/login");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  if (loading) return <div style={styles.loading}>Loading Profile...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.profileCard}>
        <div style={styles.header}>
          <div style={styles.avatar}>
            {profile?.firstName[0]}
            {profile?.lastName[0]}
          </div>
          <h1 style={styles.name}>
            {profile?.firstName} {profile?.lastName}
          </h1>
          <span style={styles.badge}>{profile?.authProvider} Account</span>
        </div>

        <div style={styles.infoSection}>
          <div style={styles.infoRow}>
            <label style={styles.label}>Email Address</label>
            <p style={styles.value}>{profile?.email}</p>
          </div>

          <div style={styles.infoRow}>
            <label style={styles.label}>Phone Number</label>
            <p style={styles.value}>{profile?.phone || "Not provided"}</p>
          </div>
        </div>

        <button onClick={handleLogout} style={styles.logoutBtn}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
    fontFamily: "'Inter', sans-serif",
    padding: "20px",
  },
  profileCard: {
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: "450px",
    borderRadius: "24px",
    padding: "40px",
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
  },
  header: {
    marginBottom: "30px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  avatar: {
    width: "80px",
    height: "80px",
    backgroundColor: "#000",
    color: "#fff",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "1.5rem",
    fontWeight: "bold",
    marginBottom: "15px",
    textTransform: "uppercase",
  },
  name: {
    fontSize: "1.8rem",
    fontWeight: 800,
    margin: "0 0 8px 0",
    color: "#111",
  },
  badge: {
    fontSize: "0.75rem",
    backgroundColor: "#f0f0f0",
    padding: "4px 12px",
    borderRadius: "20px",
    textTransform: "uppercase",
    fontWeight: 700,
    color: "#666",
    letterSpacing: "0.5px",
  },
  infoSection: {
    textAlign: "left",
    borderTop: "1px solid #eee",
    paddingTop: "25px",
    marginBottom: "30px",
  },
  infoRow: { marginBottom: "20px" },
  label: {
    fontSize: "0.8rem",
    color: "#888",
    fontWeight: 600,
    textTransform: "uppercase",
  },
  value: {
    fontSize: "1rem",
    color: "#111",
    fontWeight: 500,
    margin: "4px 0 0 0",
  },
  logoutBtn: {
    width: "100%",
    padding: "12px",
    borderRadius: "12px",
    border: "2px solid #eee",
    backgroundColor: "transparent",
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s",
    color: "#ff4444",
  },
  loading: {
    height: "100vh",
    backgroundColor: "#0a0a0a",
    color: "#fff",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "1.2rem",
  },
};
