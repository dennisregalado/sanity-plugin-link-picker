import {EarthGlobeIcon} from '@sanity/icons/EarthGlobe'
import {EnvelopeIcon} from '@sanity/icons/Envelope'
import {LinkIcon} from '@sanity/icons/Link'
import {MobileDeviceIcon} from '@sanity/icons/MobileDevice'
import {Text} from '@sanity/ui'
import React from 'react'

import {getSystemLinkType, type SystemLinkType} from '../href'
import {type LinkIconInput} from '../routes'

export const DefaultIcon = () => <Text>✨</Text>

const defaultLinkTypeIcons: Record<SystemLinkType, typeof LinkIcon> = {
  internal: LinkIcon,
  external: EarthGlobeIcon,
  email: EnvelopeIcon,
  phone: MobileDeviceIcon,
}

/** Emoji and element icons, sized like the native icons beside them. */
function NormalizedLinkIcon({children}: {children: React.ReactNode}) {
  return (
    <span
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        height: '1em',
        justifyContent: 'center',
        lineHeight: 1,
        width: '1em',
      }}
    >
      {children}
    </span>
  )
}

const wrappedIcons = new Map<unknown, React.ElementType>()

/**
 * A route's icon as a component. Components (like `@sanity/icons`) are returned as they are, so
 * Studio previews and Sanity UI inputs render them at their native size and alignment. Emoji and
 * elements get a small wrapper component, cached so it keeps its identity across renders.
 */
export function normalizeLinkIcon(icon: LinkIconInput | undefined): React.ElementType | undefined {
  if (!icon) return undefined
  if (typeof icon === 'function' || isReactComponentObject(icon)) return icon as React.ElementType

  const cached = wrappedIcons.get(icon)
  if (cached) return cached
  const node = typeof icon === 'string' ? <Text>{icon}</Text> : (icon as React.ReactNode)
  function LinkIcon() {
    return <NormalizedLinkIcon>{node}</NormalizedLinkIcon>
  }
  wrappedIcons.set(icon, LinkIcon)
  return LinkIcon
}

function isReactComponentObject(icon: unknown): icon is React.ElementType {
  return Boolean(
    icon && typeof icon === 'object' && '$$typeof' in icon && !React.isValidElement(icon),
  )
}

/** The native `@sanity/icons` icon for a link's type: link, globe, envelope or phone. */
export function getSystemLinkIcon(href: string): React.ElementType {
  return defaultLinkTypeIcons[getSystemLinkType(href)]
}
