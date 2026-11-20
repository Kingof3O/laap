import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Game } from '../lib/types'

export const ACTIVE_GAME_STORAGE_KEY = 'laap:active-game'

export interface GameContextValue {
  activeGame: Game
  setActiveGame: (game: Game) => void
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [activeGame, setActiveGameState] = useState<Game>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_GAME_STORAGE_KEY)
      if (stored === 'league' || stored === 'valorant') {
        return stored
      }
    } catch {
      // localStorage may not be available in non-browser envs
    }
    return 'league'
  })

  const setActiveGame = (game: Game) => {
    setActiveGameState(game)
    try {
      localStorage.setItem(ACTIVE_GAME_STORAGE_KEY, game)
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('laap:game-change', { detail: { game } }))
  }

  useEffect(() => {
    const handleGameChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ game?: Game }>
      const g = customEvent.detail?.game
      if (g === 'league' || g === 'valorant') {
        setActiveGameState((prev) => (prev !== g ? g : prev))
      }
    }
    window.addEventListener('laap:game-change', handleGameChange)
    return () => window.removeEventListener('laap:game-change', handleGameChange)
  }, [])

  return (
    <GameContext.Provider value={{ activeGame, setActiveGame }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
