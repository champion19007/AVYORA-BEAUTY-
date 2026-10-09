'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ACCEPTED_TYPES,
  dimensionProblem,
  IMAGE_PROBLEM_TEXT,
  luminanceStats,
  MAX_UPLOAD_BYTES,
  QUALITY_TEXT,
  qualityIssues,
  type QualityIssue,
} from '@/modules/scans/image-validation';

const PHOTO_POLICY_VERSION = 'photo-processing-v1';
/** Every request is bounded; a stalled network never leaves the page "sending" forever (re-audit A14). */
const REQUEST_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 3_000;
const POLL_LIMIT_MS = 90_000;
const MAX_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

type Step = 'intro' | 'capture' | 'review' | 'sending' | 'processing' | 'done';
type Problem = { title: string; detail: string; retry?: () => void } | null;
type Outcome = { scanId: string | null; analysis: 'unavailable' | 'busy' | 'completed' | 'failed'; photo: 'deleted' | 'stored' | 'deletion_pending' | 'not_sent' };
type FaceDetectorCtor = new () => { detect(src: CanvasImageSource): Promise<unknown[]> };

const CAMERA_TEXT: Record<string, string> = {
  NotAllowedError: 'Camera access was blocked. Allow it in your browser, or upload a photo instead.',
  NotFoundError: 'No camera was found. Upload a photo instead.',
  NotReadableError: 'The camera is in use by another app. Close it, or upload a photo instead.',
};

/** Local checks only: dimensions, lighting, and the face count when the browser has a face detector. */
async function checkLocally(blob: Blob): Promise<{ problem: Problem; issues: QualityIssue[] }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return { problem: { title: 'Invalid image', detail: IMAGE_PROBLEM_TEXT.undecodable }, issues: [] };
  }
  const dim = dimensionProblem(bitmap.width, bitmap.height);
  if (dim) {
    bitmap.close();
    return { problem: { title: 'Invalid image', detail: IMAGE_PROBLEM_TEXT[dim] }, issues: [] };
  }
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const stats = luminanceStats(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  const Detector = (globalThis as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  const faces = Detector ? await new Detector().detect(bitmap).then((f) => f.length, () => null) : null;
  bitmap.close();
  return { problem: null, issues: qualityIssues({ ...stats, faces }) };
}

/** A bounded request tied to the current operation: aborted on timeout, on retake and on leaving the page. */
async function call(url: string, init: RequestInit, signal: AbortSignal): Promise<{ status: number; json: Record<string, unknown> } | { status: 0; json: null }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { status: 0, json: null };
  }
}
const messageOf = (json: Record<string, unknown> | null, fallback: string) =>
  ((json?.error as { message?: string } | undefined)?.message ?? fallback) as string;

export function ScanFlow({ hosted, signedIn }: { hosted: boolean; signedIn: boolean }) {
  const [step, setStep] = useState<Step>('intro');
  const [consent, setConsent] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [deleting, setDeleting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** The current operation; replaced (and the old one aborted) on every new action, so stale responses are ignored. */
  const opRef = useRef<AbortController | null>(null);

  const newOperation = useCallback(() => {
    opRef.current?.abort();
    opRef.current = new AbortController();
    return opRef.current.signal;
  }, []);
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  const discardPhoto = useCallback(() => {
    setPhoto(null);
    setIssues([]);
  }, []);

  // Unmount: camera off, any request or poll cancelled.
  useEffect(
    () => () => {
      stopCamera();
      opRef.current?.abort();
    },
    [stopCamera]
  );
  // The camera only runs on the capture step: leaving it in any way stops the tracks.
  useEffect(() => {
    if (step !== 'capture') stopCamera();
  }, [step, stopCamera]);
  // Replacing or dropping a photo frees its object URL.
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo]
  );

  const accept = async (blob: Blob) => {
    stopCamera();
    setProblem(null);
    if (!(ACCEPTED_TYPES as readonly string[]).includes(blob.type)) return setProblem({ title: 'Unsupported file', detail: IMAGE_PROBLEM_TEXT.unsupported_type });
    if (blob.size > MAX_UPLOAD_BYTES) return setProblem({ title: 'Unsupported file', detail: IMAGE_PROBLEM_TEXT.too_large });
    const checked = await checkLocally(blob);
    if (checked.problem) return setProblem(checked.problem);
    setPhoto({ blob, url: URL.createObjectURL(blob) });
    setIssues(checked.issues);
    setStep('review');
  };

  const startCamera = async () => {
    setProblem(null);
    stopCamera(); // a repeated start never leaves an earlier stream running
    const signal = newOperation();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      if (signal.aborted) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      if (signal.aborted) return;
      const name = err instanceof DOMException ? err.name : '';
      setProblem({ title: 'Camera unavailable', detail: CAMERA_TEXT[name] ?? 'The camera could not be started. Upload a photo instead.' });
    }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    stopCamera();
    canvas.toBlob((b) => b && accept(b), 'image/jpeg', 0.92);
  };

  const retake = () => {
    opRef.current?.abort();
    discardPhoto();
    setProblem(null);
    setStep('capture');
  };

  /** Polls an owned scan until analysis finishes, fails or the wait runs out. */
  const poll = async (id: string, signal: AbortSignal) => {
    const deadline = Date.now() + POLL_LIMIT_MS;
    while (!signal.aborted && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (signal.aborted) return;
      const r = await call(`/api/scans/${id}`, { method: 'GET' }, signal);
      if (signal.aborted) return;
      const status = (r.json?.scan as { status?: string } | undefined)?.status;
      if (status === 'completed') return setOutcome({ scanId: id, analysis: 'completed', photo: 'deleted' }), setStep('done');
      if (status === 'failed' || status === 'revoked' || r.status === 404) return setOutcome({ scanId: id, analysis: 'failed', photo: 'deleted' }), setStep('done');
    }
    if (!signal.aborted) {
      setOutcome({ scanId: id, analysis: 'failed', photo: 'stored' });
      setStep('done');
    }
  };

  const send = async () => {
    if (!photo) return;
    const signal = newOperation();
    setStep('sending');
    setProblem(null);
    const fail = (title: string, detail: string) => {
      if (signal.aborted) return;
      setProblem({ title, detail, retry: send });
      setStep('review');
    };
    const offline = 'Check your connection and try again. Your photo has not been sent.';
    try {
      const granted = await call('/api/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'photo_processing', policyVersion: PHOTO_POLICY_VERSION }) }, signal);
      if (granted.status === 0) return fail('Connection problem', offline);
      if (granted.status >= 400) return fail('Permission not recorded', messageOf(granted.json, 'Try again.'));
      const created = await call('/api/scans', { method: 'POST' }, signal);
      if (created.status === 0) return fail('Connection problem', offline);
      if (created.status >= 400) return fail('Could not start', messageOf(created.json, 'Try again later.'));
      const id = (created.json?.scan as { id: string }).id;
      const up = await call(`/api/scans/${id}/upload`, { method: 'POST', headers: { 'Content-Type': photo.blob.type }, body: photo.blob }, signal);
      if (signal.aborted) return;
      // 404 covers expired, withdrawn and foreign sessions alike.
      if (up.status === 404) return fail('Session expired', 'This scan is no longer available. Start again.');
      if (up.status === 413) return fail('Photo too large', IMAGE_PROBLEM_TEXT.too_large);
      if (up.status === 0) {
        // The upload may or may not have arrived: the scan is kept so it can be deleted.
        setOutcome({ scanId: id, analysis: 'failed', photo: 'deletion_pending' });
        return setStep('done');
      }
      if (up.status >= 400) return fail(up.status === 422 ? 'Invalid image' : 'Upload failed', messageOf(up.json, 'Try again.'));
      const scan = up.json?.scan as { analysis: Outcome['analysis'] | 'queued'; photo: Outcome['photo'] };
      discardPhoto();
      if (scan.analysis === 'queued') {
        setStep('processing');
        return poll(id, signal);
      }
      setOutcome({ scanId: id, analysis: scan.analysis, photo: scan.photo });
      setStep('done');
    } catch {
      fail('Something went wrong', offline);
    }
  };

  /** Deletion is reported as done only when the server confirms it; otherwise the retry stays (re-audit A07). */
  const deleteUploaded = async () => {
    if (!outcome?.scanId || deleting) return;
    setDeleting(true);
    setProblem(null);
    const r = await call(`/api/scans/${outcome.scanId}`, { method: 'DELETE' }, newOperation());
    setDeleting(false);
    if (r.status === 204) return setOutcome({ ...outcome, scanId: null, photo: 'deleted' });
    if (r.status === 202) {
      setOutcome({ ...outcome, photo: 'deletion_pending' });
      return setProblem({ title: 'Deletion not yet confirmed', detail: 'We asked for your photo to be deleted, but storage has not confirmed it yet. It will be retried automatically; you can also try again.' });
    }
    setProblem({
      title: 'Not deleted yet',
      detail: r.status === 0 ? 'Check your connection and try again.' : r.status === 429 ? 'Too many requests. Wait a minute and try again.' : messageOf(r.json, 'The request did not complete. Try again.'),
    });
  };

  const photoLine = (o: Outcome) =>
    o.photo === 'deleted'
      ? 'Your photo has been deleted.'
      : o.photo === 'not_sent'
        ? 'Your photo was not sent and has been discarded.'
        : o.photo === 'deletion_pending'
          ? 'Your photo may still be stored. Delete it below; failed deletions are retried automatically.'
          : 'Your photo is stored privately until the check finishes.';

  return (
    <main className="container mx-auto max-w-3xl py-16">
      <p className="eyebrow">Optional</p>
      <h1 className="mt-3 font-headline text-4xl font-normal tracking-tight">A face photo for your routine</h1>

      {problem && (
        <div role="alert" className="mt-8 rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-[15px]">
          <p className="font-medium">{problem.title}</p>
          <p className="mt-1 text-muted-foreground">{problem.detail}</p>
          {problem.retry && (
            <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={problem.retry}>
              Try again
            </Button>
          )}
        </div>
      )}

      {step === 'intro' && (
        <section className="mt-8 space-y-5 text-[15px] leading-relaxed">
          <p>
            This step is cosmetic only. It does not diagnose or treat any skin condition, and a photo cannot tell us about allergies, pregnancy or
            prescriptions. Your routine does not need it: the{' '}
            <Link href="/routine-finder" className="underline">
              questionnaire
            </Link>{' '}
            builds a full routine on its own.
          </p>
          <p className="rounded-2xl bg-muted px-5 py-4">
            <strong>Photo analysis is not available yet.</strong> No evaluated model is in use, so no skin result will be shown.
            {hosted
              ? ' If you send a photo, it is deleted as soon as the check ends. Today no check can run, so it is deleted straight away. If a deletion fails, it is retried and you can delete it yourself.'
              : ' Photos are checked for lighting and framing in your browser and are never sent.'}
          </p>
          {hosted && !signedIn ? (
            <Button asChild className="rounded-full px-8">
              <Link href="/login?callbackUrl=/scan">Sign in to continue</Link>
            </Button>
          ) : (
            <>
              <label className="flex items-start gap-3">
                {/* autoComplete off: a browser-restored tick would not match React state after a reload. */}
                <input type="checkbox" autoComplete="off" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4" />
                <span>
                  I agree to my photo being {hosted ? 'sent and processed privately' : 'checked in this browser'} for this step only. This is separate from
                  saving a routine and from marketing, and I can withdraw it at any time.
                </span>
              </label>
              <Button disabled={!consent} onClick={() => setStep('capture')} className="rounded-full px-8">
                Continue
              </Button>
            </>
          )}
        </section>
      )}

      {step === 'capture' && (
        <section className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-medium">Use your camera</h2>
            <video ref={videoRef} autoPlay playsInline muted className="mt-4 aspect-[4/3] w-full rounded-2xl bg-muted object-cover" aria-label="Camera preview" />
            <div className="mt-4 flex gap-3">
              <Button variant="outline" onClick={startCamera} className="rounded-full">
                Start camera
              </Button>
              <Button onClick={takePhoto} className="rounded-full">
                Take photo
              </Button>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-medium">Or upload a photo</h2>
            <p className="mt-2 text-sm text-muted-foreground">JPEG, PNG or WebP, at most {MAX_MB} MB, at least 480 pixels on the shorter side.</p>
            <input
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              aria-label="Choose a photo"
              className="mt-4 block text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) accept(f);
              }}
            />
          </div>
        </section>
      )}

      {(step === 'review' || step === 'sending') && photo && (
        <section className="mt-8 space-y-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview */}
          <img src={photo.url} alt="Your photo" className="max-h-[420px] rounded-2xl object-contain" />
          {issues.length > 0 ? (
            <ul className="list-disc pl-5 text-[15px]">
              {issues.map((i) => (
                <li key={i}>{QUALITY_TEXT[i]}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px]">Lighting and framing look usable.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={retake} className="rounded-full">
              {step === 'sending' ? 'Cancel and retake' : 'Retake'}
            </Button>
            {hosted ? (
              <Button onClick={send} disabled={step === 'sending'} className="rounded-full">
                {step === 'sending' ? 'Sending…' : 'Send privately'}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  discardPhoto();
                  setOutcome({ scanId: null, analysis: 'unavailable', photo: 'not_sent' });
                  setStep('done');
                }}
                className="rounded-full"
              >
                Finish
              </Button>
            )}
          </div>
        </section>
      )}

      {step === 'processing' && (
        <section className="mt-8 space-y-4 text-[15px]" role="status">
          <p>Checking your photo. This can take up to a minute.</p>
          <Button variant="outline" className="rounded-full" onClick={() => opRef.current?.abort()}>
            Stop waiting
          </Button>
        </section>
      )}

      {step === 'done' && outcome && (
        <section className="mt-8 space-y-5 text-[15px]">
          <p className="rounded-2xl bg-muted px-5 py-4" role="status">
            {outcome.analysis === 'completed' ? (
              <>
                <strong>Photo check complete.</strong> Its cosmetic findings can be added when you save a routine; they never override your safety answers.
              </>
            ) : (
              <>
                <strong>{outcome.analysis === 'busy' ? 'Photo checks are busy right now.' : 'Analysis unavailable.'}</strong> No skin result can be given.
              </>
            )}{' '}
            {photoLine(outcome)}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link href={outcome.analysis === 'completed' && outcome.scanId ? `/routine-finder?scan=${outcome.scanId}` : '/routine-finder'}>
                {outcome.analysis === 'completed' ? 'Use it in my routine' : 'Continue with the questionnaire'}
              </Link>
            </Button>
            {outcome.scanId && outcome.photo !== 'deleted' && (
              <Button variant="outline" onClick={deleteUploaded} disabled={deleting} className="rounded-full">
                {deleting ? 'Deleting…' : 'Delete my photo now'}
              </Button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
