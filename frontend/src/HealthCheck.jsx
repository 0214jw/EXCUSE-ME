import { useRef, useState } from 'react'

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL?.trim() || 'http://127.0.0.1:8000'
).replace(/\/+$/, '')

const statusLabels = {
  idle: '확인 전',
  loading: '확인 중',
  success: '연결 성공',
  error: '연결 실패',
}

export default function HealthCheck() {
  const busy = useRef(false)
  const [connection, setConnection] = useState({
    status: 'idle',
    message: '버튼을 눌러 서버 연결 상태를 확인해 주세요.',
    response: null,
  })

  async function checkConnection() {
    if (busy.current) return
    busy.current = true
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
          message: '서버 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          response: null,
        })
        return
      }

      const data = await response.json()
      if (data?.status !== 'ok') {
        setConnection({
          status: 'error',
          message: '서버 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
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
      let message = '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      if (error.name === 'TimeoutError') {
        message = '5초 안에 서버 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.'
      } else if (error instanceof SyntaxError) {
        message = '서버 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      }
      setConnection({ status: 'error', message, response: null })
    } finally { busy.current = false }
  }

  const isLoading = connection.status === 'loading'

  return (
    <main id="main-content" className="health-page page-width">
      <section aria-labelledby="page-title" className="health-panel">
        <p className="eyebrow">MUSEUM / CONNECTION</p>
        <h1 id="page-title" className="section-title">서버 연결 확인</h1>
        <p className="mt-4 leading-relaxed">전시실 연결이 원활한지 확인해 보세요.</p>

        <button
          type="button"
          onClick={checkConnection}
          disabled={isLoading}
          aria-busy={isLoading}
          className="museum-button primary mt-8 disabled:cursor-wait disabled:opacity-60"
        >
          {isLoading ? '연결 확인 중…' : '서버 연결 확인'}
        </button>

        <div role="status" aria-live="polite" aria-atomic="true" className="connection-result mt-6">
          <p className={`font-semibold ${connection.status === 'error' ? 'text-red-700' : connection.status === 'success' ? 'text-emerald-700' : 'text-slate-700'}`}>
            {statusLabels[connection.status]}
          </p>
          <p className="mt-2 break-words text-sm leading-relaxed text-slate-600">{connection.message}</p>
        </div>
      </section>
    </main>
  )
}
