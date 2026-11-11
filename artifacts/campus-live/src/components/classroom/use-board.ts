"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../../auth-token';

export type Pt = { x: number; y: number };
export type Stroke = { kind: 'stroke'; tool: 'pen' | 'highlighter' | 'eraser'; color: string; width: number; points: Pt[] };
export type BoardOp = { seq: number; id: string; userId: string; op: Stroke };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cfg = any;
export type BoardStatus = 'connecting' | 'live' | 'reconnecting' | 'closed';

// 'polling' works everywhere (including serverless hosting, where the
// WebSocket endpoint cannot be served); 'ws' is for standalone API
// deployments with the same-origin board WebSocket.
const TRANSPORT = (process.env.NEXT_PUBLIC_BOARD_TRANSPORT ?? 'polling') === 'ws' ? 'ws' : 'polling';
const POLL_INTERVAL_MS = 1000;

const authHeaders = (): Record<string, string> => {
  const t = getAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export function useBoard(boardId: string | undefined, userId: string) {
  const [status, setStatus] = useState<BoardStatus>('connecting');
  const [config, setConfig] = useState<Cfg>(null);
  const [canDraw, setCanDraw] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [grants, setGrants] = useState<Record<string, boolean>>({});
  const opsRef = useRef<BoardOp[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const lastAdded = useRef<BoardOp[]>([]);
  const resetFlag = useRef(false);
  const liveRef = useRef(false);

  useEffect(() => {
    liveRef.current = status === 'live';
  }, [status]);

  const addOp = useCallback((o: BoardOp) => {
    if (!o || !o.op || seen.current.has(o.id)) return;
    seen.current.add(o.id); opsRef.current.push(o); lastAdded.current.push(o);
  }, []);

  useEffect(() => {
    if (!boardId || typeof window === 'undefined') { setStatus('closed'); return; }
    let stop = false; let attempt = 0; let timer: ReturnType<typeof setTimeout> | undefined;

    if (TRANSPORT === 'polling') {
      let since: number | undefined;
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      let polling = false;
      let lastConfigJson: string | null = null;

      const applySync = (m: { seq: number; config: Cfg; ops: BoardOp[]; canDraw: boolean; canManage: boolean }) => {
        if (since === undefined) {
          seen.current = new Set(); opsRef.current = []; lastAdded.current = []; resetFlag.current = true;
        }
        const configJson = JSON.stringify(m.config ?? null);
        if (configJson !== lastConfigJson) { lastConfigJson = configJson; setConfig(m.config); }
        setCanDraw(!!m.canDraw); setCanManage(!!m.canManage);
        let changed = false;
        for (const o of m.ops ?? []) { addOp(o); changed = true; }
        if (since === undefined || changed) setVersion(v => v + 1);
        since = m.seq;
      };

      const poll = async () => {
        if (stop || polling) return;
        polling = true;
        try {
          const res = await fetch(`/api/board/boards/${encodeURIComponent(boardId!)}/sync${since === undefined ? '' : `?since=${since}`}`, { headers: authHeaders(), credentials: 'include' });
          if (res.status === 409) { stop = true; setCanDraw(false); setStatus('closed'); return; }
          if (res.status === 401) { await import('../../auth-token').then(m => m.refreshRememberedSession()); }
          if (!res.ok) throw new Error(res.status === 403 ? 'You do not have access to this board.' : `Board sync failed (${res.status}).`);
          const m = await res.json();
          if (stop) return;
          attempt = 0; setError(null);
          setStatus('live');
          applySync(m);
        } catch (e) {
          if (stop) return;
          setError(e instanceof Error ? e.message : 'Board sync failed.');
          setStatus('reconnecting'); attempt += 1;
        } finally {
          polling = false;
        }
        if (!stop) pollTimer = setTimeout(poll, attempt === 0 ? POLL_INTERVAL_MS : Math.min(8000, 800 * 2 ** Math.min(attempt, 4)));
      };

      // expose a trigger so local sends can fetch peers' ops immediately
      (window as unknown as { __boardNudge?: () => void }).__boardNudge = () => { if (!stop) { if (pollTimer) clearTimeout(pollTimer); void poll(); } };
      void poll();
      return () => { stop = true; if (pollTimer) clearTimeout(pollTimer); delete (window as unknown as { __boardNudge?: () => void }).__boardNudge; };
    }

    const connect = async () => {
      if (stop) return;
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      try {
        const res = await fetch(`/api/board/boards/${encodeURIComponent(boardId)}/ticket`, { method: 'POST', headers: authHeaders(), credentials: 'include' });
         if (res.status === 409) { stop = true; setStatus('closed'); return; }
        if (!res.ok) throw new Error(res.status === 403 ? 'You do not have access to this board.' : `Board ticket request failed (${res.status}).`);
        const { ticket } = await res.json() as { ticket: string };
        if (stop) return;
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${proto}://${window.location.host}/api/board/boards/${encodeURIComponent(boardId)}/ws?ticket=${encodeURIComponent(ticket)}`);
        wsRef.current = ws;
        ws.onmessage = ev => {
          let m: any; try { m = JSON.parse(String(ev.data)); } catch { return; } // eslint-disable-line @typescript-eslint/no-explicit-any
          if (m.type === 'hello') {
            attempt = 0; setError(null);
            setConfig(m.config); setCanDraw(!!m.canDraw); setCanManage(!!m.canManage);
            seen.current = new Set(); opsRef.current = []; lastAdded.current = []; resetFlag.current = true;
            for (const o of m.ops ?? []) addOp(o);
            setStatus('live'); setVersion(v => v + 1);
          } else if (m.type === 'op') { addOp(m as BoardOp); setVersion(v => v + 1); }
          else if (m.type === 'config') { setConfig(m.config); }
           else if (m.type === 'grant') {
             setGrants(g => ({ ...g, [m.userId]: !!m.canDraw }));
             if (m.userId === userId) setCanDraw(!!m.canDraw);
           }
           else if (m.type === 'closed') { stop = true; setCanDraw(false); setStatus('closed'); ws.close(); }
          else if (m.type === 'error') { setError(m.message || m.code || 'Board error'); }
        };
        ws.onclose = () => {
          if (stop) return;
          setStatus('reconnecting'); attempt += 1;
          timer = setTimeout(connect, Math.min(8000, 800 * 2 ** Math.min(attempt, 4)));
        };
        ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
      } catch (e) {
        if (stop) return;
        setError(e instanceof Error ? e.message : 'Board connection failed.');
        setStatus('reconnecting'); attempt += 1;
        timer = setTimeout(connect, Math.min(8000, 800 * 2 ** Math.min(attempt, 4)));
      }
    };
    void connect();
    return () => { stop = true; if (timer) clearTimeout(timer); wsRef.current?.close(); };
  }, [boardId, userId]);

  const post = useCallback(async (path: string, body: unknown): Promise<{ ok: boolean; data?: unknown }> => {
    try {
      const res = await fetch(`/api/board/boards/${encodeURIComponent(boardId ?? '')}/${path}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = res.ok ? await res.json().catch(() => undefined) : undefined;
      return { ok: res.ok, data };
    } catch {
      return { ok: false };
    }
  }, [boardId]);

  const send = useCallback((m: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(m)); return true; }
    return false;
  }, []);
  const sendStroke = useCallback((op: Stroke) => {
    const id = crypto.randomUUID();
    if (TRANSPORT === 'ws') return send({ type: 'op', id, op });
    if (!liveRef.current) return false;
    void post('ops', { id, op }).then(({ ok, data }) => {
      const nudge = (window as unknown as { __boardNudge?: () => void }).__boardNudge;
      if (nudge) nudge();
      if (ok && data && (data as BoardOp).seq) { addOp(data as BoardOp); setVersion(v => v + 1); }
    });
    return true;
  }, [send, post, addOp]);
  const sendConfig = useCallback((c: Cfg) => {
    if (TRANSPORT === 'ws') return send({ type: 'config', config: c });
    void post('config', { config: c }).then(({ ok }) => { if (ok) setConfig(c); });
    return liveRef.current;
  }, [send, post]);
  const sendGrant = useCallback((userId: string, d: boolean) => {
    if (TRANSPORT === 'ws') { const ok = send({ type: 'grant', userId, canDraw: d }); if (ok) setGrants(g => ({ ...g, [userId]: d })); return ok; }
    if (!liveRef.current) return false;
    void post('grants', { userId, canDraw: d });
    setGrants(g => ({ ...g, [userId]: d }));
    return true;
  }, [send, post]);

  // addOp is shared by the WebSocket and polling transports above
  const drain = useCallback(() => { const r = resetFlag.current; resetFlag.current = false; const a = lastAdded.current; lastAdded.current = []; return { reset: r, added: a, all: opsRef.current }; }, []);

  return { status, config, canDraw, canManage, error, version, grants, sendStroke, sendConfig, sendGrant, drain, dismissError: () => setError(null) };
}
