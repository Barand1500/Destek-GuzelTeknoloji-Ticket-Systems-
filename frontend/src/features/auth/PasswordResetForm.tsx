import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { api, errorText } from "../../services/api";

export function PasswordResetForm({ email, onBack, onSaved }: { email: string; onBack: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const requested = useRef(false);
  async function sendCode() {
    setPending(true); setError(""); setMessage(""); setResetToken(""); setCode(""); setSent(false);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (e) { setError(errorText(e)); }
    finally { setPending(false); }
  }
  useEffect(() => {
    if (!requested.current) { requested.current = true; void sendCode(); }
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      if (!resetToken) {
        const result = await api.post("/auth/verify-reset-code", { email, code });
        setResetToken(result.data.data.resetToken); setMessage("Kod doğrulandı. Yeni şifrenizi belirleyin.");
      } else {
        await api.post("/auth/reset-password", { resetToken, password });
        onSaved();
      }
    } catch (e) { setError(errorText(e)); }
    finally { setPending(false); }
  }
  return (
    <form className="auth-form auth-slide-forward" onSubmit={submit}>
      <button type="button" className="auth-back" onClick={onBack} disabled={pending}><ArrowLeft size={16} /> Geri</button>
      <h2>Şifrenizi yenileyin</h2>
      <label><span className="field-label">E-posta adresi</span><input type="email" value={email} readOnly /></label>
      <label><span className="field-label">Doğrulama kodu</span><input name="code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="E-postanıza gönderilen 6 haneli kod" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
      {!resetToken && <button className="button primary" disabled={pending || !sent || code.length !== 6}>{pending ? "Lütfen bekleyin…" : "Doğrula"}</button>}
      <label><span className="field-label">Yeni şifre</span><span className="password-field"><input name="newPassword" value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? "text" : "password"} minLength={10} maxLength={72} autoComplete="new-password" placeholder="En az 10 karakter" required={Boolean(resetToken)} disabled={!resetToken || pending} /><button type="button" className="password-toggle" onClick={() => setShowPassword(v => !v)} disabled={!resetToken} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
      {message && <p className="auth-notice" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button primary" disabled={pending || !resetToken}>{pending && resetToken ? "Kaydediliyor…" : "Kaydet"}</button>
      {!resetToken && <button type="button" className="auth-forgot" disabled={pending} onClick={() => void sendCode()}>Kodu tekrar gönder</button>}
    </form>
  );
}
