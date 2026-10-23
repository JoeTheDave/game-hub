/**
 * Shell for every phone-facing screen (join + controllers). Pinned to the viewport so the
 * page can never be scrolled, panned or rubber-banded off-screen; respects notches.
 */
export const PHONE_SCREEN_CLASS =
  'fixed inset-0 overflow-hidden overscroll-none touch-manipulation select-none flex flex-col ' +
  'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 ' +
  'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
