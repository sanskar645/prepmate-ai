"use client";
/**
 * PrepMate AI: Interview Room (video-call layout)
 * Left: student video with floating interviewer tile + question subtitle.
 * Right: chat-style Live Transcript with the live feedback card pinned below.
 * Bottom: clock + interview label | context record button | End Session.
 *
 * React state shape (Section 7):
 * {
 *   sessionId, phase, transcript, isRecording, currentQuestion, timerSeconds
 * }
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUpload, apiFetch } from "@/lib/api";
import {
  computePresenceScore,
  EXPRESSION_NAMES,
  type ExpressionName,
  type PresenceResult,
  type PresenceSample,
} from "@/lib/presence";
import type { InterviewRoomState, AnswerEvaluation } from "@/types";
import {
  AlertIcon,
  BotIcon,
  CheckIcon,
  ClockIcon,
  MicIcon,
  PersonIcon,
  StopIcon,
  WrenchIcon,
  XMarkIcon,
} from "@/components/icons";

// Minimal structural type for the dynamically-imported face-api fork
// (keeps TF.js types out of our bundle surface).
interface FaceApi {
  nets: {
    tinyFaceDetector: { loadFromUri(uri: string): Promise<void> };
    faceExpressions: { loadFromUri(uri: string): Promise<void> };
  };
  TinyFaceDetectorOptions: new () => unknown;
  detectSingleFace(
    video: HTMLVideoElement,
    options: unknown
  ): {
    withFaceExpressions(): Promise<null | {
      expressions: Record<string, number>;
    }>;
  };
  detectAllFaces(
    video: HTMLVideoElement,
    options: unknown
  ): {
    withFaceExpressions(): Promise<Array<{
      expressions: Record<string, number>;
    }>>;
  };
}

interface SessionMeta {
  interview_type: string;
  company_tag: string | null;
  total_questions: number;
  time_per_question?: number;
}

export default function InterviewRoomPage({
  params,
}: {
  params: { id: string };
}) {
  const sessionId = params.id;
  const router = useRouter();

  const [state, setState] = useState<InterviewRoomState>({
    sessionId,
    phase: "idle",
    transcript: [],
    isRecording: false,
    currentQuestion: "Loading your first question...",
    timerSeconds: 0,
  });
  const [error, setError] = useState("");
  // Latest scored answer — shown as a live feedback card until dismissed or
  // the next recording starts. Cleared per attempt so a stale score is never
  // mistaken for the current one.
  const [lastEval, setLastEval] = useState<AnswerEvaluation | null>(null);
  const [progress, setProgress] = useState<{
    answered: number;
    total: number;
  } | null>(null);
  // Presence (body-language) signal for the latest scored answer. Computed
  // on-device from per-second samples; null when the camera was off.
  const [presence, setPresence] = useState<PresenceResult | null>(null);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Answer countdown: seconds left for the current question. Resets on every
  // new question; at zero the take auto-submits (or skips as a zero when
  // nothing was recorded — no time to look answers up).
  const timeLimit = meta?.time_per_question ?? 60;
  const [timeLeft, setTimeLeft] = useState(timeLimit);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // stopRecording's closure is stale for state — the ref carries the live
  // per-answer timer value to the upload.
  const timerSecondsRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // ── Vision refs (never in state — high-frequency, no re-renders) ──────────
  const faceApiRef = useRef<FaceApi | null>(null);
  const samplesRef = useRef<PresenceSample[]>([]);
  const samplingBusyRef = useRef(false);
  // Integrity counters, uploaded as telemetry (counts only, never images).
  const multiFaceRef = useRef(0);
  const maxFacesRef = useRef(0);
  const tabSwitchesRef = useRef(0);
  const recordingRef = useRef(false);
  const [visionReady, setVisionReady] = useState(false);
  // StrictMode double-invokes effects in dev — without this guard the first
  // question is spoken AND transcribed twice (the duplicate AI lines).
  const bootedRef = useRef(false);

  // Lazy-load the face model once. Failure is non-fatal: the interview works
  // exactly as before, just without the presence signal.
  const loadVision = useCallback(async () => {
    if (faceApiRef.current) return;
    try {
      const api = (await import("@vladmandic/face-api")) as unknown as FaceApi;
      await api.nets.tinyFaceDetector.loadFromUri("/models");
      await api.nets.faceExpressions.loadFromUri("/models");
      faceApiRef.current = api;
      setVisionReady(true);
    } catch (err) {
      console.warn("[PrepMate AI] Vision models unavailable:", err);
    }
  }, []);

  // ── Boot: get media + first question ───────────────────────────────────────
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    // Releasing camera/mic/speech on unmount: without this the camera light
    // stays on and the mic stays hot across the whole site after leaving.
    const stopMedia = () => {
      const stream = videoRef.current?.srcObject as MediaStream | undefined;
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
    async function boot() {
      // Start camera/mic
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        console.warn("[PrepMate AI] Camera/mic access denied");
      }

      // First question + session meta (passed via session start response)
      const firstQ = sessionStorage.getItem(`prepmate_question_${sessionId}`);
      if (firstQ) {
        setState((s) => ({ ...s, currentQuestion: firstQ }));
        speakQuestion(firstQ);
      } else {
        // Refresh or direct link: recover the ask-state from the server so
        // the student is never stranded on "Loading...".
        try {
          const recovered = await apiFetch<{
            current_question: string | null;
            questions_answered: number;
            total_questions: number;
            session: {
              interview_type: string;
              company_tag: string | null;
              time_per_question?: number;
            };
          }>(`/interview/session/${sessionId}`);
          if (recovered.current_question) {
            setState((s) => ({
              ...s,
              currentQuestion: recovered.current_question!,
            }));
            speakQuestion(recovered.current_question);
          } else {
            setState((s) => ({
              ...s,
              currentQuestion: "This session has ended.",
            }));
          }
          setProgress({
            answered: recovered.questions_answered,
            total: recovered.total_questions,
          });
          setMeta({
            interview_type: recovered.session.interview_type,
            company_tag: recovered.session.company_tag,
            total_questions: recovered.total_questions,
            time_per_question: recovered.session.time_per_question ?? 60,
          });
          setTimeLeft(recovered.session.time_per_question ?? 60);
        } catch {
          setError("Could not load this session. It may not exist.");
          setState((s) => ({ ...s, currentQuestion: "Session not found." }));
        }
      }
      try {
        const raw = sessionStorage.getItem(`prepmate_meta_${sessionId}`);
        if (raw) {
          const parsed = JSON.parse(raw) as SessionMeta;
          setMeta(parsed);
          if (parsed.time_per_question) setTimeLeft(parsed.time_per_question);
        }
      } catch {
        // Meta is cosmetic only — the interview works without it.
      }

      // Vision loads in the background; never blocks the interview.
      void loadVision();
    }
    boot();
    return () => stopMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Clock (bottom bar) ─────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(id);
  }, []);

  // ── Recording timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.isRecording) {
      timerRef.current = setInterval(() => {
        timerSecondsRef.current += 1;
        setState((s) => ({ ...s, timerSeconds: s.timerSeconds + 1 }));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.isRecording]);

  // ── Transcript auto-scroll (chat behaviour) ────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.transcript, lastEval]);

  // ── Presence sampling: one frame per second while recording ───────────────
  // Counts faces (multi-face = possible second person) but uploads counts
  // only — frames never leave the browser.
  useEffect(() => {
    if (!state.isRecording || !visionReady) return;
    recordingRef.current = true;
    const id = setInterval(async () => {
      if (samplingBusyRef.current) return;
      const video = videoRef.current;
      const api = faceApiRef.current;
      if (!video || !api || video.readyState < 2) return;
      samplingBusyRef.current = true;
      try {
        const dets = await api
          .detectAllFaces(video, new api.TinyFaceDetectorOptions())
          .withFaceExpressions();
        const faces = dets.length;
        if (faces > 1) multiFaceRef.current += 1;
        if (faces > maxFacesRef.current) maxFacesRef.current = faces;
        const first = dets[0];
        const sample: PresenceSample = first
          ? {
              hasFace: true,
              expressions: Object.fromEntries(
                EXPRESSION_NAMES.map((n: ExpressionName) => [
                  n,
                  first.expressions[n] ?? 0,
                ])
              ) as Record<ExpressionName, number>,
            }
          : { hasFace: false };
        samplesRef.current = [...samplesRef.current.slice(-599), sample];
      } catch {
        // A single failed frame must never break the recording.
      } finally {
        samplingBusyRef.current = false;
      }
    }, 1000);
    return () => {
      clearInterval(id);
      recordingRef.current = false;
    };
  }, [state.isRecording, visionReady]);

  // ── Tab-switch tracking: leaving the tab mid-recording is an integrity
  // signal (possible lookup on another tab or device).
  useEffect(() => {
    function onVisibility() {
      if (document.hidden && recordingRef.current) {
        tabSwitchesRef.current += 1;
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // ── Answer countdown: ticks while the question is answerable (idle or
  // recording). TTS time doesn't count — the clock starts when you can act.
  useEffect(() => {
    if (state.phase !== "idle" && state.phase !== "recording") return;
    if (timeLeft <= 0) return;
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [state.phase, timeLeft]);

  // At zero: a live take auto-submits; an unstarted question auto-skips as a
  // zero (no time left to look the answer up).
  useEffect(() => {
    if (timeLeft !== 0) return;
    if (state.phase === "recording") {
      stopRecordingRef.current();
    } else if (state.phase === "idle") {
      void skipQuestionRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // Chrome suspends speechSynthesis until the first user gesture, which can
  // silently eat the opening question. One blank utterance on first
  // interaction unlocks it for the rest of the session.
  useEffect(() => {
    let unlocked = false;
    function unlock() {
      if (unlocked || typeof window === "undefined" || !window.speechSynthesis) return;
      unlocked = true;
      try {
        window.speechSynthesis.cancel();
        const blank = new SpeechSynthesisUtterance(" ");
        blank.volume = 0;
        window.speechSynthesis.speak(blank);
      } catch {
        // TTS is enhancement-only; the transcript always shows the question.
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // ── TTS: speak AI question ─────────────────────────────────────────────────
  function speakQuestion(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    setState((s) => ({ ...s, phase: "ai_speaking" }));
    // Fresh question, fresh clock.
    setTimeLeft(timeLimit);
    addToTranscript("AI", text);
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1;
    utt.pitch = 1;
    utt.lang = "en-US";
    utt.onend = () => setState((s) => ({ ...s, phase: "idle" }));
    window.speechSynthesis.speak(utt);
  }

  // ── Transcript helper ─────────────────────────────────────────────────────
  function addToTranscript(speaker: "AI" | "YOU", text: string) {
    setState((s) => ({
      ...s,
      transcript: [
        ...s.transcript,
        { speaker, text, timestamp: new Date() },
      ],
    }));
  }

  // ── Start Recording ───────────────────────────────────────────────────────
  // Records the microphone track ONLY (video stays on screen, never recorded)
  // with a mimeType fallback chain — Safari has no audio/webm, and Chrome
  // refuses to start a recorder whose mimeType can't carry the given tracks
  // (that was the NotSupportedError crash).
  const startRecording = useCallback(async () => {
    if (state.phase !== "idle") return;
    chunksRef.current = [];
    samplesRef.current = [];
    multiFaceRef.current = 0;
    maxFacesRef.current = 0;
    tabSwitchesRef.current = 0;
    timerSecondsRef.current = 0;
    const stream = videoRef.current?.srcObject as MediaStream;
    if (!stream) {
      setError("Camera/mic stream not ready. Please allow access and retry.");
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      setError("No microphone track found. Check your mic and retry.");
      return;
    }

    setError("");
    setLastEval(null);
    setPresence(null);
    let mr: MediaRecorder;
    try {
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = candidates.find((t) => {
        try {
          return MediaRecorder.isTypeSupported(t);
        } catch {
          return false;
        }
      });
      mr = mime
        ? new MediaRecorder(new MediaStream(audioTracks), { mimeType: mime })
        : new MediaRecorder(new MediaStream(audioTracks));
    } catch {
      setError("Recording is not supported in this browser. Try Chrome.");
      return;
    }
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => chunksRef.current.push(e.data);
    try {
      mr.start();
    } catch {
      // Synchronous start failure (e.g. track went inactive) — surface it in
      // the error banner instead of the Next.js error overlay.
      setError("Recording could not start. Check mic access and retry.");
      return;
    }
    setState((s) => ({ ...s, isRecording: true, phase: "recording", timerSeconds: 0 }));
  }, [state.phase]);

  // ── Submit (staged split flow) ────────────────────────────────────────────
  // Step 1 transcribes (fast, transcript appears immediately), step 2 grades.
  // The eval token HMAC-signs the transcript, so grading always applies to
  // what Whisper heard — a tampered transcript is rejected server-side.
  const submitAnswer = useCallback(async (
    blob: Blob | null,
    opts: { skipped: boolean }
  ) => {
    const mr = mediaRecorderRef.current;
    const mime = (!opts.skipped && mr?.mimeType) || "audio/webm";
    const ext = mime.includes("mp4") ? "mp4" : "webm";

    // Presence is computed on-device from the per-second samples collected
    // during this recording. No frames leave the browser — only counts.
    const presenceResult = computePresenceScore(samplesRef.current);
    setPresence(presenceResult);

    // Integrity telemetry rides along even with the camera off: tab switches
    // and second-person sightings matter with no presence score attached.
    const metrics =
      presenceResult ||
      tabSwitchesRef.current > 0 ||
      multiFaceRef.current > 0
        ? {
            face_ratio: presenceResult?.faceRatio ?? null,
            dominant_expression: presenceResult?.dominantExpression ?? null,
            samples: presenceResult?.samples ?? samplesRef.current.length,
            max_faces: maxFacesRef.current,
            multi_face_samples: multiFaceRef.current,
            tab_switches: tabSwitchesRef.current,
          }
        : null;

    setState((s) => ({ ...s, isRecording: false, phase: "transcribing" }));
    try {
      const fd = new FormData();
      fd.append("session_id", sessionId);
      if (blob) fd.append("audio", blob, `answer.${ext}`);
      if (opts.skipped) fd.append("skipped", "true");
      fd.append("response_time_sec", String(timerSecondsRef.current));
      if (presenceResult) {
        fd.append("presence_score", String(presenceResult.score));
      }
      if (metrics) {
        fd.append("presence_metrics", JSON.stringify(metrics));
      }
      const tr = await apiUpload<{
        transcript: string;
        skipped: boolean;
        eval_token: string;
      }>("/interview/transcribe", fd);
      addToTranscript("YOU", tr.transcript);

      setState((s) => ({ ...s, phase: "grading" }));
      const eval_ = await apiFetch<AnswerEvaluation>("/interview/evaluate", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId, eval_token: tr.eval_token }),
      });
      setLastEval(eval_);
      if (
        typeof eval_.questions_answered === "number" &&
        typeof eval_.total_questions === "number"
      ) {
        setProgress({
          answered: eval_.questions_answered,
          total: eval_.total_questions,
        });
      }

      if (eval_.next_question) {
        setState((s) => ({ ...s, currentQuestion: eval_.next_question! }));
        speakQuestion(eval_.next_question);
      } else {
        // No more questions — end session
        await endSession();
      }
    } catch (err) {
      console.error("[PrepMate AI] Answer submission error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while scoring your answer. Please try again."
      );
      setState((s) => ({ ...s, phase: "idle" }));
      setTimeLeft(timeLimit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Stop Recording + Submit ───────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;

    mr.onstop = () => {
      // Match the container to what the recorder actually produced (Safari
      // falls back to mp4) — Whisper accepts both.
      const mime = mr.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      void submitAnswer(blob, { skipped: false });
    };
    try {
      mr.stop();
    } catch {
      setError("Recording could not stop cleanly. Please try again.");
      setState((s) => ({ ...s, phase: "idle" }));
    }
  }, [submitAnswer]);

  // Timer expiry with nothing recorded: skip as a zero (no LLM call).
  const skipQuestion = useCallback(() => {
    setError("");
    void submitAnswer(null, { skipped: true });
  }, [submitAnswer]);

  const stopRecordingRef = useRef(() => {});
  const skipQuestionRef = useRef<() => void>(() => {});
  stopRecordingRef.current = stopRecording;
  skipQuestionRef.current = skipQuestion;

  // ── End Session ───────────────────────────────────────────────────────────
  async function endSession() {
    // Stop any in-flight voiceover first — otherwise it talks over the report.
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setState((s) => ({ ...s, phase: "completed" }));
    try {
      await apiFetch("/interview/end", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      });
      router.push(`/student/interview/report/${sessionId}`);
    } catch (err) {
      console.error("[PrepMate AI] End session error:", err);
    }
  }

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const scoreColor = (n: number) =>
    n >= 7 ? "#22C55E" : n >= 5 ? "#2563EB" : "#EF4444";

  const clock = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const interviewLabel = meta
    ? meta.interview_type === "company" && meta.company_tag
      ? `${meta.company_tag} Interview`
      : `${meta.interview_type[0].toUpperCase()}${meta.interview_type.slice(1)} Interview`
    : "PrepMate AI Interview";
  const progressLabel = progress
    ? ` · Q ${progress.answered}/${progress.total}`
    : "";

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-[#0A0A18]">
      {/* Main area */}
      <div className="flex flex-1 flex-col md:flex-row gap-4 p-4 overflow-hidden">
        {/* Self video */}
        <div className="flex-[3] relative bg-black rounded-2xl overflow-hidden min-h-[40vh]">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover mirror"
          />
          {/* Name */}
          <div className="absolute bottom-4 left-4 text-sm text-white/85 bg-black/50 px-2.5 py-1 rounded-lg">
            You
          </div>
          {/* Current question subtitle */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[min(36rem,70%)] text-center text-[15px] leading-snug text-white bg-black/60 px-4 py-2 rounded-xl">
            {state.currentQuestion}
          </div>
          {/* Interviewer mini tile */}
          <div className="absolute bottom-4 right-4 w-32 bg-[#141428]/90 border border-white/10 rounded-2xl p-3 text-center">
            <div className="w-12 h-12 mx-auto bg-[#2563EB]/20 rounded-full flex items-center justify-center mb-1.5 border border-[#2563EB]/30 text-white">
              <BotIcon size={26} />
            </div>
            <p className="text-xs font-medium text-white/85">PrepMate AI</p>
            {state.phase === "ai_speaking" ? (
              <div className="mt-2 flex justify-center gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1 h-4 bg-[#2563EB] rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-white/35 mt-1">
                {state.phase === "recording"
                  ? `Listening ${formatTime(state.timerSeconds)}`
                  : state.phase === "transcribing"
                    ? "Transcribing..."
                    : state.phase === "grading"
                      ? "Grading..."
                      : visionReady
                        ? "Ready"
                        : "Loading vision..."}
              </p>
            )}
            {state.isRecording && (
              <div className="mt-2 inline-flex items-center gap-1 bg-[#EF4444]/90 text-white text-[11px] px-2 py-0.5 rounded-lg">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                REC
              </div>
            )}
          </div>
        </div>

        {/* Transcript panel */}
        <div className="flex-1 flex flex-col bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden min-h-[30vh]">
          <div className="px-4 py-3 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
              Live Transcript
            </h3>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {state.transcript.length === 0 && (
              <p className="text-white/20 text-xs">
                Transcript will appear here as the interview progresses...
              </p>
            )}
            {state.transcript.map((entry, i) =>
              entry.speaker === "YOU" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] bg-[#2563EB] text-white text-sm leading-relaxed px-3.5 py-2 rounded-2xl rounded-br-md">
                    {entry.text}
                  </p>
                </div>
              ) : (
                <div key={i} className="space-y-1">
                  <p className="text-xs font-semibold text-white/45">AI</p>
                  <p className="inline-block max-w-[90%] bg-white/[0.07] text-white/85 text-sm leading-relaxed px-3.5 py-2 rounded-2xl rounded-bl-md">
                    {entry.text}
                  </p>
                </div>
              )
            )}
          </div>

          {/* Live feedback card (pinned under the chat) */}
          {lastEval && (
            <div className="border-t border-[#2563EB]/25 bg-[#2563EB]/[.06] p-4 max-h-64 overflow-y-auto relative">
              <button
                onClick={() => setLastEval(null)}
                aria-label="Dismiss feedback"
                className="absolute top-3 right-3 text-white/30 hover:text-white/70 transition-colors"
              >
                <XMarkIcon size={14} />
              </button>
              <div className="flex items-baseline gap-2 mb-2">
                <p className="text-white/50 text-[11px] uppercase tracking-wider">
                  Latest Score
                </p>
                <p
                  className="text-2xl font-bold"
                  style={{ color: scoreColor(lastEval.composite_score) }}
                >
                  {lastEval.composite_score?.toFixed(1)}
                  <span className="text-white/30 text-xs font-normal">/10</span>
                </p>
                {presence && (
                  <p className="text-xs text-white/60 flex items-center gap-1.5">
                    <PersonIcon size={13} />
                    <span
                      className="font-bold"
                      style={{ color: scoreColor(presence.score) }}
                    >
                      {presence.score.toFixed(1)}
                    </span>
                    {presence.dominantExpression && (
                      <span className="text-white/35">
                        {" "}
                        · {presence.dominantExpression}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[
                  { label: "Technical", score: lastEval.technical_score },
                  { label: "Communication", score: lastEval.communication_score },
                  { label: "Relevance", score: lastEval.relevance_score },
                ].map((dim) => (
                  <div key={dim.label} className="text-center">
                    <p
                      className="text-base font-bold"
                      style={{ color: scoreColor(dim.score) }}
                    >
                      {dim.score}
                    </p>
                    <p className="text-white/40 text-[10px]">{dim.label}</p>
                  </div>
                ))}
              </div>
              {lastEval.strengths?.length > 0 && (
                <p className="text-[13px] text-white/70 mb-1">
                  <span className="text-[#22C55E] font-semibold inline-flex items-center gap-1"><CheckIcon size={13} /> </span>
                  {lastEval.strengths.join(" · ")}
                </p>
              )}
              {lastEval.improvements?.length > 0 && (
                <p className="text-[13px] text-white/70">
                  <span className="text-[#EF4444] font-semibold inline-flex items-center gap-1"><WrenchIcon size={13} /> </span>
                  {lastEval.improvements.join(" · ")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-2.5 rounded-xl text-sm text-[#FCA5A5] flex items-center gap-2">
          <AlertIcon size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Bottom control bar */}
      <div className="border-t border-white/10 px-6 py-3.5 flex items-center justify-between bg-[#0A0A18]">
        <span className="text-white/40 text-sm flex items-center gap-3">
          <span>
            {clock} | {interviewLabel}
            {progressLabel}
          </span>
          {(state.phase === "idle" || state.phase === "recording") && (
            <span
              className={`inline-flex items-center gap-1.5 font-semibold ${
                timeLeft <= 10 ? "text-[#EF4444]" : "text-white/60"
              }`}
            >
              <ClockIcon size={14} />
              {formatTime(timeLeft)} left
            </span>
          )}
        </span>

        <div>
          {state.phase === "idle" && (
            <button
              onClick={startRecording}
              className="bg-[#22C55E] hover:bg-green-500 text-white font-semibold px-8 py-2.5 rounded-xl transition-colors inline-flex items-center gap-2"
            >
              Start Recording <MicIcon size={16} />
            </button>
          )}
          {state.phase === "recording" && (
            <button
              onClick={stopRecording}
              className="bg-[#EF4444] hover:bg-red-500 text-white font-semibold px-8 py-2.5 rounded-xl transition-colors animate-pulse inline-flex items-center gap-2"
            >
              End Response <StopIcon size={15} /> {formatTime(state.timerSeconds)}
            </button>
          )}
          {(state.phase === "ai_speaking" ||
            state.phase === "transcribing" ||
            state.phase === "grading") && (
            <button
              disabled
              className="bg-white/10 text-white/40 font-semibold px-8 py-2.5 rounded-xl cursor-wait"
            >
              {state.phase === "ai_speaking"
                ? "AI Speaking..."
                : state.phase === "transcribing"
                  ? "Transcribing..."
                  : "Grading..."}
            </button>
          )}
        </div>

        <button
          onClick={endSession}
          disabled={
            state.phase === "transcribing" ||
            state.phase === "grading" ||
            state.phase === "completed"
          }
          className="bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm px-4 py-2.5 rounded-xl transition-colors disabled:opacity-30"
        >
          End Session
        </button>
      </div>
    </div>
  );
}
