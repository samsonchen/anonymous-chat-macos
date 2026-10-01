import { useState } from 'react'
import type { FormEvent } from 'react'
import { NICKNAME_MAX, LS_LAST_NICKNAME } from '../config'
import { checkNickname, charLength } from '../lib/nickname'
import { readLocal, writeLocal } from '../lib/storage'
import { T } from '../text'
import type { ChatBackend } from '../backend/types'
import { Icon } from '../components/Icon'

type ServerError = 'taken' | 'invalid' | 'unavailable' | null

interface Props {
  backend: ChatBackend
  /** 因為斷線太久被送回來時，顯示說明原因的提示。 */
  lostNotice: boolean
  onJoined: (nickname: string) => void
}

export function JoinScreen({ backend, lostNotice, onJoined }: Props) {
  const [value, setValue] = useState(() => readLocal(LS_LAST_NICKNAME) ?? '')
  const [processing, setProcessing] = useState(false)
  const [serverError, setServerError] = useState<ServerError>(null)
  const [notice, setNotice] = useState(lostNotice)

  const check = checkNickname(value)
  const trimmedLength = charLength(value.trim())
  // 空輸入框一開始不吵，其他格式問題即時提示。
  const formatError =
    value === ''
      ? null
      : !check.ok && check.reason === 'too_long'
        ? T.errTooLong
        : !check.ok
          ? T.errBlank
          : null
  const tooLong = !check.ok && check.reason === 'too_long'
  const unavailable = serverError === 'unavailable'
  const message =
    serverError === 'taken' ? T.errTaken : serverError === 'invalid' ? T.errBlank : formatError
  const canSubmit = check.ok && !processing && !unavailable

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!check.ok || processing) return
    setNotice(false)
    setServerError(null)
    setProcessing(true)
    const result = await backend.join(check.nickname)
    setProcessing(false)
    if (result.ok) {
      writeLocal(LS_LAST_NICKNAME, check.nickname)
      onJoined(check.nickname)
    } else {
      setServerError(result.reason)
    }
  }

  const invalid = Boolean(message)

  return (
    <main className="join">
      <div className="join__card">
        <div className="join__head">
          <span className="join__logo" aria-hidden="true">
            <Icon name="chat" size={36} />
          </span>
          <h1>{T.appName}</h1>
          <p>
            {T.joinIntro1}
            <br />
            {T.joinIntro2}
          </p>
        </div>
        <form className="join__form" onSubmit={onSubmit} noValidate>
          {notice && (
            <p className="alertbox alertbox--notice" role="alert">
              <Icon name="info" size={20} />
              <span>{T.noticeLost}</span>
            </p>
          )}
          {unavailable && (
            <p className="alertbox alertbox--danger" role="alert">
              <Icon name="wifioff" size={20} />
              <span>{T.errUnavailable}</span>
            </p>
          )}
          <div className="field">
            <label htmlFor="nickname">{T.nicknameLabel}</label>
            <div className={`field__box${invalid ? ' field__box--error' : ''}${processing || unavailable ? ' field__box--locked' : ''}`}>
              <input
                id="nickname"
                type="text"
                value={value}
                placeholder={T.nicknamePlaceholder}
                disabled={processing || unavailable}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                aria-invalid={invalid}
                aria-describedby="nickname-help nickname-error"
                onChange={(e) => {
                  setValue(e.target.value)
                  setServerError((prev) => (prev === 'unavailable' ? prev : null))
                  setNotice(false)
                }}
              />
              <span className={tooLong ? 'field__count field__count--over' : 'field__count'}>
                {trimmedLength} / {NICKNAME_MAX}
              </span>
            </div>
          </div>
          <div id="nickname-error">
            {message && (
              <p className="alertbox alertbox--inline" role="alert">
                <Icon name="alert" size={20} />
                <span>{message}</span>
              </p>
            )}
          </div>
          <p id="nickname-help" className="join__help">
            {T.nicknameHelp}
          </p>
          <button
            type="submit"
            className={processing ? 'primarybtn primarybtn--busy' : 'primarybtn'}
            disabled={!canSubmit}
            aria-busy={processing}
          >
            {processing ? (
              <>
                <Icon name="spin" size={20} className="spin" />
                {T.entering}
              </>
            ) : (
              T.enter
            )}
          </button>
        </form>
      </div>
    </main>
  )
}
