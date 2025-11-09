import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Maximize,
  Minimize,
  Monitor,
  Play,
  RefreshCw,
  Settings,
  Square,
  Video,
} from 'lucide-react';
import { sessionsService } from '../services/sessions.service';
import type { SessionSummary } from '../types/session.types';
import { useTranslation } from '../hooks/useTranslation';
import { toErrorMessage } from '../utils/error';

type QualityLevel = 'low' | 'medium' | 'high';

export default function Desktop() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<SessionSummary | null>(null);
  const { t } = useTranslation();

  const [session, setSession] = useState<SessionSummary | null>(null);
  const [quality, setQuality] = useState<QualityLevel>('medium');
  const [fps, setFps] = useState(15);
  const [showSettings, setShowSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = Boolean(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Frame polling mekanizması
  useEffect(() => {
    if (!session) return;

    const interval = setInterval(async () => {
      try {
        await sessionsService.requestDesktopFrame(session.sessionId);
      } catch (err) {
        console.error('Frame request failed:', err);
      }
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [session, fps]);

  useEffect(() => {
    return () => {
      const active = sessionRef.current;
      if (active) {
        sessionsService.stopDesktopSession(active.sessionId).catch(() => undefined);
      }
    };
  }, []);

  const startDesktop = async () => {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await sessionsService.startDesktopSession({
        deviceId: id,
        sessionType: 'desktop',
        initialData: { quality, fps },
      });
      setSession(started);
    } catch (error) {
      setError(toErrorMessage(error, t('desktop.error')));
    } finally {
      setBusy(false);
    }
  };

  const stopDesktop = async () => {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sessionsService.stopDesktopSession(session.sessionId);
      setSession(null);
    } catch (error) {
      setError(toErrorMessage(error, t('desktop.errorStop')));
    } finally {
      setBusy(false);
    }
  };

  const toggleFullscreen = () => {
    if (!canvasRef.current) return;
    if (!document.fullscreenElement) {
      canvasRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => undefined);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => undefined);
    }
  };

  const handleCapture = () => {
    console.warn(t('desktop.captureNotImplemented'));
  };

  const handleRecordingToggle = () => {
    setIsRecording((prev) => !prev);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/devices')}
            className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">{t('desktop.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('desktop.description')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <button
                onClick={handleCapture}
                className="rounded-lg border border-border bg-secondary/40 p-2 text-muted-foreground transition hover:bg-secondary/70"
                title={t('desktop.capture')}
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                onClick={handleRecordingToggle}
                className={`rounded-lg p-2 transition ${isRecording ? 'bg-destructive text-white' : 'border border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/70'}`}
                title={isRecording ? t('desktop.recordingStop') : t('desktop.recordingStart')}
              >
                {isRecording ? <Square className="h-4 w-4" /> : <Video className="h-4 w-4" />}
              </button>
              <button
                onClick={toggleFullscreen}
                className="rounded-lg border border-border bg-secondary/40 p-2 text-muted-foreground transition hover:bg-secondary/70"
                title={isFullscreen ? t('desktop.fullscreenExit') : t('desktop.fullscreenEnter')}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setShowSettings((prev) => !prev)}
                className="rounded-lg border border-border bg-secondary/40 p-2 text-muted-foreground transition hover:bg-secondary/70"
                title={t('desktop.settings')}
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                onClick={stopDesktop}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCw className="h-4 w-4" />
                {t('desktop.disconnect')}
              </button>
            </>
          ) : (
            <button
              onClick={startDesktop}
              disabled={busy || !id}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Play className="h-4 w-4" />
              {busy ? t('desktop.connecting') : t('desktop.connect')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {showSettings && isConnected && (
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs uppercase text-muted-foreground">{t('desktop.quality')}</label>
            <select
              value={quality}
              onChange={(event) => setQuality(event.target.value as QualityLevel)}
              className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
              disabled={busy}
            >
              <option value="low">{t('desktop.qualityOptions.low')}</option>
              <option value="medium">{t('desktop.qualityOptions.medium')}</option>
              <option value="high">{t('desktop.qualityOptions.high')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase text-muted-foreground">{t('desktop.fps')}</label>
            <select
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
              className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
              disabled={busy}
            >
              {[10, 15, 24, 30].map((value) => (
                <option key={value} value={value}>
                  {value} FPS
                </option>
              ))}
            </select>
          </div>
          <div className="self-end text-xs text-muted-foreground">{t('desktop.reconnectHint')}</div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        {isConnected ? (
          <canvas ref={canvasRef} className="h-[600px] w-full bg-black" />
        ) : (
          <div className="flex h-[600px] flex-col items-center justify-center gap-4 text-muted-foreground">
            <Monitor className="h-20 w-20" />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">{t('desktop.waiting')}</p>
              <p className="text-sm">{t('desktop.waitingDescription')}</p>
            </div>
            <button
              onClick={startDesktop}
              disabled={busy || !id}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Play className="h-4 w-4" />
              {busy ? t('desktop.connecting') : t('desktop.start')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
