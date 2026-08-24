import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Camera, Upload, Scan } from "lucide-react";
import type { User } from "@ledger/shared";
import { api } from "../api";
import { AppHeader } from "../components/AppHeader";
import { PageHeader } from "../components/PageHeader";

type Props = { user: User; onLogout: () => void };

export function QRScanPage({ user, onLogout }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get("requestId") || "";

  const [mode, setMode] = useState<"scan" | "manual">("manual");
  const [merchantName, setMerchantName] = useState("");
  const [merchantUpiId, setMerchantUpiId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "parsed" | "failed">("idle");

  // Camera scanning
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (mode !== "scan") return;
    let stream: MediaStream | null = null;
    let animFrame: number;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setScanStatus("scanning");
          scanFrame();
        }
      } catch {
        setScanStatus("failed");
      }
    }

    function scanFrame() {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx || video.readyState < 2) { animFrame = requestAnimationFrame(scanFrame); return; }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      try {
        // jsQR is available in the project
        const jsQR = (window as any).jsQR;
        if (jsQR) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            parseUpiQr(code.data);
            stopCamera();
            return;
          }
        }
      } catch { /* continue scanning */ }
      animFrame = requestAnimationFrame(scanFrame);
    }

    function stopCamera() {
      stream?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(animFrame);
    }

    startCamera();
    return stopCamera;
  }, [mode]);

  function parseUpiQr(data: string) {
    try {
      // Parse UPI QR payload (key=value pairs)
      const params = new URLSearchParams(data.includes("upi://") ? data.split("?")[1] ?? "" : data);
      const pa = params.get("pa") || "";
      const pn = params.get("pn") || "";
      const am = params.get("am") || "";
      const tn = params.get("tn") || "";

      if (pa) {
        setMerchantUpiId(pa);
        setMerchantName(pn || "Merchant");
        if (am) setAmount(am);
        if (tn) setNote(tn);
        setScanStatus("parsed");
      } else {
        setScanStatus("failed");
      }
    } catch {
      setScanStatus("failed");
    }
  }

  function handleManualEntry() {
    if (!merchantName.trim() || !merchantUpiId.trim()) {
      setError("Merchant name and UPI ID are required.");
      return;
    }
    setError("");
    setScanStatus("parsed");
  }

  async function handleProceed() {
    if (!requestId) { setError("No request linked. Please start from a request."); return; }
    const parsedAmount = amount ? parseFloat(amount) : undefined;
    if (!merchantName.trim() || !merchantUpiId.trim()) { setError("Merchant details are required."); return; }
    setLoading(true); setError("");
    try {
      const session = await api.createPaymentSession(
        { requestId, merchantName: merchantName.trim(), merchantUpiId: merchantUpiId.trim() },
        `idem-${requestId}-${Date.now()}`
      );
      navigate(`/payment/${session.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create payment session");
    } finally { setLoading(false); }
  }

  return <div className="app-shell">
    <AppHeader user={user} onLogout={onLogout} />
    <main className="main">
      <button className="back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={18} /> Back
      </button>

      <PageHeader
        eyebrow="SCAN MERCHANT QR"
        title="Scan or enter merchant details"
        subtitle="Align the merchant's UPI QR inside the frame, or enter details manually."
      />

      <div className="scanner-container">
        {scanStatus !== "parsed" && (
          <div className="scan-mode-toggle">
            <button className={`tab${mode === "scan" ? " active" : ""}`} onClick={() => setMode("scan")}>
              <Camera size={16} /> Camera scan
            </button>
            <button className={`tab${mode === "manual" ? " active" : ""}`} onClick={() => setMode("manual")}>
              <Upload size={16} /> Enter manually
            </button>
          </div>
        )}

        {mode === "scan" && scanStatus !== "parsed" && (
          <div className="scanner-viewport">
            <video ref={videoRef} playsInline className="scanner-video" />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <div className="scanner-overlay">
              <div className="scanner-frame" />
              {scanStatus === "scanning" && <p className="scanner-hint">Scanning...</p>}
              {scanStatus === "failed" && (
                <div className="scanner-error">
                  <p>We couldn't read this QR code.</p>
                  <div className="scanner-actions">
                    <button className="secondary small" onClick={() => { setScanStatus("idle"); setMode("scan"); }}>Try Again</button>
                    <button className="secondary small" onClick={() => setMode("manual")}>Enter manually</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "manual" && scanStatus !== "parsed" && (
          <div className="panel manual-entry">
            <label>
              Merchant name
              <input type="text" placeholder="e.g., ABC Restaurant" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
            </label>
            <label>
              Merchant UPI ID
              <input type="text" placeholder="e.g., abc@upi" value={merchantUpiId} onChange={(e) => setMerchantUpiId(e.target.value)} />
            </label>
            <label>
              Amount (₹) (optional — from request)
              <input type="number" step="0.01" min="0" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>
              Note (optional)
              <input type="text" placeholder="Payment note" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="primary" onClick={handleManualEntry}>
              <Scan size={16} /> Confirm merchant
            </button>
          </div>
        )}

        {/* Parsed result */}
        {scanStatus === "parsed" && (
          <div className="panel parsed-result">
            <div className="eyebrow">MERCHANT DETAILS</div>
            <div className="parsed-merchant">
              <strong>{merchantName}</strong>
              <span>UPI ID: {merchantUpiId}</span>
              {amount && <span>Amount: ₹{amount}</span>}
              {note && <span>Note: {note}</span>}
            </div>
            {error && <div className="error">{error}</div>}
            <div className="parsed-actions">
              <button className="secondary" onClick={() => { setScanStatus("idle"); setMerchantName(""); setMerchantUpiId(""); setAmount(""); setNote(""); }}>Change</button>
              <button className="primary" onClick={() => void handleProceed()} disabled={loading || !requestId}>
                {loading ? "Creating session..." : "Continue to payment"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  </div>;
}
