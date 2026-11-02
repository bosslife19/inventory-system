import { Eye, EyeOff, Lock, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/** An input with a leading icon. Sits inside Field, which passes id and aria props through to the input. */
export function IconInput({ icon: Icon, ...props }: InputProps & { icon: LucideIcon }) {
  return (
    <span className="auth-input">
      <Icon size={17} aria-hidden />
      <input {...props} />
    </span>
  )
}

/** A password input with a show/hide button. */
export function PasswordInput(props: InputProps) {
  const [shown, setShown] = useState(false)
  const Toggle = shown ? EyeOff : Eye

  return (
    <span className="auth-input">
      <Lock size={17} aria-hidden />
      <input {...props} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="auth-input-toggle"
        aria-label={shown ? 'Hide password' : 'Show password'}
        onClick={() => setShown(!shown)}
      >
        <Toggle size={17} aria-hidden />
      </button>
    </span>
  )
}
