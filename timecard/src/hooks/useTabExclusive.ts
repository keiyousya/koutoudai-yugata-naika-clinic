import { useState, useEffect, useRef } from "react";

// Web Locks API のロック名（同一オリジンの全タブ・全ウィンドウで共有される）
const LOCK_NAME = "timecard-nfc-exclusive";

/**
 * NFC リーダーを 1 タブ（1 ウィンドウ）だけが使えるよう排他制御する。
 *
 * Web Locks API を使用。リーダーになれたタブだけが排他ロックを保持し続け、
 * 他のタブ/ウィンドウは待機列に入って `otherTabActive = true` になる。
 * ロック保持タブが閉じる・クラッシュするとブラウザが自動でロックを解放し、
 * 待機列の次のタブが自動的にリーダーへ昇格する。
 *
 * BroadcastChannel + ハートビート方式と異なり、別ウィンドウ間でも確実に動作し、
 * Windows でも取りこぼしがない。
 */
export function useTabExclusive() {
  const [isLeader, setIsLeader] = useState(false);
  const [otherTabActive, setOtherTabActive] = useState(false);
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Web Locks 非対応ブラウザでは排他制御せず、自タブをリーダー扱いにする
    if (typeof navigator === "undefined" || !("locks" in navigator)) {
      console.warn("[TabExclusive] Web Locks API 非対応のため排他制御は無効です");
      setIsLeader(true);
      return;
    }

    let active = true;
    const controller = new AbortController();

    (async () => {
      // 1. 現在ロックが他タブに保持されているか確認し、必要なら即座にオーバーレイ表示
      try {
        const state = await navigator.locks.query();
        if (!active) return;
        const heldByOther = (state.held ?? []).some(
          (lock) => lock.name === LOCK_NAME
        );
        if (heldByOther) {
          console.log("[TabExclusive] 他のタブがアクティブです");
          setOtherTabActive(true);
        }
      } catch (e) {
        console.warn("[TabExclusive] ロック状態の確認に失敗:", e);
      }

      if (!active) return;

      // 2. 排他ロックを要求。他タブが保持中なら待機列に入る。
      //    コールバックが呼ばれた時点で「このタブがリーダー」。
      try {
        await navigator.locks.request(
          LOCK_NAME,
          { mode: "exclusive", signal: controller.signal },
          () => {
            if (!active) return;
            console.log("[TabExclusive] リーダーになりました");
            setIsLeader(true);
            setOtherTabActive(false);
            // ロックを保持し続ける。クリーンアップで resolve するまで解放しない。
            return new Promise<void>((resolve) => {
              releaseRef.current = resolve;
            });
          }
        );
      } catch (e) {
        // 待機中にクリーンアップで abort された場合は AbortError（想定内）
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          console.warn("[TabExclusive] ロック要求エラー:", e);
        }
      }
    })();

    return () => {
      active = false;
      // ロック保持中なら解放（→ 待機中の他タブが昇格できる）
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
      // まだ待機中なら要求をキャンセル
      controller.abort();
    };
  }, []);

  return {
    isLeader,
    otherTabActive,
  };
}
