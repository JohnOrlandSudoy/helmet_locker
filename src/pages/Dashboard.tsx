import { useState, useEffect, useRef } from 'react';
import { Users, Activity, Unlock, Clock, Camera, X, Loader2, CheckCircle } from 'lucide-react';
import { supabase, AccessLog } from '../lib/supabase';
import { toast } from 'sonner';
import { subscribeToTable } from '../lib/realtime';
import { getErrorMessage } from '../lib/errors';
import * as faceapi from 'face-api.js';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    accessToday: 0,
  });
  const [recentLogs, setRecentLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [faceUnlockOpen, setFaceUnlockOpen] = useState(false);
  const [faceStarting, setFaceStarting] = useState(false);
  const [faceModelLoading, setFaceModelLoading] = useState(false);
  const [faceDetecting, setFaceDetecting] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [faceMatchedName, setFaceMatchedName] = useState<string | null>(null);

  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const faceRafRef = useRef<number | null>(null);
  const faceModelsReadyRef = useRef(false);
  const faceUsersRef = useRef<Array<{ id: string; name: string; descriptor: Float32Array }>>([]);
  const faceUnlockSentRef = useRef(false);
  const faceMatchStreakRef = useRef<{ userId: string | null; count: number }>({ userId: null, count: 0 });

  useEffect(() => {
    loadData();

    const logsChannel = subscribeToTable('access_logs', loadData, { channelName: 'access_logs_changes' });
    const usersChannel = subscribeToTable('users', loadData, { channelName: 'users_changes' });
    const unlockChannel = subscribeToTable('unlock_requests', loadData, { channelName: 'unlock_requests_changes' });

    return () => {
      logsChannel.unsubscribe();
      usersChannel.unsubscribe();
      unlockChannel.unsubscribe();
    };
  }, []);

  const loadData = async () => {
    try {
      const { data: users } = await supabase.from('users').select('id');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: todayLogs } = await supabase
        .from('access_logs')
        .select('id')
        .gte('created_at', today.toISOString());

      const { data: logs } = await supabase
        .from('access_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        totalUsers: users?.length || 0,
        accessToday: todayLogs?.length || 0,
      });

      setRecentLogs(logs || []);
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      const { error } = await supabase
        .from('unlock_requests')
        .insert({ processed: false, requested_at: new Date().toISOString() });

      if (error) throw error;

      toast.success('Unlock request sent to locker');
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to send unlock request');
    } finally {
      setUnlocking(false);
    }
  };

  const stopFaceFlow = () => {
    if (faceRafRef.current) {
      cancelAnimationFrame(faceRafRef.current);
      faceRafRef.current = null;
    }
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((t) => t.stop());
      faceStreamRef.current = null;
    }
    if (faceVideoRef.current) {
      faceVideoRef.current.srcObject = null;
    }
    setFaceDetecting(false);
    setFaceStarting(false);
    faceMatchStreakRef.current = { userId: null, count: 0 };
  };

  const getCameraError = (e: unknown) => {
    if (e && typeof e === 'object' && 'name' in e) {
      const name = String((e as { name?: unknown }).name);
      if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission denied';
      if (name === 'NotFoundError') return 'Requested device not found';
      if (name === 'NotReadableError') return 'Camera is already in use';
      if (name === 'OverconstrainedError') return 'Camera constraints not supported';
    }
    return getErrorMessage(e) ?? 'Failed to access camera';
  };

  const loadFaceModels = async () => {
    if (faceModelsReadyRef.current) return;
    setFaceModelLoading(true);
    try {
      const timeoutMs = 15000;
      const loadFromBaseUri = async (baseUri: string) => {
        await Promise.race([
          Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(baseUri),
            faceapi.nets.faceLandmark68Net.loadFromUri(baseUri),
            faceapi.nets.faceRecognitionNet.loadFromUri(baseUri),
          ]),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('Face models load timeout')), timeoutMs);
          }),
        ]);
      };

      try {
        await loadFromBaseUri('/models');
      } catch {
        await loadFromBaseUri('https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights');
      }

      faceModelsReadyRef.current = true;
    } finally {
      setFaceModelLoading(false);
    }
  };

  const computeSharpness = (videoEl: HTMLVideoElement, box: faceapi.Box) => {
    const vw = videoEl.videoWidth || 0;
    const vh = videoEl.videoHeight || 0;
    if (!vw || !vh) return null;

    const cropX = Math.max(0, Math.floor(box.x));
    const cropY = Math.max(0, Math.floor(box.y));
    const cropW = Math.max(1, Math.floor(box.width));
    const cropH = Math.max(1, Math.floor(box.height));

    const canvas = document.createElement('canvas');
    const size = 96;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(videoEl, cropX, cropY, cropW, cropH, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const gray = new Float32Array(size * size);
    let meanLum = 0;
    for (let i = 0; i < gray.length; i += 1) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      gray[i] = lum;
      meanLum += lum;
    }
    meanLum /= gray.length;

    let sum = 0;
    let sumSq = 0;
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const idx = y * size + x;
        const center = gray[idx];
        const up = gray[idx - size];
        const down = gray[idx + size];
        const left = gray[idx - 1];
        const right = gray[idx + 1];
        const lap = -4 * center + up + down + left + right;
        sum += lap;
        sumSq += lap * lap;
      }
    }

    const n = (size - 2) * (size - 2);
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;

    return { sharpness: variance, brightness: meanLum };
  };

  const loadFaceUsers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id,name,face_descriptor')
      .not('face_descriptor', 'is', null);

    if (error) throw error;

    const parsed = (data ?? [])
      .map((u) => {
        const arr = u.face_descriptor as unknown;
        if (!Array.isArray(arr)) return null;
        const nums = arr.map((n) => Number(n)).filter((n) => Number.isFinite(n));
        if (nums.length !== 128) return null;
        return { id: u.id as string, name: u.name as string, descriptor: new Float32Array(nums) };
      })
      .filter(Boolean) as Array<{ id: string; name: string; descriptor: Float32Array }>;

    faceUsersRef.current = parsed;
  };

  const startFaceUnlock = async () => {
    setFaceError(null);
    setFaceMatchedName(null);
    faceUnlockSentRef.current = false;

    setFaceUnlockOpen(true);
  };

  useEffect(() => {
    if (!faceUnlockOpen) {
      stopFaceFlow();
      return;
    }

    const run = async () => {
      setFaceError(null);
      setFaceMatchedName(null);
      setFaceStarting(true);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera not supported on this device/browser');
        if (!window.isSecureContext && window.location.hostname !== 'localhost') throw new Error('Camera requires HTTPS');

        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'user' },
              width: { ideal: 720 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (e) {
          const msg = getCameraError(e);
          if (msg === 'Requested device not found' || msg === 'Camera constraints not supported') {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } else {
            throw e;
          }
        }

        faceStreamRef.current = stream;

        await new Promise<void>((resolve, reject) => {
          const startedAt = Date.now();
          const tick = async () => {
            if (!faceVideoRef.current) {
              if (Date.now() - startedAt > 1500) return reject(new Error('Camera preview unavailable'));
              requestAnimationFrame(() => void tick());
              return;
            }
            try {
              faceVideoRef.current.setAttribute('playsinline', 'true');
              faceVideoRef.current.muted = true;
              faceVideoRef.current.srcObject = stream;
              await faceVideoRef.current.play();
              resolve();
            } catch (err) {
              reject(err);
            }
          };
          void tick();
        });

        await loadFaceModels();
        await loadFaceUsers();

        if (faceUsersRef.current.length === 0) {
          throw new Error('No registered faces found. Enroll a face first.');
        }

        setFaceStarting(false);
        setFaceDetecting(true);

        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.65 });
        const threshold = 0.42;
        const margin = 0.08;
        const requiredStreak = 3;

        const loop = async () => {
          if (!faceUnlockOpen) return;
          if (!faceVideoRef.current) return;
          if (!faceModelsReadyRef.current) return;
          if (faceUnlockSentRef.current) return;

          try {
            const detection = await faceapi
              .detectSingleFace(faceVideoRef.current, options)
              .withFaceLandmarks()
              .withFaceDescriptor();

            const descriptor = detection?.descriptor ?? null;
            const box = detection?.detection?.box ?? null;
            const score = detection?.detection?.score ?? null;

            if (detection && descriptor && box) {
              const videoW = faceVideoRef.current.videoWidth || 1;
              const videoH = faceVideoRef.current.videoHeight || 1;
              const faceAreaRatio = (box.width * box.height) / (videoW * videoH);
              const cx = (box.x + box.width / 2) / videoW;
              const cy = (box.y + box.height / 2) / videoH;

              const leftEye = detection.landmarks.getLeftEye();
              const rightEye = detection.landmarks.getRightEye();
              const lx = leftEye.reduce((acc, p) => acc + p.x, 0) / leftEye.length;
              const ly = leftEye.reduce((acc, p) => acc + p.y, 0) / leftEye.length;
              const rx = rightEye.reduce((acc, p) => acc + p.x, 0) / rightEye.length;
              const ry = rightEye.reduce((acc, p) => acc + p.y, 0) / rightEye.length;
              const rollDeg = (Math.atan2(ry - ly, rx - lx) * 180) / Math.PI;

              const quality = computeSharpness(faceVideoRef.current, box);
              const sharpness = quality?.sharpness ?? null;
              const brightness = quality?.brightness ?? null;

              const qualityOk =
                (typeof score !== 'number' || score >= 0.7) &&
                faceAreaRatio >= 0.12 &&
                Math.abs(cx - 0.5) <= 0.18 &&
                Math.abs(cy - 0.5) <= 0.18 &&
                Math.abs(rollDeg) <= 12 &&
                (typeof sharpness !== 'number' || sharpness >= 120) &&
                (typeof brightness !== 'number' || brightness >= 45);

              if (!qualityOk) {
                faceMatchStreakRef.current = { userId: null, count: 0 };
                faceRafRef.current = requestAnimationFrame(() => {
                  void loop();
                });
                return;
              }

              const candidate = descriptor;
              let best: { id: string; name: string; distance: number } | null = null;
              let secondBestDistance: number | null = null;

              for (const u of faceUsersRef.current) {
                const distance = faceapi.euclideanDistance(u.descriptor, candidate);
                if (!best || distance < best.distance) {
                  if (best) secondBestDistance = best.distance;
                  best = { id: u.id, name: u.name, distance };
                } else if (secondBestDistance === null || distance < secondBestDistance) {
                  secondBestDistance = distance;
                }
              }

              const ambiguous =
                best &&
                secondBestDistance !== null &&
                secondBestDistance - best.distance < margin;

              if (best && best.distance <= threshold && !ambiguous) {
                const current = faceMatchStreakRef.current;
                if (current.userId === best.id) {
                  faceMatchStreakRef.current = { userId: best.id, count: current.count + 1 };
                } else {
                  faceMatchStreakRef.current = { userId: best.id, count: 1 };
                }

                if (faceMatchStreakRef.current.count < requiredStreak) {
                  faceRafRef.current = requestAnimationFrame(() => {
                    void loop();
                  });
                  return;
                }

                faceUnlockSentRef.current = true;
                setFaceMatchedName(best.name);

                const {
                  data: { session },
                  error: sessionError,
                } = await supabase.auth.getSession();
                if (sessionError) throw sessionError;
                if (!session) throw new Error('Please sign in again');

                const { error } = await supabase
                  .from('unlock_requests')
                  .insert({ user_id: best.id, processed: false, requested_at: new Date().toISOString() });
                if (error) throw error;

                toast.success(`Face matched: ${best.name}. Unlock request sent.`);
                setFaceUnlockOpen(false);
                return;
              } else {
                faceMatchStreakRef.current = { userId: null, count: 0 };
              }
            }
          } catch (e) {
            setFaceError(getErrorMessage(e) ?? 'Face unlock failed');
            faceUnlockSentRef.current = false;
            return;
          }

          faceRafRef.current = requestAnimationFrame(() => {
            void loop();
          });
        };

        void loop();
      } catch (e) {
        setFaceError(getErrorMessage(e) ?? 'Failed to start face unlock');
        setFaceStarting(false);
        setFaceDetecting(false);
      }
    };

    void run();

    return () => {
      stopFaceFlow();
    };
  }, [faceUnlockOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-blue-500 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium">Total Users</p>
              <p className="text-3xl font-bold text-white mt-2">{stats.totalUsers}</p>
            </div>
            <div className="bg-blue-600/10 p-3 rounded-lg">
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-green-500 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium">Access Today</p>
              <p className="text-3xl font-bold text-white mt-2">{stats.accessToday}</p>
            </div>
            <div className="bg-green-600/10 p-3 rounded-lg">
              <Activity className="w-8 h-8 text-green-500" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-6 hover:shadow-lg hover:shadow-green-500/20 transition-all">
          <button
            onClick={startFaceUnlock}
            className="w-full h-full flex flex-col items-center justify-center gap-3 disabled:opacity-50"
          >
            <Camera className="w-10 h-10 text-white" />
            <span className="text-white font-semibold text-lg">Face Unlock</span>
          </button>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 hover:shadow-lg hover:shadow-blue-500/20 transition-all">
          <button
            onClick={handleUnlock}
            disabled={unlocking}
            className="w-full h-full flex flex-col items-center justify-center gap-3 disabled:opacity-50"
          >
            <Unlock className="w-10 h-10 text-white" />
            <span className="text-white font-semibold text-lg">
              {unlocking ? 'Unlocking...' : 'Quick Unlock'}
            </span>
          </button>
        </div>
      </div>

      {faceUnlockOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">Face Unlock</h3>
              <button
                onClick={() => setFaceUnlockOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="relative w-full overflow-hidden rounded-lg border border-gray-800 bg-black">
              <video
                ref={faceVideoRef}
                className="w-full aspect-square object-cover"
                autoPlay
                playsInline
                muted
              />
              {(faceStarting || faceModelLoading) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="flex items-center gap-2 text-white text-sm">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {faceStarting ? 'Opening camera...' : 'Loading models...'}
                  </div>
                </div>
              )}
              {faceMatchedName && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="flex flex-col items-center gap-2 text-white text-sm">
                    <CheckCircle className="w-7 h-7 text-green-400" />
                    Matched: {faceMatchedName}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {faceError ? (
                <p className="text-sm text-red-400">{faceError}</p>
              ) : faceDetecting ? (
                <p className="text-sm text-gray-300">Look at the camera. Detecting and matching…</p>
              ) : (
                <p className="text-sm text-gray-400">Starting…</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {recentLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No recent activity
            </div>
          ) : (
            recentLogs.map((log) => (
              <div key={log.id} className="p-4 sm:p-6 hover:bg-gray-800/50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      log.status === 'success' ? 'bg-green-600/10' : 'bg-red-600/10'
                    }`}>
                      <Activity className={`w-5 h-5 ${
                        log.status === 'success' ? 'text-green-500' : 'text-red-500'
                      }`} />
                    </div>
                    <div>
                      <p className="text-white font-medium">{log.user_name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-1 bg-gray-800 rounded text-gray-400 capitalize">
                          {log.method}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          log.status === 'success'
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-red-600/20 text-red-400'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm text-gray-400">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
