import { useState, useEffect, useRef, useCallback } from "react";

const CHANNEL_NAME = "timecard-tab-exclusive";
const CLAIM_DELAY = 300; // リーダー主張までの待機時間(ms)
const HEARTBEAT_INTERVAL = 2000; // ハートビート間隔(ms)
const HEARTBEAT_TIMEOUT = 5000; // リーダー不在とみなすまでの時間(ms)

type Message =
  | { type: "ping"; tabId: string }
  | { type: "pong"; tabId: string }
  | { type: "claim"; tabId: string }
  | { type: "heartbeat"; tabId: string }
  | { type: "release"; tabId: string };

export function useTabExclusive() {
  const [isLeader, setIsLeader] = useState(false);
  const [otherTabActive, setOtherTabActive] = useState(false);
  const tabIdRef = useRef(crypto.randomUUID());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const lastHeartbeatRef = useRef<number>(0);
  const claimTimeoutRef = useRef<number | null>(null);

  // リーダーとしてハートビートを送信
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }
    heartbeatTimerRef.current = window.setInterval(() => {
      channelRef.current?.postMessage({
        type: "heartbeat",
        tabId: tabIdRef.current,
      });
    }, HEARTBEAT_INTERVAL);
  }, []);

  // ハートビート監視（フォロワー用）
  const startHeartbeatMonitor = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }
    lastHeartbeatRef.current = Date.now();
    heartbeatTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - lastHeartbeatRef.current;
      if (elapsed > HEARTBEAT_TIMEOUT) {
        // リーダーが不在、自分がリーダーになる
        console.log("[TabExclusive] リーダー不在を検出、リーダーを引き継ぎます");
        setOtherTabActive(false);
        setIsLeader(true);
        channelRef.current?.postMessage({
          type: "claim",
          tabId: tabIdRef.current,
        });
        startHeartbeat();
      }
    }, 1000);
  }, [startHeartbeat]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    // 他のタブにping送信
    channel.postMessage({ type: "ping", tabId: tabIdRef.current });

    // 一定時間pongがなければリーダーを主張
    claimTimeoutRef.current = window.setTimeout(() => {
      console.log("[TabExclusive] リーダーを主張します");
      setIsLeader(true);
      channel.postMessage({ type: "claim", tabId: tabIdRef.current });
      startHeartbeat();
    }, CLAIM_DELAY);

    channel.onmessage = (event: MessageEvent<Message>) => {
      const msg = event.data;

      switch (msg.type) {
        case "ping":
          // 自分がリーダーならpongを返す
          if (tabIdRef.current !== msg.tabId) {
            setIsLeader((current) => {
              if (current) {
                channel.postMessage({ type: "pong", tabId: tabIdRef.current });
              }
              return current;
            });
          }
          break;

        case "pong":
          // 他のタブがリーダー
          if (claimTimeoutRef.current) {
            clearTimeout(claimTimeoutRef.current);
            claimTimeoutRef.current = null;
          }
          console.log("[TabExclusive] 他のタブがアクティブです");
          setOtherTabActive(true);
          setIsLeader(false);
          lastHeartbeatRef.current = Date.now();
          startHeartbeatMonitor();
          break;

        case "claim":
          if (msg.tabId !== tabIdRef.current) {
            // 他のタブがリーダーを主張
            if (claimTimeoutRef.current) {
              clearTimeout(claimTimeoutRef.current);
              claimTimeoutRef.current = null;
            }
            setIsLeader(false);
            setOtherTabActive(true);
            lastHeartbeatRef.current = Date.now();
            startHeartbeatMonitor();
          }
          break;

        case "heartbeat":
          if (msg.tabId !== tabIdRef.current) {
            lastHeartbeatRef.current = Date.now();
          }
          break;

        case "release":
          if (msg.tabId !== tabIdRef.current) {
            // リーダーが離脱、リーダーを引き継ぐ
            console.log("[TabExclusive] リーダーが離脱、引き継ぎます");
            setOtherTabActive(false);
            // 少し待ってからリーダーを主張（複数タブの競合を避ける）
            setTimeout(() => {
              channel.postMessage({ type: "ping", tabId: tabIdRef.current });
              claimTimeoutRef.current = window.setTimeout(() => {
                setIsLeader(true);
                channel.postMessage({ type: "claim", tabId: tabIdRef.current });
                startHeartbeat();
              }, CLAIM_DELAY);
            }, Math.random() * 200);
          }
          break;
      }
    };

    // タブを閉じる・離脱時にrelease送信
    const handleBeforeUnload = () => {
      channel.postMessage({ type: "release", tabId: tabIdRef.current });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (claimTimeoutRef.current) {
        clearTimeout(claimTimeoutRef.current);
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
      channel.postMessage({ type: "release", tabId: tabIdRef.current });
      channel.close();
    };
  }, [startHeartbeat, startHeartbeatMonitor]);

  return {
    isLeader,
    otherTabActive,
    tabId: tabIdRef.current,
  };
}
