import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Fingerprint, CreditCard, Save, Loader2, CheckCircle, X } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { supabase, type EnrollRequest } from '../lib/supabase';
import { toast } from 'sonner';
import { createEnrollRequest, getNextFingerprintId, watchEnrollRequest } from '../lib/enrollRequests';
import { getErrorMessage } from '../lib/errors';

const FaceCapture = ({ onFaceCaptured }: { onFaceCaptured: (descriptor: number[] | null) => void }) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const modelsReadyRef = useRef(false);

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

  const stopCamera = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setDetecting(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const loadModels = async () => {
    if (modelsReadyRef.current) return;

    setModelLoading(true);
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

      modelsReadyRef.current = true;
    } finally {
      setModelLoading(false);
    }
  };

  const waitForVideoElement = async (timeoutMs: number) => {
    const startedAt = Date.now();
    while (!videoRef.current) {
      if (Date.now() - startedAt > timeoutMs) throw new Error('Camera preview unavailable');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return videoRef.current;
  };

  const startCamera = async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarting(true);
    setError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported on this device/browser');
      }
      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        throw new Error('Camera requires HTTPS');
      }

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
        const message = getCameraError(e);
        if (message === 'Requested device not found' || message === 'Camera constraints not supported') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw e;
        }
      }

      streamRef.current = stream;

      const videoEl = await waitForVideoElement(1500);
      videoEl.setAttribute('playsinline', 'true');
      videoEl.muted = true;
      videoEl.srcObject = stream;
      setCameraActive(true);
      await videoEl.play();
    } catch (e) {
      setError(getCameraError(e));
      stopCamera();
      startedRef.current = false;
      setStarting(false);
      return;
    }

    try {
      await loadModels();
    } catch (e) {
      const message = getErrorMessage(e) ?? 'Failed to load face models';
      setError(message);
      stopCamera();
      startedRef.current = false;
      setStarting(false);
      return;
    }

    setStarting(false);
    setDetecting(true);
  };

  const captureThumbnail = () => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 480;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  useEffect(() => {
    if (!cameraActive || !detecting || captured) return;
    if (!modelsReadyRef.current) return;

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.5,
    });

    const loop = async () => {
      if (!videoRef.current) return;
      if (!cameraActive || !detecting || captured) return;

      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, options)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection?.descriptor) {
          const descriptorArray = Array.from(detection.descriptor);
          onFaceCaptured(descriptorArray);
          setThumbnail(captureThumbnail());
          setCaptured(true);
          setDetecting(false);
          stopCamera();
          return;
        }
      } catch (e) {
        setError(getErrorMessage(e) ?? 'Face detection failed');
        setDetecting(false);
        stopCamera();
        startedRef.current = false;
        return;
      }

      rafRef.current = requestAnimationFrame(() => {
        loop();
      });
    };

    loop();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [cameraActive, detecting, captured, onFaceCaptured]);

  const handleRetake = () => {
    stopCamera();
    startedRef.current = false;
    setCaptured(false);
    setThumbnail(null);
    setError(null);
    onFaceCaptured(null);
  };

  const showSpinner = starting || modelLoading;

  return (
    <div
      className={`bg-gray-800 border-2 border-gray-700 hover:border-green-500 rounded-xl p-6 transition-all group ${
        !captured ? 'cursor-pointer' : ''
      }`}
      onClick={() => {
        if (!captured && !starting && !modelLoading) startCamera();
      }}
    >
      <div className="flex flex-col items-center gap-4">
        {showSpinner ? (
          <Loader2 className="w-12 h-12 text-green-500 animate-spin" />
        ) : captured ? (
          <CheckCircle className="w-12 h-12 text-green-500" />
        ) : (
          <Camera className="w-12 h-12 text-gray-400 group-hover:text-green-500 transition-colors" />
        )}

        <div className="text-center w-full">
          <h3 className="text-white font-semibold mb-1">Face</h3>

          {error ? (
            <p className="text-xs text-red-400">{error}</p>
          ) : captured ? (
            <p className="text-xs text-green-400">Face Captured Successfully</p>
          ) : showSpinner ? (
            <p className="text-xs text-gray-400">
              {starting ? 'Opening camera...' : 'Loading face models...'}
            </p>
          ) : (
            <p className="text-xs text-gray-400">Tap to open camera</p>
          )}
        </div>

        <div className={`w-full ${cameraActive || captured || error ? '' : 'hidden'}`}>
          <div className={`relative w-full overflow-hidden rounded-lg border border-gray-700 bg-black ${cameraActive ? '' : 'hidden'}`}>
            <video ref={videoRef} className="w-full aspect-square object-cover" playsInline muted autoPlay />
            <div className="absolute bottom-2 left-2 right-2 text-center">
              <span className="text-xs bg-black/60 text-white px-2 py-1 rounded">
                {detecting ? 'Detecting face...' : 'Camera ready'}
              </span>
            </div>
          </div>

          <div className={captured && thumbnail ? 'flex items-center justify-center' : 'hidden'}>
            <img
              src={thumbnail ?? ''}
              alt="Face thumbnail"
              className="mt-2 w-20 h-20 rounded-lg object-cover border border-gray-700"
            />
          </div>
        </div>

        <div className="w-full flex gap-2">
          {!captured ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startCamera();
              }}
              disabled={starting || modelLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {showSpinner ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {starting ? 'Opening...' : 'Loading...'}
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  Capture Face
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRetake();
              }}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" />
              Retake
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default function AddUser() {
  const [name, setName] = useState('');
  const [rfidUid, setRfidUid] = useState<string | null>(null);
  const [fingerprintId, setFingerprintId] = useState<number | null>(null);
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null);
  const [enrollingRfid, setEnrollingRfid] = useState(false);
  const [enrollingFingerprint, setEnrollingFingerprint] = useState(false);
  const [saving, setSaving] = useState(false);

  const enrollChannelRef = useRef<ReturnType<typeof watchEnrollRequest> | null>(null);
  const enrollTimeoutRef = useRef<number | null>(null);

  const handleFaceCaptured = useCallback((descriptor: number[] | null) => {
    setFaceDescriptor(descriptor);
  }, []);

  useEffect(() => {
    return () => {
      if (enrollTimeoutRef.current) {
        window.clearTimeout(enrollTimeoutRef.current);
      }
      if (enrollChannelRef.current) {
        enrollChannelRef.current.unsubscribe();
      }
    };
  }, []);

  const waitForEnrollRequest = async (
    requestId: string,
    predicate: (row: EnrollRequest) => boolean,
    timeoutMs: number
  ): Promise<EnrollRequest> => {
    if (enrollTimeoutRef.current) {
      window.clearTimeout(enrollTimeoutRef.current);
    }
    if (enrollChannelRef.current) {
      enrollChannelRef.current.unsubscribe();
    }

    return new Promise<EnrollRequest>((resolve, reject) => {
      const channel = watchEnrollRequest(requestId, (row) => {
        if (predicate(row)) {
          if (enrollTimeoutRef.current) window.clearTimeout(enrollTimeoutRef.current);
          channel.unsubscribe();
          if (enrollChannelRef.current === channel) enrollChannelRef.current = null;
          resolve(row);
        }
      });

      enrollChannelRef.current = channel;

      enrollTimeoutRef.current = window.setTimeout(() => {
        channel.unsubscribe();
        if (enrollChannelRef.current === channel) enrollChannelRef.current = null;
        reject(new Error('Enrollment timeout'));
      }, timeoutMs);
    });
  };

  const enrollRfid = async () => {
    if (!name.trim()) {
      toast.error('Please enter a name first');
      return;
    }

    setEnrollingRfid(true);
    try {
      const request = await createEnrollRequest({ type: 'rfid', user_name: name.trim() });
      toast.success('Please scan RFID card on the locker');

      const updated = await waitForEnrollRequest(
        request.id,
        (row) => Boolean(row.processed && row.rfid_uid),
        30000
      );

      setRfidUid(updated.rfid_uid ?? null);
      toast.success('RFID enrolled successfully');
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to start RFID enrollment');
      setEnrollingRfid(false);
      return;
    }
    setEnrollingRfid(false);
  };

  const enrollFingerprint = async () => {
    if (!name.trim()) {
      toast.error('Please enter a name first');
      return;
    }

    setEnrollingFingerprint(true);
    try {
      const nextId = await getNextFingerprintId();
      const request = await createEnrollRequest({
        type: 'fingerprint',
        user_name: name.trim(),
        fingerprint_id: nextId,
      });
      toast.success(`Place finger on sensor (ID: ${nextId})`);

      const updated = await waitForEnrollRequest(request.id, (row) => Boolean(row.processed), 30000);
      setFingerprintId(updated.fingerprint_id ?? nextId);
      toast.success('Fingerprint enrolled successfully');
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to start fingerprint enrollment');
      setEnrollingFingerprint(false);
      return;
    }
    setEnrollingFingerprint(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a name');
      return;
    }

    if (!rfidUid && !fingerprintId && !faceDescriptor) {
      toast.error('Please enroll at least one authentication method');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('users').insert({
        name: name.trim(),
        rfid_uid: rfidUid,
        fingerprint_id: fingerprintId,
        face_descriptor: faceDescriptor,
      });

      if (error) throw error;

      toast.success('User registered successfully');
      setName('');
      setRfidUid(null);
      setFingerprintId(null);
      setFaceDescriptor(null);
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-6">User Information</h2>
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
            Full Name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            placeholder="Enter user's full name"
          />
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-6">Enrollment Methods</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={enrollRfid}
            disabled={enrollingRfid || !name.trim()}
            className="bg-gray-800 border-2 border-gray-700 hover:border-blue-500 rounded-xl p-6 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="flex flex-col items-center gap-4">
              {enrollingRfid ? (
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              ) : rfidUid ? (
                <CheckCircle className="w-12 h-12 text-green-500" />
              ) : (
                <CreditCard className="w-12 h-12 text-gray-400 group-hover:text-blue-500 transition-colors" />
              )}
              <div className="text-center">
                <h3 className="text-white font-semibold mb-1">RFID Card</h3>
                {rfidUid ? (
                  <p className="text-xs text-green-400 font-mono">{rfidUid}</p>
                ) : (
                  <p className="text-xs text-gray-400">
                    {enrollingRfid ? 'Scan card now...' : 'Tap to enroll'}
                  </p>
                )}
              </div>
            </div>
          </button>

          <button
            onClick={enrollFingerprint}
            disabled={enrollingFingerprint || !name.trim()}
            className="bg-gray-800 border-2 border-gray-700 hover:border-purple-500 rounded-xl p-6 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="flex flex-col items-center gap-4">
              {enrollingFingerprint ? (
                <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
              ) : fingerprintId ? (
                <CheckCircle className="w-12 h-12 text-green-500" />
              ) : (
                <Fingerprint className="w-12 h-12 text-gray-400 group-hover:text-purple-500 transition-colors" />
              )}
              <div className="text-center">
                <h3 className="text-white font-semibold mb-1">Fingerprint</h3>
                {fingerprintId ? (
                  <p className="text-xs text-green-400">ID: {fingerprintId}</p>
                ) : (
                  <p className="text-xs text-gray-400">
                    {enrollingFingerprint ? 'Place finger...' : 'Tap to enroll'}
                  </p>
                )}
              </div>
            </div>
          </button>

          <div className={!name.trim() ? 'opacity-50 pointer-events-none' : undefined}>
            <FaceCapture
              onFaceCaptured={handleFaceCaptured}
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="w-5 h-5" />
            Save User
          </>
        )}
      </button>
    </div>
  );
}
