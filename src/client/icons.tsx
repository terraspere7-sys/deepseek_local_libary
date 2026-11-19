/**
 * Glyphs this plugin draws itself, for the seats whose built-in fallback does
 * not describe them.
 * @module cyberself/client/icons
 */
import type { ReactElement } from 'react'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** The navigation glyph of one settings section, matched by section id. */
    'settings.section.icon': {
      kind: 'list'
      scope: 'root'
      owner: SectionIconProps
    }
  }
}

/** Props the settings navigation hands to a section glyph. */
export interface SectionIconProps {
  /** Edge length in pixels. */
  size?: number
  /** Whether the section is the open one. */
  active?: boolean
}

/**
 * An open book, drawn in the same 16px outline style as the built-in icons.
 * @param props - edge length handed over by the owner.
 * @returns the glyph.
 */
export function BookIcon(props: SectionIconProps): ReactElement {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M2.5 4.15C4.4 3.25 6.4 3.35 8 4.55C9.6 3.35 11.6 3.25 13.5 4.15V12C11.6 11.1 9.6 11.2 8 12.4C6.4 11.2 4.4 11.1 2.5 12V4.15Z"
        stroke="currentColor"
      />
      <path d="M8 4.55V12.4" stroke="currentColor" />
    </svg>
  )
}
