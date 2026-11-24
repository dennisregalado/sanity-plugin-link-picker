import React, {useCallback, useMemo, useState, createContext, useContext} from 'react'

import {VIRTUAL_ROW_ESTIMATE_SIZE} from './constants'
import type {MenuItem, NavigatorSelection} from './types'

/** Element id of a picker option, referenced by the input's aria-activedescendant. */
export function getOptionId(prefix: string, key: string): string {
  return `${prefix}-option-${encodeURIComponent(key)}`
}

/**
 * NAVIGATION CONTEXT SYSTEM
 * =========================
 *
 * Manages the hierarchical navigation state using React Context.
 * Maintains a stack of folders to enable breadcrumb-style navigation.
 *
 * Navigation Flow:
 * - Root: navigationStack is empty, shows main menu
 * - Folder: pushFolder() adds to stack, shows folder contents
 * - Back: popFolder() removes last item, goes up one level
 */
type NavigationContextType = {
  navigationStack: MenuItem[] // Array of navigation history
  pushFolder: (folder: MenuItem) => void // Navigate into a folder
  popFolder: () => void // Go back one level
  onSelect?: (item: NavigatorSelection) => void
  onClose?: () => void
  activeOption: string | null
  optionIdPrefix: string
}

const NavigationContext = createContext<NavigationContextType | null>(null)

/**
 * Props that make a row a selectable picker option: a stable key for keyboard navigation, the id
 * used by aria-activedescendant, and the highlight when it's active.
 */
export function useOptionProps(key: string) {
  const {activeOption, optionIdPrefix} = useNavigation()
  const active = activeOption === key
  return {
    'id': getOptionId(optionIdPrefix, key),
    'role': 'option',
    'aria-selected': active,
    'data-option-key': key,
    'selected': active,
    'style': OPTION_STYLE,
  }
}

/** Keeps options scrolled into view below the pinned header row */
const OPTION_STYLE = {scrollMarginTop: VIRTUAL_ROW_ESTIMATE_SIZE}

export function useNavigation() {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return context
}

export function NavigationProvider({
  children,
  onClose,
  onSelect,
  onNavigate,
  activeOption,
  optionIdPrefix,
}: {
  children: React.ReactNode
  onClose?: () => void
  onNavigate?: () => void
  activeOption: string | null
  optionIdPrefix: string
  onSelect?: (item: NavigatorSelection) => void
}) {
  const [navigationStack, setNavigationStack] = useState<MenuItem[]>([])

  const pushFolder = useCallback(
    (folder: MenuItem) => {
      setNavigationStack((prev) => [...prev, folder])
      onNavigate?.()
    },
    [onNavigate],
  )

  const popFolder = useCallback(() => {
    setNavigationStack((prev) => prev.slice(0, -1))
    onNavigate?.()
  }, [onNavigate])

  const value = useMemo(
    () => ({
      navigationStack,
      pushFolder,
      popFolder,
      onSelect,
      onClose,
      activeOption,
      optionIdPrefix,
    }),
    [activeOption, navigationStack, onClose, onSelect, optionIdPrefix, popFolder, pushFolder],
  )

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}
