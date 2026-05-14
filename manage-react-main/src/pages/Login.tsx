import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";

export default function Login() {
  return (
    <div>
      <h1>로그인</h1>
      <p style={{ color: "var(--muted)" }}>Google 계정으로 로그인 해주시길 바랍니다.</p>

      <button
        className="btn"
        onClick={async () => {
          const provider = new GoogleAuthProvider();
          await signInWithPopup(auth, provider);
        }}
      >
        Google로 로그인
      </button>
    </div>
  );
}

