import { useState } from 'react'

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL?.trim() || 'http://127.0.0.1:8000'
).replace(/\/+$/, '')

const statusLabels = {
  idle: '확인 전',
  loading: '확인 중',
  success: '연결 성공',
  error: '연결 실패',
}

export default function App() {
  const [connection, setConnection] = useState({
    status: 'idle',
    message: '버튼을 눌러 서버 연결 상태를 확인해 주세요.',
    response: null,
  })

  async function checkConnection() {
    setConnection({
      status: 'loading',
      message: '서버 응답을 기다리고 있습니다.',
      response: null,
    })

    try {
      const response = await fetch(`${apiBaseUrl}/api/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        setConnection({
          status: 'error',
          message: `서버가 오류를 반환했습니다. (HTTP ${response.status}) 다시 시도해 주세요.`,
          response: null,
        })
        return
      }

      const data = await response.json()
      if (data?.status !== 'ok') {
        setConnection({
          status: 'error',
          message: '서버 응답이 예상한 형식과 다릅니다. 서버 설정을 확인해 주세요.',
          response: null,
        })
        return
      }

      setConnection({
        status: 'success',
        message: '서버에 정상적으로 연결되었습니다.',
        response: data,
      })
    } catch (error) {
      let message = '서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인한 뒤 다시 시도해 주세요.'
      if (error.name === 'TimeoutError') {
        message = '5초 안에 서버 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.'
      } else if (error instanceof SyntaxError) {
        message = '서버 응답을 읽을 수 없습니다. 서버 설정을 확인해 주세요.'
      }
      setConnection({ status: 'error', message, response: null })
    }
  }

  const isLoading = connection.status === 'loading'

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-12 text-slate-900">
      <section aria-labelledby="page-title" className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <h1 id="page-title" className="text-4xl font-black tracking-tight sm:text-5xl">EXCUSE ME!</h1>
        <p className="mt-4 leading-relaxed text-slate-600">서버 연결을 확인해 보세요.</p>

        <button
          type="button"
          onClick={checkConnection}
          disabled={isLoading}
          className="mt-8 w-full cursor-pointer rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
        >
          {isLoading ? '연결 확인 중…' : '서버 연결 확인'}
        </button>

        <div role="status" aria-live="polite" aria-atomic="true" className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className={`font-semibold ${connection.status === 'error' ? 'text-red-700' : connection.status === 'success' ? 'text-emerald-700' : 'text-slate-700'}`}>
            {statusLabels[connection.status]}
          </p>
          <p className="mt-2 break-words text-sm leading-relaxed text-slate-600">{connection.message}</p>
          {connection.response && (
            <pre className="mt-4 overflow-x-auto rounded-md bg-slate-900 p-4 text-sm text-emerald-300">
              <code>{JSON.stringify(connection.response)}</code>
            </pre>
          )}
        </div>
      </section>
    </main>
  )
}
