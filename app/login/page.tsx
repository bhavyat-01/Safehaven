/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    phoneProvider: "",
    email: "",
    password: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    let { name, value } = e.target;

    if (name === "phone") {
      value = value.replace(/\D/g, "");
      if (value.length > 10) value = value.slice(0, 10);
    }

    setFormData({ ...formData, [name]: value });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (tab === "signup" && formData.phone.length !== 10) {
      alert("Please enter a valid 10-digit phone number (XXXXXXXXXX).");
      return;
    }

    setLoading(true);

    try {
      if (tab === "signup") {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password,
        );

        await setDoc(doc(db, "users", userCredential.user.uid), {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          phoneProvider: formData.phoneProvider,
          email: formData.email,
          authProvider: "email",
          createdAt: serverTimestamp(),
        });
      } else {
        await signInWithEmailAndPassword(
          auth,
          formData.email,
          formData.password,
        );
      }

      router.push("/dashboard");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* CSS For Background Effects */}
      <style>{`
        input::placeholder { color: #444 !important; opacity: 1; }
        select:invalid { color: #444 !important; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        
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
      `}</style>

      {/* Twinkling Stars Layer */}
      <div className="stars-background">
        {[...Array(50)].map((_, i) => (
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

      <div style={styles.authWrapper}>
        <div style={styles.appTitleContainer}>
          <h1 style={styles.appTitle}>SAFEHAVEN</h1>
          <div style={styles.appTitleUnderline}></div>
        </div>

        <div style={styles.card}>
          <div style={styles.header}>
            <h2 style={styles.title}>
              {tab === "login" ? "Welcome Back" : "Create Account"}
            </h2>
            <p style={styles.subtitle}>
              {tab === "signup"
                ? "Join us by creating a new account"
                : "Sign in to your account"}
            </p>
          </div>

          <div style={styles.tabs}>
            <button
              onClick={() => setTab("login")}
              style={tab === "login" ? styles.activeTab : styles.tab}
            >
              Login
            </button>
            <button
              onClick={() => setTab("signup")}
              style={tab === "signup" ? styles.activeTab : styles.tab}
            >
              Register
            </button>
          </div>

          <form style={styles.form} onSubmit={handleAuth}>
            {tab === "signup" && (
              <>
                <div style={styles.row}>
                  <input
                    name="firstName"
                    placeholder="First Name"
                    required
                    style={styles.rowInput}
                    onChange={handleChange}
                    value={formData.firstName}
                  />
                  <input
                    name="lastName"
                    placeholder="Last Name"
                    required
                    style={styles.rowInput}
                    onChange={handleChange}
                    value={formData.lastName}
                  />
                </div>
                <input
                  name="phone"
                  type="tel"
                  placeholder="Phone Number (XXXXXXXXXX)"
                  required
                  pattern="[0-9]{10}"
                  style={styles.input}
                  onChange={handleChange}
                  value={formData.phone}
                />
              </>
            )}

            <input
              name="email"
              type="email"
              placeholder="Email Address"
              required
              style={styles.input}
              onChange={handleChange}
              value={formData.email}
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              required
              style={styles.input}
              onChange={handleChange}
              value={formData.password}
            />

            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading
                ? "Processing..."
                : tab === "login"
                  ? "Sign In"
                  : "Get Started"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
    fontFamily: "sans-serif",
    padding: "20px",
    position: "relative",
  },
  authWrapper: {
    width: "100%",
    maxWidth: "420px",
    display: "flex",
    flexDirection: "column",
    gap: "2.5rem",
    animation: "fadeIn 0.6s ease-out forwards",
    position: "relative",
    zIndex: 10,
  },
  appTitleContainer: {
    textAlign: "center",
  },
  appTitle: {
    color: "#fff",
    fontSize: "3.5rem",
    fontWeight: 900,
    margin: 0,
    letterSpacing: "8px",
    textShadow: "0 0 20px rgba(255, 255, 255, 0.4)",
  },
  appTitleUnderline: {
    height: "4px",
    width: "60px",
    backgroundColor: "#fff",
    margin: "12px auto 0",
    borderRadius: "2px",
    opacity: 0.8,
  },
  card: {
    backgroundColor: "#ffffff",
    padding: "2.5rem",
    borderRadius: "28px",
    width: "100%",
    boxShadow: "0 30px 60px rgba(0,0,0,0.8)",
    boxSizing: "border-box",
  },
  header: { textAlign: "center", marginBottom: "1.5rem" },
  title: { fontSize: "1.75rem", fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: "0.85rem", color: "#666", marginTop: "0.5rem" },
  tabs: {
    display: "flex",
    backgroundColor: "#f4f4f4",
    padding: "5px",
    borderRadius: "12px",
    marginBottom: "2rem",
  },
  tab: {
    flex: 1,
    padding: "0.6rem",
    border: "none",
    background: "none",
    cursor: "pointer",
    color: "#888",
    fontWeight: 600,
  },
  activeTab: {
    flex: 1,
    padding: "0.6rem",
    border: "none",
    backgroundColor: "#fff",
    borderRadius: "8px",
    fontWeight: 700,
    color: "#000",
  },
  form: { display: "flex", flexDirection: "column", gap: "0.8rem" },
  row: {
    display: "flex",
    gap: "0.8rem",
    width: "100%",
  },
  input: {
    padding: "1rem",
    borderRadius: "12px",
    border: "2px solid #eee",
    fontSize: "1rem",
    outline: "none",
    color: "#000",
    backgroundColor: "#fff",
    width: "100%",
    boxSizing: "border-box",
  },
  rowInput: {
    padding: "1rem",
    borderRadius: "12px",
    border: "2px solid #eee",
    fontSize: "1rem",
    outline: "none",
    color: "#000",
    backgroundColor: "#fff",
    flex: 1,
    minWidth: 0,
    boxSizing: "border-box",
  },
  submitBtn: {
    padding: "1.1rem",
    borderRadius: "12px",
    border: "none",
    backgroundColor: "#000",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    marginTop: "0.5rem",
    fontSize: "1rem",
  },
};