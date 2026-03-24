import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from "react";

// Sony PaSoRi の USB Vendor ID
const SONY_VENDOR_ID = 0x054c;

// 対応 Product ID 一覧
const PASORI_PRODUCTS: Record<number, string> = {
  0x06c1: "RC-S380/S",
  0x06c3: "RC-S380/P",
  0x0dc8: "RC-S300/S",
  0x0dc9: "RC-S300/P",
};

function isRC_S300(productId: number): boolean {
  return productId === 0x0dc8 || productId === 0x0dc9;
}

function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// RC-S300 プロトコル（CCID-like transparent commands）
// ============================================================

class RCS300 {
  private device: USBDevice;
  private epIn: number;
  private epOut: number;
  private seq = 0;

  constructor(device: USBDevice, epIn: number, epOut: number) {
    this.device = device;
    this.epIn = epIn;
    this.epOut = epOut;
  }

  static async init(device: USBDevice): Promise<RCS300> {
    await device.open();
    await device.selectConfiguration(
      device.configurations[0].configurationValue
    );

    // Claim vendor-specific interface (class 255)
    const iface = device.configuration!.interfaces.find(
      (i) => i.alternate.interfaceClass === 255
    );
    if (!iface) {
      const fallback = device.configuration!.interfaces[0];
      if (!fallback) throw new Error("RC-S300 の対応インターフェースが見つかりません");
      const epIn = fallback.alternate.endpoints.find((e) => e.direction === "in")!.endpointNumber;
      const epOut = fallback.alternate.endpoints.find((e) => e.direction === "out")!.endpointNumber;
      await device.claimInterface(fallback.interfaceNumber);
      return new RCS300(device, epIn, epOut);
    }

    const epIn = iface.alternate.endpoints.find((e) => e.direction === "in")!.endpointNumber;
    const epOut = iface.alternate.endpoints.find((e) => e.direction === "out")!.endpointNumber;

    await device.claimInterface(iface.interfaceNumber);
    console.log(`[NFC] Claimed interface ${iface.interfaceNumber} (class 255), epIn=${epIn}, epOut=${epOut}`);

    return new RCS300(device, epIn, epOut);
  }

  private async send(data: number[]): Promise<void> {
    const payload = new Uint8Array(data);
    const pkt = new Uint8Array(10 + payload.length);
    pkt[0] = 0x6b;
    pkt[1] = payload.length & 0xff;
    pkt[2] = (payload.length >> 8) & 0xff;
    pkt[3] = (payload.length >> 16) & 0xff;
    pkt[4] = (payload.length >> 24) & 0xff;
    pkt[5] = 0x00;
    pkt[6] = ++this.seq & 0xff;
    if (payload.length > 0) pkt.set(payload, 10);
    console.log("[NFC] SEND ep=" + this.epOut + ":", toHex(Array.from(pkt)));
    await this.device.transferOut(this.epOut, pkt);
    await sleep(20);
  }

  private async receive(len: number): Promise<number[]> {
    const result = await this.device.transferIn(this.epIn, len);
    await sleep(10);
    const arr: number[] = [];
    if (result.data) {
      const u8 = new Uint8Array(result.data.buffer);
      for (let i = 0; i < u8.length; i++) {
        arr.push(u8[i]);
      }
    }
    console.log("[NFC] RECV ep=" + this.epIn + ":", toHex(arr), `(${arr.length} bytes)`);
    return arr;
  }

  async pollFelica(): Promise<string | null> {
    const LEN = 64;
    try {
      await this.send([0xff, 0x50, 0x00, 0x00, 0x02, 0x82, 0x00, 0x00]);
      await this.receive(LEN);
      await this.send([0xff, 0x50, 0x00, 0x00, 0x02, 0x81, 0x00, 0x00]);
      await this.receive(LEN);
      await this.send([0xff, 0x50, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00]);
      await this.receive(LEN);
      await this.send([0xff, 0x50, 0x00, 0x00, 0x02, 0x84, 0x00, 0x00]);
      await this.receive(LEN);
      await this.send([0xff, 0x50, 0x00, 0x02, 0x04, 0x8f, 0x02, 0x03, 0x00, 0x00]);
      await this.receive(LEN);
      await this.send([
        0xff, 0x50, 0x00, 0x01, 0x00, 0x00,
        0x11,
        0x5f, 0x46, 0x04,
        0xa0, 0x86, 0x01, 0x00,
        0x95, 0x82,
        0x00, 0x06,
        0x06, 0x00, 0xff, 0xff, 0x01, 0x00,
        0x00, 0x00, 0x00,
      ]);
      const res = await this.receive(LEN);
      console.log("[NFC] poll response:", res.length, "bytes:", toHex(res));

      if (res.length >= 34) {
        const idm = res.slice(26, 34);
        if (idm.some((b) => b !== 0)) {
          console.log("[NFC] IDm found:", toHex(idm));
          return toHex(idm);
        }
      }
      if (res.length >= 30) {
        for (let i = 10; i < res.length - 10; i++) {
          const plen = res[i];
          if (plen >= 17 && plen <= 30 && i + 1 < res.length && res[i + 1] === 0x01 && i + plen <= res.length) {
            const idm = res.slice(i + 2, i + 10);
            if (idm.length === 8 && idm.some((b) => b !== 0)) {
              console.log("[NFC] IDm found (alt offset):", toHex(idm), "at", i);
              return toHex(idm);
            }
          }
        }
      }
      return null;
    } catch (e) {
      console.error("[NFC] pollFelica error:", e);
      return null;
    }
  }

}

// ============================================================
// RC-S380 プロトコル（NFC Port-100）
// ============================================================

class RCS380 {
  private device: USBDevice;
  private epIn: number;
  private epOut: number;

  constructor(device: USBDevice, epIn: number, epOut: number) {
    this.device = device;
    this.epIn = epIn;
    this.epOut = epOut;
  }

  static async init(device: USBDevice): Promise<RCS380> {
    await device.open();
    await device.selectConfiguration(
      device.configurations[0].configurationValue
    );
    const iface = device.configuration!.interfaces[0];
    const epIn = iface.alternate.endpoints.find((e) => e.direction === "in")!.endpointNumber;
    const epOut = iface.alternate.endpoints.find((e) => e.direction === "out")!.endpointNumber;
    await device.claimInterface(iface.interfaceNumber);
    const reader = new RCS380(device, epIn, epOut);
    await reader.sendRaw([0x00, 0x00, 0xff, 0x00, 0xff, 0x00]);
    await reader.sendCmd([0xd6, 0x2a, 0x01]);
    await reader.receiveResp();
    return reader;
  }

  private async sendRaw(data: number[]): Promise<void> {
    const buf = new Uint8Array(data);
    await this.device.transferOut(this.epOut, buf.buffer as ArrayBuffer);
    await sleep(10);
  }

  private async sendCmd(data: number[]): Promise<void> {
    const len = data.length;
    const lcs = (256 - (len & 0xff)) & 0xff;
    let dcs = 0;
    for (const b of data) dcs += b;
    dcs = (256 - (dcs & 0xff)) & 0xff;
    const pkt = [0x00, 0x00, 0xff, 0xff, 0xff,
      len & 0xff, (len >> 8) & 0xff, lcs,
      ...data, dcs, 0x00];
    await this.sendRaw(pkt);
  }

  private async receiveResp(): Promise<number[]> {
    await this.device.transferIn(this.epIn, 6);
    await sleep(5);
    const result = await this.device.transferIn(this.epIn, 290);
    const arr: number[] = [];
    if (result.data) {
      for (let i = 0; i < result.data.byteLength; i++) {
        arr.push(result.data.getUint8(i));
      }
    }
    return arr;
  }

  async pollFelica(): Promise<string | null> {
    try {
      await this.sendCmd([0xd6, 0x06, 0x00]);
      await this.receiveResp();
      await this.sendCmd([0xd6, 0x06, 0x00]);
      await this.receiveResp();
      await this.sendCmd([0xd6, 0x00, 0x01, 0x01, 0x0f, 0x01]);
      await this.receiveResp();
      await this.sendCmd([
        0xd6, 0x02,
        0x00, 0x18, 0x01, 0x01, 0x02, 0x01, 0x03, 0x00,
        0x04, 0x00, 0x05, 0x00, 0x06, 0x00, 0x07, 0x08,
        0x08, 0x00, 0x09, 0x00, 0x0a, 0x00, 0x0b, 0x00,
        0x0c, 0x00, 0x0e, 0x04, 0x0f, 0x00, 0x10, 0x00,
        0x11, 0x00, 0x12, 0x00, 0x13, 0x06,
      ]);
      await this.receiveResp();
      await this.sendCmd([0xd6, 0x02, 0x00, 0x18]);
      await this.receiveResp();
      await this.sendCmd([
        0xd6, 0x04, 0x6e, 0x00,
        0x06, 0x00, 0xff, 0xff, 0x01, 0x00,
      ]);
      const res = await this.receiveResp();
      if (res.length >= 25) {
        const idm = res.slice(17, 25);
        if (idm.some((b) => b !== 0)) {
          return toHex(idm);
        }
      }
      return null;
    } catch {
      return null;
    }
  }

}

// ============================================================
// Context
// ============================================================

interface PasoriReader {
  pollFelica(): Promise<string | null>;
}

export interface NfcContextValue {
  isSupported: boolean;
  isConnected: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  subscribe: (cb: (uid: string) => void) => () => void;
}

const NfcContext = createContext<NfcContextValue | null>(null);

export function NfcProvider({ children, pollingInterval = 500 }: { children: React.ReactNode; pollingInterval?: number }) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deviceRef = useRef<USBDevice | null>(null);
  const readerRef = useRef<PasoriReader | null>(null);
  const pollingRef = useRef<number | null>(null);
  const subscribersRef = useRef<Set<(uid: string) => void>>(new Set());

  const isSupported = typeof navigator !== "undefined" && "usb" in navigator;

  const subscribe = useCallback((cb: (uid: string) => void) => {
    subscribersRef.current.add(cb);
    return () => { subscribersRef.current.delete(cb); };
  }, []);

  const initDevice = useCallback(async (device: USBDevice) => {
    if (readerRef.current) return;

    const modelName = PASORI_PRODUCTS[device.productId] || `Unknown (${device.productId.toString(16)})`;
    console.log(`PaSoRi 接続: ${modelName}`);

    let reader: PasoriReader;
    if (isRC_S300(device.productId)) {
      reader = await RCS300.init(device);
    } else {
      reader = await RCS380.init(device);
    }

    deviceRef.current = device;
    readerRef.current = reader;
    setIsConnected(true);

    const poll = async () => {
      if (!readerRef.current) return;
      try {
        const uid = await readerRef.current.pollFelica();
        if (uid) {
          for (const cb of subscribersRef.current) {
            cb(uid);
          }
        }
      } catch (e) {
        console.error("ポーリングエラー:", e);
      }
      if (readerRef.current) {
        pollingRef.current = window.setTimeout(poll, pollingInterval);
      }
    };

    poll();
  }, [pollingInterval]);

  // ペアリング済みデバイスへの自動再接続
  useEffect(() => {
    if (!isSupported || readerRef.current) return;
    (async () => {
      try {
        const devices = await navigator.usb.getDevices();
        const pasori = devices.find(
          (d) => d.vendorId === SONY_VENDOR_ID && d.productId in PASORI_PRODUCTS
        );
        if (pasori) {
          console.log("[NFC] ペアリング済みデバイスを検出、自動接続中...");
          await initDevice(pasori);
        }
      } catch (e) {
        console.warn("[NFC] 自動接続失敗:", e);
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("Unable to claim interface")) {
          setError("デバイスのインターフェースを確保できません。Windowsの場合、Zadig (zadig.akeo.ie) でドライバーを WinUSB に置換してください。");
        }
      }
    })();
  }, [isSupported, initDevice]);

  const connect = useCallback(async () => {
    if (!isSupported) {
      setError("このブラウザは WebUSB に対応していません（Chrome を使用してください）");
      return;
    }

    if (readerRef.current) return;

    try {
      setError(null);

      const filters = Object.keys(PASORI_PRODUCTS).map((pid) => ({
        vendorId: SONY_VENDOR_ID,
        productId: Number(pid),
      }));

      const device = await navigator.usb.requestDevice({ filters });
      await initDevice(device);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "接続に失敗しました";
      if (msg.includes("No device selected")) {
        setError("デバイスが選択されませんでした");
      } else if (msg.includes("Unable to claim interface")) {
        setError("デバイスのインターフェースを確保できません。Windowsの場合、Zadig (zadig.akeo.ie) でドライバーを WinUSB に置換してください。");
      } else {
        setError(msg);
      }
    }
  }, [isSupported, initDevice]);

  const disconnect = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    readerRef.current = null;
    if (deviceRef.current) {
      deviceRef.current.close().catch(() => {});
      deviceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const value = useMemo<NfcContextValue>(() => (
    { isSupported, isConnected, error, connect, disconnect, subscribe }
  ), [isSupported, isConnected, error, connect, disconnect, subscribe]);

  return <NfcContext.Provider value={value}>{children}</NfcContext.Provider>;
}

export function useNfc() {
  const ctx = useContext(NfcContext);
  if (!ctx) throw new Error("useNfc must be used within NfcProvider");
  return ctx;
}
