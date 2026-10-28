import type { GameInstance } from '../types/game'

/**
 * A game's lobby settings as checkboxes, rendered generically from its schema. Editable for the
 * host's lobby page and the admin's phone; read-only for everyone else.
 */
export function GameOptions({
  instance,
  editable,
  onChange,
  tone = 'dark',
}: {
  instance: GameInstance
  editable: boolean
  onChange?: (key: string, value: boolean) => void
  tone?: 'dark' | 'light'
}) {
  const schema = instance.optionsSchema ?? []
  if (schema.length === 0) return null
  const values = instance.options ?? {}
  const text = tone === 'dark' ? 'text-slate-200' : 'text-slate-800'
  return (
    <div className="flex flex-col gap-2">
      <span className={`text-xs font-semibold uppercase tracking-wide ${tone === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Options</span>
      {schema.map((o) => {
        const checked = values[o.key] ?? o.default
        return (
          <label
            key={o.key}
            className={`flex items-center gap-3 text-sm ${text} ${editable ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={!editable}
              onChange={(e) => onChange?.(o.key, e.target.checked)}
              className={`w-5 h-5 accent-amber-500 ${editable ? 'cursor-pointer' : 'cursor-default'}`}
            />
            <span>{o.label}</span>
          </label>
        )
      })}
    </div>
  )
}
