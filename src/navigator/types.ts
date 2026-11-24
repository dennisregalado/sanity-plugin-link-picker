import React from 'react'
import {type QueryParams} from 'sanity'

import {type DocumentBrowseSort} from '../search'

export type RenderLinkIcon = React.ElementType

export type SearchResultItem =
  | {
      type: 'document'
      document: SearchDocument
    }
  | {
      type: 'link' | 'route'
      label?: string
      title?: string
      href: string
      icon?: React.ElementType
    }

export type SearchDocument = {
  _id: string
  _type: string
  _originalId?: string
  label?: string
  title?: string
  /** Section anchors: the anchor's slug */
  slug?: string
  /** Section anchors: the section object on its page, and where it lives */
  section?: unknown
  parentType?: string
  sectionsField?: string
}

/** An item chosen in a picker navigator. */
export type NavigatorSelection = {
  label?: string
  href?: string
  reference?: string
  _type?: string
  _id?: string
}

/** Props shared by the link and anchor navigators. */
export type BaseNavigatorProps = {
  onSelect?: (item: NavigatorSelection) => void
  onClose?: () => void
  searchQuery?: string
  /** Key of the option highlighted with the keyboard */
  activeOption?: string | null
  /** Prefix for option element ids, referenced by the input's aria-activedescendant */
  optionIdPrefix?: string
  /** Called when the visible options change because a folder was opened or closed */
  onNavigate?: () => void
}

export type MenuItem = {
  label?: string // Display name in UI
  href?: string // Navigation URL for 'page' type items
  type?: string // 'page' | 'folder' | 'group'
  icon?: React.ElementType // Native icon component, or a wrapper for emoji/elements
  children?: MenuItem[] // Nested items for 'group' type
  omitLabelOnSelect?: boolean
  documentType?: string
  filter?: string
  filterParams?: QueryParams
  /** How a document folder is sorted. Defaults to newest first. */
  sort?: DocumentBrowseSort
  /** Fields fetched per document in a document folder */
  projection?: string
}
