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

    // --- Phone Number Sanitization ---
    if (name === "phone") {
      // Remove all non-digit characters
      value = value.replace(/\D/g, "");
      // Limit to 10 digits
      if (value.length > 10) value = value.slice(0, 10);
    }

    setFormData({ ...formData, [name]: value });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    // Final Validation for Phone Length
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
          phone: formData.phone, // Saved as pure digits
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
      <style>{`
        input::placeholder { color: #444 !important; opacity: 1; }
        select:invalid { color: #444 !important; }
      `}</style>

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
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
    fontFamily: "sans-serif",
  },
  card: {
    backgroundColor: "#ffffff",
    padding: "2.5rem",
    borderRadius: "20px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
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
    padding: "0.9rem 1rem",
    borderRadius: "10px",
    border: "2px solid #eee",
    fontSize: "0.95rem",
    outline: "none",
    color: "#000",
    backgroundColor: "#fff",
    width: "100%",
    boxSizing: "border-box",
  },
  rowInput: {
    padding: "0.9rem 1rem",
    borderRadius: "10px",
    border: "2px solid #eee",
    fontSize: "0.95rem",
    outline: "none",
    color: "#000",
    backgroundColor: "#fff",
    flex: 1,
    minWidth: 0,
    boxSizing: "border-box",
  },
  submitBtn: {
    padding: "1rem",
    borderRadius: "10px",
    border: "none",
    backgroundColor: "#000",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: "0.5rem",
  },
};
