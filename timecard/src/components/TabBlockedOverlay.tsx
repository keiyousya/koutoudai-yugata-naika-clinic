export function TabBlockedOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95">
      <div className="max-w-md mx-4 text-center">
        <div className="mb-6">
          <svg
            className="w-20 h-20 mx-auto text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-4">
          NFCリーダーを使用できません
        </h1>

        <p className="text-slate-300 mb-6 leading-relaxed">
          別のタブでタイムカードが開いているため、
          <br />
          このタブではNFCリーダーを使用できません。
        </p>

        <div className="bg-slate-800 rounded-lg p-4 text-left">
          <p className="text-slate-200 text-sm">
            <span className="text-amber-400 font-semibold">操作方法:</span>
            <br />
            このタブを閉じて、元のタブでタイムカードを操作してください。
          </p>
        </div>

        <p className="mt-6 text-slate-500 text-xs">
          元のタブを閉じた場合は、このページを再読み込みしてください。
        </p>
      </div>
    </div>
  );
}
