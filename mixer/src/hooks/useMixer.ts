import { useEffect, useRef, useState } from "react";
import { MixerEngine, type MixerState } from "@/audio/mixer";

/** MixerEngine を React 状態に橋渡しするフック。 */
export function useMixer() {
  const engineRef = useRef<MixerEngine | null>(null);
  const [state, setState] = useState<MixerState | null>(null);

  if (!engineRef.current) {
    engineRef.current = new MixerEngine(setState);
  }

  // 初期 state を一度反映
  useEffect(() => {
    setState(engineRef.current!.getState());
    return () => engineRef.current?.dispose();
  }, []);

  return { engine: engineRef.current!, state: state ?? engineRef.current!.getState() };
}
