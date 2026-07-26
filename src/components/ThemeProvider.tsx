import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useSettings } from '../hooks/useSettings';

interface ThemeContextValue {
  theme: 'light' | 'dark';
  isOnXDomain: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  isOnXDomain: false,
});

/**
 * Hook to access theme context
 */
export function useThemeContext() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Theme provider that applies dark mode class to root element
 * Follows user preference or auto-detects from X.com
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const { theme: detectedTheme, isOnXDomain } = useTheme();
  const { settings } = useSettings();

  // Determine effective theme based on user preference
  const effectiveTheme: 'light' | 'dark' =
    settings.theme === 'auto' ? detectedTheme : settings.theme;

  // Apply dark mode class to document root
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [effectiveTheme]);

  return (
    <ThemeContext.Provider value={{ theme: effectiveTheme, isOnXDomain }}>
      {children}
    </ThemeContext.Provider>
  );
}
