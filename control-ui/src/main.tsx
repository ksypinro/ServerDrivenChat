import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ApprovalRequest, ContentBlock, JsonValue, PermissionGrant, ProtocolEvent } from "@server-driven-chat/protocol";
import "./style.css";

type Session = {
    sessionId: string; state: string; role: "owner" | "operator" | "viewer";
    binding: null | { bindingId: string; deviceId: string; bindingRevision: number; leaseGeneration: number; state: string; leaseExpiresAt: string; payload: Record<string, unknown> };
};
type Projection = {
    sessionId: string; watermark: number;
    items: Array<{ itemId: string; turnId: string; kind: string; revision: number; partial: boolean; completed: boolean; evidence: string; content: ContentBlock[] }>;
    artifacts: Array<{ artifactId: string; attachmentId: string; mimeType: string; sizeBytes: number; sha256: string; state: string }>;
    pendingApprovals: ApprovalRequest[]; interactionStates: Record<string, string>; turnStates: Record<string, string>; needsRepair: boolean; repairAfter: number | null;
};
type Snapshot = { bindings?: Array<{ bindingId: string; payload: Record<string, unknown> }>; projection: Projection; cursors: { sessionSeq: number }; interactions: Array<{ kind: string; requestId: string; requestRevision: number; state: string; payload: Record<string, unknown> }> };
type ApiError = Error & { status?: number };

async function publicApi<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    if(!response.ok) { const result=await response.json().catch(()=>null) as {error?:{message?:string}}|null; throw new Error(result?.error?.message??`Sign-in failed (${response.status})`); }
    return response.json() as Promise<T>;
}

async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
        const error = new Error(body?.error?.message ?? `Request failed (${response.status})`) as ApiError;
        error.status = response.status;
        throw error;
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
}

function OidcSignIn({ onToken }: { onToken: (token: string) => void }) {
    const [message, setMessage] = useState("");
    useEffect(() => {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (!code) return;
        const state = url.searchParams.get("state");
        const expectedState = sessionStorage.getItem("sdc.oidc.state");
        sessionStorage.removeItem("sdc.oidc.state");
        window.history.replaceState({}, "", window.location.pathname);
        if (!expectedState || state !== expectedState) { setMessage("Sign-in response could not be verified. Start again."); return; }
        void (async () => {
            try {
                const tokens = await publicApi<{accessToken:string}>("/v2/auth/oidc/exchange",{code,state});
                onToken(tokens.accessToken);
            } catch (error) { setMessage(error instanceof Error ? error.message : "Sign-in failed"); }
        })();
    }, [onToken]);

    async function signIn(): Promise<void> {
        try {
            const result=await publicApi<{authorizationUrl:string;state:string}>("/v2/auth/oidc/start",{redirectUri:`${window.location.origin}${window.location.pathname}`});
            sessionStorage.setItem("sdc.oidc.state", result.state);
            window.location.assign(result.authorizationUrl);
        } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start sign-in"); }
    }
    return <main className="signin"><div className="signin-card"><div className="brand-mark">R</div><p className="eyebrow">SERVER DRIVEN CHAT</p><h1>Your conversations,<br />under your control.</h1><p className="muted">Connect to an existing app conversation. The app remains responsible for running the model and enforcing its permissions.</p><button className="primary full" onClick={() => void signIn()}>Sign in securely <span aria-hidden="true">↗</span></button>{message && <p role="alert" className="error">{message}</p>}<p className="tiny">OAuth tokens stay in memory for this tab. Signing out clears this session.</p></div></main>;
}

function randomId(): string { return crypto.randomUUID(); }
function readable(value: unknown, fallback: string): string { return typeof value === "string" && value.trim() ? value : fallback; }
function bindingIdentity(payload: Record<string, unknown> = {}): Record<string, unknown> {
    return payload.binding && typeof payload.binding === "object" ? { ...payload, ...payload.binding as Record<string, unknown> } : payload;
}
function shortId(value: string): string { return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value; }
function textFrom(content: ContentBlock[]): string { return content.map(block => block.type === "text" ? block.text : block.type === "artifact" ? `[Artifact ${block.artifactId}]` : `[${block.type} ${block.type === "file" ? block.filename : block.attachmentId}]`).join("\n"); }

function App() {
    const [token, setToken] = useState<string | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [message, setMessage] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    const abortEvents = useRef<AbortController | null>(null);
    const session = sessions.find(item => item.sessionId === selectedId) ?? null;
    const listedBinding = session?.binding ?? null;
    const currentPayload = snapshot?.projection.sessionId === selectedId ? snapshot.bindings?.find(item => item.bindingId === listedBinding?.bindingId)?.payload : undefined;
    const binding = listedBinding ? { ...listedBinding, payload: currentPayload ?? listedBinding.payload } : null;
    const identity = bindingIdentity(binding?.payload);
    const role = session?.role;
    const canPrompt = role === "owner" || role === "operator";
    const canAdminister = role === "owner";
    const projection = snapshot?.projection;

    const refreshSessions = useCallback(async (currentToken: string) => {
        const result = await api<{ sessions: Session[] }>("/v2/sessions", currentToken);
        setSessions(result.sessions);
        setSelectedId(previous => result.sessions.some(item => item.sessionId === previous) ? previous : result.sessions[0]?.sessionId ?? "");
    }, []);
    const loadSnapshot = useCallback(async (currentToken: string, sessionId: string) => {
        const result = await api<Snapshot>(`/v2/sessions/${encodeURIComponent(sessionId)}/snapshot`, currentToken);
        setSnapshot(result);
    }, []);
    const signOut = useCallback(() => {
        abortEvents.current?.abort(); abortEvents.current = null;
        setToken(null); setSessions([]); setSelectedId(""); setSnapshot(null); setNotice(""); setError("");
    }, []);

    useEffect(() => { if (token) void refreshSessions(token).catch(handleError); }, [token, refreshSessions]);
    useEffect(() => {
        if (!token || !selectedId) { setSnapshot(null); return; }
        setLoading(true); setError("");
        void loadSnapshot(token, selectedId).catch(handleError).finally(() => setLoading(false));
    }, [token, selectedId, loadSnapshot]);

    useEffect(() => {
        if (!token || !selectedId) return;
        let disposed = false;
        const controller = new AbortController(); abortEvents.current?.abort(); abortEvents.current = controller;
        let cursor = snapshot?.cursors.sessionSeq ?? 0;
        const run = async (): Promise<void> => {
            while (!disposed && !controller.signal.aborted) {
                try {
                    const response = await fetch(`/v2/sessions/${encodeURIComponent(selectedId)}/events?after=${cursor}`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
                    if (!response.ok || !response.body) { if (response.status === 401) signOut(); await pause(2500, controller.signal); continue; }
                    const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "";
                    while (!disposed && !controller.signal.aborted) {
                        const { value, done } = await reader.read(); if (done) break;
                        pending += decoder.decode(value, { stream: true });
                        const frames = pending.split(/\r?\n\r?\n/); pending = frames.pop() ?? "";
                        for (const frame of frames) {
                            const id = /^id:\s*(\d+)/m.exec(frame)?.[1]; const data = /^data:\s*(.+)$/m.exec(frame)?.[1];
                            if (id) cursor = Math.max(cursor, Number(id));
                            if (data) { const record = JSON.parse(data) as { payload?: ProtocolEvent }; if (record.payload) void loadSnapshot(token, selectedId).catch(handleError); }
                        }
                    }
                } catch { if (!controller.signal.aborted) await pause(1500, controller.signal); }
            }
        };
        void run();
        const recovery = window.setInterval(() => { void refreshSessions(token).then(() => loadSnapshot(token, selectedId)).catch(handleError); }, 15_000);
        return () => { disposed = true; controller.abort(); window.clearInterval(recovery); };
    }, [token, selectedId, snapshot?.cursors.sessionSeq, loadSnapshot, refreshSessions, signOut]);

    function handleError(reason: unknown): void {
        const message = reason instanceof Error ? reason.message : "Request failed";
        setError(message);
        if ((reason as ApiError)?.status === 401) signOut();
    }

    async function act(action: () => Promise<string>): Promise<void> {
        if (!token || busy) return;
        setBusy(true); setError(""); setNotice("");
        try { setNotice(await action()); if (selectedId) await loadSnapshot(token, selectedId); }
        catch (reason) { handleError(reason); }
        finally { setBusy(false); }
    }

    function command(type: string, payload: Record<string, unknown>, turnId?: string, promptId?: string): Record<string, unknown> {
        if (!session || !binding) throw new Error("Select an active app conversation first");
        return { protocolVersion: "2.0", type, commandId: randomId(), lane: type === "turn.submit" ? "prompt" : "control", seq: 1,
            sessionId: session.sessionId, bindingRevision: binding.bindingRevision, leaseGeneration: binding.leaseGeneration,
            createdAt: new Date().toISOString(), ...(turnId ? { turnId } : {}), ...(promptId ? { promptId } : {}), payload };
    }

    async function submitPrompt(): Promise<void> {
        const text = message.trim(); if (!text && !files.length) return;
        await act(async () => {
            const bindingPayload = binding?.payload ?? {};
            const content: ContentBlock[] = [];
            if (text) content.push({ type: "text", text });
            for (const file of files) content.push(await uploadAttachment(file));
            await api(`/v2/sessions/${encodeURIComponent(selectedId)}/turns`, token!, { method: "POST", body: JSON.stringify({ command: command("turn.submit", { content, delivery: "queue", expectedConversationRevision: Number(bindingPayload.conversationRevision ?? 0) }, randomId(), randomId()) }) });
            setMessage(""); setFiles([]);
            return "Prompt queued by the server. App acceptance and execution will be shown only when observed.";
        });
    }

    async function uploadAttachment(file: File): Promise<ContentBlock> {
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        const sha256 = `sha256:${[...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,"0")).join("")}`;
        const uploaded = await fetch("/v2/attachments", { method: "POST", headers: { authorization: `Bearer ${token}`, "x-session-id": selectedId, "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name), "x-content-sha256": sha256 }, body: file });
        if (!uploaded.ok) throw new Error(`Attachment upload failed (${uploaded.status})`);
        const pending = await uploaded.json() as { attachmentId: string; sha256: string };
        await api(`/v2/attachments/${encodeURIComponent(pending.attachmentId)}/commit`,token!,{method:"POST",body:JSON.stringify({sha256:pending.sha256})});
        if (file.type.startsWith("image/")) return { type: "image", attachmentId: pending.attachmentId, mimeType: file.type };
        return { type: "file", attachmentId: pending.attachmentId, mimeType: file.type, filename: file.name };
    }

    async function postControl(payload: Record<string, unknown>, turnId?: string): Promise<string> {
        const value = command(payload.type as string, payload.payload as Record<string, unknown>, turnId);
        await api(`/v2/sessions/${encodeURIComponent(selectedId)}/turns/${encodeURIComponent(turnId ?? "control")}/controls`, token!, { method: "POST", body: JSON.stringify({ command: value }) });
        return payload.type === "session.disable" ? "Disable request recorded. Remote dispatch stops after the companion applies it; use its local disable action for immediate local protection." : "Control request recorded. This does not confirm that the app applied it.";
    }

    async function decide(request: ApprovalRequest, choiceId: string, grants: PermissionGrant[]): Promise<void> {
        await act(async () => {
            const expiresMs = Math.min(Date.parse(request.expiresAt), Date.now() + 120_000);
            const result = await api<{ disposition: string }>(`/v2/sessions/${encodeURIComponent(selectedId)}/approvals/${encodeURIComponent(request.requestId)}/decisions`, token!, { method: "POST", body: JSON.stringify({
                requestId: request.requestId, requestRevision: request.requestRevision, decisionId: randomId(), actionDigest: request.actionDigest, choiceId,
                grantedPermissions: grants, policyRevision: "manual-review-v1", expiresAt: new Date(expiresMs).toISOString()
            }) });
            return `${result.disposition === "identical" ? "Previously recorded" : "Decision recorded"}. Native application is a separate stage.`;
        });
    }

    async function download(attachmentId: string, label: string): Promise<void> {
        if (!token) return;
        try {
            const response = await fetch(`/v2/attachments/${encodeURIComponent(attachmentId)}`, { headers: { authorization: `Bearer ${token}` } });
            if (!response.ok) throw new Error(`Artifact download failed (${response.status})`);
            const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
            anchor.href = url; anchor.download = label; anchor.click(); URL.revokeObjectURL(url);
        } catch (reason) { handleError(reason); }
    }

    if (!token) return <OidcSignIn onToken={setToken} />;
    const active = Boolean(binding && binding.state === "active" && Date.parse(binding.leaseExpiresAt) > Date.now());
    const capabilities = (binding?.payload.capabilities ?? {}) as Record<string, { status?: string; reason?: string }>;
    const submitSupported = capabilities.submit?.status === "supported";
    const cancelSupported = capabilities.cancel?.status === "supported";
    const turnEntries = Object.entries(projection?.turnStates ?? {});
    const interruptible = (state: string): boolean => ["running", "waiting_for_approval", "waiting_for_input"].includes(state);
    const observedTurnOrder = new Map(projection?.items.map((item, index) => [item.turnId, index]) ?? []);
    // JSON key order is not turn chronology. Never truncate an active native control.
    const visibleTurns = [...turnEntries.filter(([, state]) => interruptible(state)), ...turnEntries.filter(([, state]) => !interruptible(state)).sort(([left], [right]) => (observedTurnOrder.get(right) ?? -1) - (observedTurnOrder.get(left) ?? -1)).slice(0, 4)];
    const decisionStage = (requestId: string): string => snapshot?.interactions.find(item => item.requestId === requestId)?.state ?? "pending";

    return <div className="app-shell">
        <aside className="rail"><div className="rail-logo">R</div><span className="rail-spacer"/><button className="icon-button" title="Refresh sessions" aria-label="Refresh sessions" onClick={() => void refreshSessions(token).catch(handleError)}>↻</button><div className="avatar" aria-label="Signed in">S</div></aside>
        <aside className="sidebar"><div className="sidebar-head"><div><p className="eyebrow">WORKSPACE</p><h2>Conversations</h2></div><button className="icon-button" onClick={() => void refreshSessions(token).catch(handleError)} aria-label="Refresh">↻</button></div>
            <div className="session-list">{sessions.length ? sessions.map(item => {
                const data = bindingIdentity(item.binding?.payload);
                return <button key={item.sessionId} className={`session-row ${item.sessionId === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(item.sessionId)}>
                    <span className={`connection-dot ${item.binding?.state === "active" && Date.parse(item.binding.leaseExpiresAt) > Date.now() ? "online" : "offline"}`} />
                    <span className="session-copy"><strong>{readable(data.conversationLabel ?? data.nativeConversationId, `Session ${shortId(item.sessionId)}`)}</strong><small>{readable(data.appName ?? data.appId, "Connected app unavailable")} · {item.role}</small></span>
                    <span className="session-chevron">›</span>
                </button>;
            }) : <p className="empty-note">No conversations are available to this account yet. Pair a device and bind a conversation in the companion.</p>}</div>
            <div className="sidebar-bottom"><div className="identity-card"><span className="avatar small">U</span><span><strong>Signed in</strong><small>Access expires with this tab</small></span><button className="icon-button" aria-label="Sign out" onClick={signOut}>↪</button></div></div>
        </aside>
        <main className="main-panel">
            {error && <div role="alert" className="toast error-toast">{error}<button className="icon-button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
            {notice && <div role="status" className="toast success-toast">{notice}<button className="icon-button" onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}
            {!session ? <div className="welcome"><span className="welcome-icon">✳</span><p className="eyebrow">REMOTE CONTROL</p><h1>Choose a conversation<br />to get started.</h1><p>Pick an existing app conversation. The server queues requests; the selected app does the work.</p></div> : <>
                <header className="topbar"><div><p className="eyebrow">{readable(identity.appName ?? identity.appId, "APP CONVERSATION")}</p><h1>{readable(identity.conversationLabel ?? identity.nativeConversationId, `Session ${shortId(session.sessionId)}`)}</h1></div><div className="topbar-actions"><span className={`health-pill ${active ? "healthy" : "unhealthy"}`}><i />{active ? "Bridge connected" : "Bridge unavailable"}</span><button className="secondary" onClick={() => void loadSnapshot(token, selectedId).catch(handleError)}>Refresh state</button></div></header>
                {!active && <div className="banner warning"><strong>This conversation is disconnected.</strong><span>Commands are unavailable until the companion reconnects and renews its lease.</span></div>}
                {binding && <section className="capability-strip"><div className="strip-heading"><strong>Connection capabilities</strong><span>{binding.state === "active" ? `Lease until ${new Date(binding.leaseExpiresAt).toLocaleTimeString()}` : "No active lease"}</span></div><div className="capability-list">{Object.entries(capabilities).map(([name, item]) => <span key={name} className={`capability ${item.status ?? "unverified"}`} title={item.reason}>{name.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)} · {item.status ?? "unverified"}</span>)}{Object.keys(capabilities).length === 0 && <span className="muted small-text">Capabilities have not been reported.</span>}</div></section>}
                {loading && !snapshot ? <div className="loading">Loading the latest session snapshot…</div> : <div className="workspace-grid">
                    <section className="transcript-panel"><div className="section-title"><div><p className="eyebrow">LIVE TRANSCRIPT</p><h2>Conversation</h2></div><span className="watermark">through event {projection?.watermark ?? 0}</span></div>
                        {projection?.needsRepair && <div className="banner warning compact">Transcript has a gap after event {projection.repairAfter}. Pending approvals are still shown; refreshing requests a consistent snapshot.</div>}
                        <div className="transcript" aria-live="polite">{projection?.items.length ? projection.items.map(item => <article key={item.itemId} className={`message-card ${item.kind}`}><div className="message-meta"><strong>{item.kind.replaceAll("_", " ")}</strong><span>{item.partial ? "Partial output" : item.evidence === "unknown" ? "Completion unknown" : item.completed ? "Complete" : item.evidence}</span></div><pre>{textFrom(item.content)}</pre></article>) : <div className="empty-transcript"><div className="sparkle">✳</div><strong>Waiting for the first message</strong><span>Server requests appear in the selected app conversation.</span></div>}
                            {projection?.artifacts.map(artifact => <article className="artifact-card" key={artifact.artifactId}><div><strong>{artifact.mimeType}</strong><small>{artifact.sizeBytes.toLocaleString()} bytes · SHA-256 {artifact.sha256.slice(7,19)}…</small></div>{artifact.state === "available" ? <button className="secondary" onClick={() => void download(artifact.attachmentId,`${artifact.artifactId}${artifact.mimeType === "application/pdf" ? ".pdf" : ""}`)}>Download artifact</button> : <span className="muted">Artifact unavailable</span>}</article>)}
                        </div>
                        <section className="composer-wrap"><form className="composer" onSubmit={event => { event.preventDefault(); void submitPrompt(); }}><textarea aria-label="Message" placeholder={canPrompt && submitSupported ? "Send a message to this conversation…" : !canPrompt ? "You have read-only access to this conversation." : "Prompt submission is not supported by this app."} value={message} onChange={event => setMessage(event.target.value)} disabled={!canPrompt || !submitSupported || !active || busy} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitPrompt(); } }} />{files.length > 0 && <div className="selected-files">{files.map((file,index) => <span key={`${file.name}:${index}`}>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(current => current.filter((_,itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}<div className="composer-footer"><label className="attach-button">＋ Attach<input aria-label="Attach files" type="file" multiple accept=".pdf,.json,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,application/json,text/plain,text/markdown,image/png,image/jpeg,image/webp" disabled={!canPrompt || !submitSupported || !active || busy} onChange={event => { const selected = Array.from(event.currentTarget.files ?? []); setFiles(current => [...current,...selected]); event.currentTarget.value = ""; }} /></label><span>Enter to send · Shift+Enter for a new line</span><button className="primary" type="submit" disabled={!canPrompt || !submitSupported || !active || busy || (!message.trim() && !files.length)}>Queue prompt <span aria-hidden="true">↑</span></button></div></form><small className="composer-note">{submitSupported ? "Attachments are verified before queueing. The server does not run an LLM." : capabilities.submit?.reason ?? "The selected app has not confirmed prompt support."}</small></section>
                    </section>
                    <aside className="interaction-panel"><div className="section-title"><div><p className="eyebrow">NEEDS YOUR ATTENTION</p><h2>Interactions</h2></div><span className="count-badge">{(projection?.pendingApprovals.length ?? 0) + (snapshot?.interactions.filter(item => item.kind === "input" && item.state === "pending").length ?? 0)}</span></div>
                        {projection?.pendingApprovals.map(request => <ApprovalCard key={`${request.requestId}:${request.requestRevision}`} request={request} stage={decisionStage(request.requestId)} canReview={canAdminister && active && !busy} unavailableReason={!canAdminister ? "owner" : !active ? "offline" : busy ? "busy" : undefined} onDecide={(choice, grants) => void decide(request, choice, grants)} />)}
                        {snapshot?.interactions.filter(item => item.kind === "input" && item.state === "pending").map(item => <InputCard key={`${item.requestId}:${item.requestRevision}`} interaction={item} canAnswer={canPrompt && active && !busy} onAnswer={answer => void act(async () => { await postControl({ type: "input.respond", payload: { requestId: item.requestId, requestRevision: item.requestRevision, answer } }); return "Answer recorded for delivery. Resolution will be reported by the app."; })} />)}
                        {!projection?.pendingApprovals.length && !snapshot?.interactions.some(item => item.kind === "input" && item.state === "pending") && <div className="clear-state"><span>✓</span><strong>All caught up</strong><small>Questions and approval requests appear here.</small></div>}
                        <div className="turn-state"><p className="eyebrow">TURN STATUS</p>{visibleTurns.map(([turn, state]) => <div className="turn-row" key={turn}><span>{state.replaceAll("_", " ")}</span><small>{shortId(turn)}</small>{interruptible(state) ? cancelSupported ? <button className="text-button" disabled={!active || !canPrompt || busy} onClick={() => void act(() => postControl({ type: "turn.cancel", payload: { reason: "Requested from server control interface" } }, turn))}>Request stop</button> : <span className="unsupported-control" title={capabilities.cancel?.reason ?? "This app has not confirmed cancellation support."}>Stop unavailable</span> : null}</div>)}{turnEntries.length === 0 && <small className="muted">No observed turns.</small>}</div>
                        <div className="admin-actions"><p className="eyebrow">SESSION CONTROLS</p><button className="danger-quiet" disabled={!canAdminister || !active || busy || session.state !== "active"} onClick={() => void act(() => postControl({ type: "session.disable", payload: { reason: "Owner requested remote dispatch disable" } }))}>Request remote disable</button><small>Server request; use the companion's local disable to immediately block dispatch.</small></div>
                    </aside>
                </div>}
            </>}
            <footer className="global-footer"><span><i className={`connection-dot ${active ? "online" : "offline"}`} />{active ? "Connected through the local bridge" : "Waiting for an active bridge"}</span><span>App-owned execution · No model runtime on server</span></footer>
        </main>
    </div>;
}

function ApprovalCard({ request, stage, canReview, unavailableReason, onDecide }: { request: ApprovalRequest; stage: string; canReview: boolean; unavailableReason?: "owner" | "offline" | "busy"; onDecide: (choiceId: string, grants: PermissionGrant[]) => void }) {
    const [selected, setSelected] = useState(""); const [grants, setGrants] = useState<PermissionGrant[]>([]);
    const requested = useMemo(() => request.requestedPermissions, [request.requestedPermissions]);
    const selectedChoice = request.availableDecisions.find(choice => choice.id === selected);
    const decided = stage !== "pending";
    const unavailableLabel = unavailableReason === "offline" ? "Bridge unavailable" : unavailableReason === "busy" ? "Request in progress" : "Owner review required";
    const unavailableMessage = unavailableReason === "offline" ? "Reconnect the companion before recording a decision for this request." : unavailableReason === "busy" ? "Wait for the current request to finish." : "Only the session owner can record approval decisions.";
    return <article className="approval-card"><div className="approval-card-head"><span className="approval-icon">!</span><span><strong>{request.kind === "permission_grant" ? "Permission request" : "Action approval"}</strong><small>{stage.replaceAll("_", " ")}</small></span><span className="expires">Expires {new Date(request.expiresAt).toLocaleTimeString()}</span></div>
        <div className="action-detail"><span className="detail-label">ACTION</span><strong>{request.action.tool}</strong><pre>{JSON.stringify(request.action.arguments, null, 2)}</pre><span className="detail-label">TARGET</span><strong>{request.nativeConversationId}</strong></div>
        {requested.length > 0 && <div className="grant-list"><span className="detail-label">REQUESTED SCOPE · select each grant separately</span>{requested.map((grant, index) => <label key={`${grant.resource}:${grant.operation}:${index}`} className="grant-option"><input type="checkbox" checked={grants.includes(grant)} disabled={!canReview || decided} onChange={event => setGrants(current => event.target.checked ? [...current, grant] : current.filter(item => item !== grant))} /><span><strong>{grant.operation}</strong><small>{grant.resource} · {JSON.stringify(grant.scope)}</small></span></label>)}</div>}
        <div className="evidence-line"><span>Observed via {request.evidence.source}</span><span>{request.evidence.complete ? "Complete evidence" : "Partial evidence"}</span></div>
        {decided ? <div className="decision-stage"><strong>Decision recorded</strong><span>Application is reported separately by the local app adapter.</span><span className="stage-current">Current stage: {stage.replaceAll("_", " ")}</span></div> : <><label className="choice-label" htmlFor={`choice-${request.requestId}`}>Decision</label><select id={`choice-${request.requestId}`} value={selected} disabled={!canReview} onChange={event => { setSelected(event.target.value); setGrants([]); }}><option value="">Choose an offered response…</option>{request.availableDecisions.map(choice => <option key={choice.id} value={choice.id}>{choice.effect} · {choice.scope}</option>)}</select><button className="primary full" disabled={!canReview || !selectedChoice || (selectedChoice.effect !== "allow" && grants.length > 0)} onClick={() => onDecide(selected, selectedChoice?.effect === "allow" ? grants : [])}>{canReview ? "Record decision" : unavailableLabel}</button>{!canReview && <small className="muted">{unavailableMessage}</small>}</>}
    </article>;
}

function InputCard({ interaction, canAnswer, onAnswer }: { interaction: Snapshot["interactions"][number]; canAnswer: boolean; onAnswer: (answer: JsonValue) => void }) {
    const payload = interaction.payload;
    const [answer, setAnswer] = useState("");
    const choices = Array.isArray(payload.allowedChoices) ? payload.allowedChoices.filter((choice): choice is string => typeof choice === "string") : [];
    return <article className="approval-card input-card"><div className="approval-card-head"><span className="question-icon">?</span><span><strong>Question</strong><small>Request {shortId(interaction.requestId)}</small></span></div><p>{readable(payload.question, "The app requested more information.")}</p>{choices.length ? <select aria-label="Answer" value={answer} disabled={!canAnswer} onChange={event => setAnswer(event.target.value)}><option value="">Choose an answer…</option>{choices.map(choice => <option key={choice}>{choice}</option>)}</select> : <textarea aria-label="Answer" value={answer} disabled={!canAnswer} onChange={event => setAnswer(event.target.value)} placeholder="Your answer" />}{canAnswer && <button className="primary full" disabled={!answer} onClick={() => onAnswer(answer)}>{canAnswer ? "Send answer" : "Answer unavailable"}</button>}</article>;
}

function pause(milliseconds: number, signal: AbortSignal): Promise<void> { return new Promise(resolve => { const timer = window.setTimeout(resolve, milliseconds); signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true }); }); }

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
