/**
 * Theme Context for MedChat
 * 
 * Manages app theme and styling
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../config';

// Theme Context
const ThemeContext = createContext(null);

// Light theme
const lightTheme = {
  mode: 'light',
  colors: {
    primary: config.colors.primary,
    primaryDark: config.colors.primaryDark,
    primaryLight: config.colors.primaryLight,
    secondary: config.colors.secondary,
    success: config.colors.success,
    warning: config.colors.warning,
    error: config.colors.error,
    background: config.colors.background,
    surface: config.colors.surface,
    text: config.colors.text,
    textSecondary: config.colors.textSecondary,
    border: config.colors.border,
    doctor: config.colors.doctor,
    patient: config.colors.patient,
    white: '#FFFFFF',
    black: '#000000'
  },
  styles: {
    container: {
      flex: 1,
      backgroundColor: config.colors.background
    },
    card: {
      backgroundColor: config.colors.surface,
      borderRadius: 12,
      padding: 16,
      margin: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2
    },
    button: {
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center'
    },
    buttonPrimary: {
      backgroundColor: config.colors.primary
    },
    buttonSecondary: {
      backgroundColor: config.colors.secondary
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600'
    },
    input: {
      backgroundColor: config.colors.surface,
      borderWidth: 1,
      borderColor: config.colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: config.colors.text
    },
    text: {
      color: config.colors.text,
      fontSize: 16
    },
    textSecondary: {
      color: config.colors.textSecondary,
      fontSize: 14
    },
    header: {
      fontSize: 20,
      fontWeight: 'bold',
      color: config.colors.text
    },
    subtitle: {
      fontSize: 16,
      color: config.colors.textSecondary
    }
  }
};

// Dark theme
const darkTheme = {
  mode: 'dark',
  colors: {
    primary: '#3b82f6',
    primaryDark: '#2563eb',
    primaryLight: '#60a5fa',
    secondary: '#8b5cf6',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    background: '#1f2937',
    surface: '#111827',
    text: '#f9fafb',
    textSecondary: '#9ca3af',
    border: '#374151',
    doctor: '#3b82f6',
    patient: '#10b981',
    white: '#000000',
    black: '#FFFFFF'
  },
  styles: {
    container: {
      flex: 1,
      backgroundColor: '#1f2937'
    },
    card: {
      backgroundColor: '#111827',
      borderRadius: 12,
      padding: 16,
      margin: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: 1,
      borderColor: '#374151'
    },
    button: {
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center'
    },
    buttonPrimary: {
      backgroundColor: '#3b82f6'
    },
    buttonSecondary: {
      backgroundColor: '#8b5cf6'
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600'
    },
    input: {
      backgroundColor: '#111827',
      borderWidth: 1,
      borderColor: '#374151',
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: '#f9fafb'
    },
    text: {
      color: '#f9fafb',
      fontSize: 16
    },
    textSecondary: {
      color: '#9ca3af',
      fontSize: 14
    },
    header: {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#f9fafb'
    },
    subtitle: {
      fontSize: 16,
      color: '#9ca3af'
    }
  }
};

// Theme Provider Component
export const ThemeProvider = ({ children }) => {
  const colorScheme = useColorScheme();
  const [theme, setTheme] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize theme
  useEffect(() => {
    const initialize = async () => {
      try {
        // Check saved theme preference
        const savedTheme = await AsyncStorage.getItem('@medchat_theme');
        
        let initialTheme;
        if (savedTheme) {
          initialTheme = savedTheme === 'dark' ? darkTheme : lightTheme;
        } else {
          // Use system preference
          initialTheme = colorScheme === 'dark' ? darkTheme : lightTheme;
        }
        
        setTheme(initialTheme);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize theme:', err);
        setTheme(colorScheme === 'dark' ? darkTheme : lightTheme);
        setIsLoading(false);
      }
    };
    
    initialize();
  }, [colorScheme]);

  // Toggle theme
  const toggleTheme = useCallback(async () => {
    try {
      const newTheme = theme.mode === 'light' ? darkTheme : lightTheme;
      
      // Save preference
      await AsyncStorage.setItem('@medchat_theme', newTheme.mode);
      
      setTheme(newTheme);
    } catch (err) {
      console.error('Failed to toggle theme:', err);
    }
  }, [theme]);

  // Set theme
  const setThemeMode = useCallback(async (mode) => {
    try {
      const newTheme = mode === 'dark' ? darkTheme : lightTheme;
      
      // Save preference
      await AsyncStorage.setItem('@medchat_theme', mode);
      
      setTheme(newTheme);
    } catch (err) {
      console.error('Failed to set theme:', err);
    }
  }, []);

  // Get current theme
  const getTheme = useCallback(() => {
    return theme || (colorScheme === 'dark' ? darkTheme : lightTheme);
  }, [theme, colorScheme]);

  // Context value
  const contextValue = {
    // State
    theme: getTheme(),
    isLoading,
    mode: theme?.mode || colorScheme || 'light',
    
    // Actions
    toggleTheme,
    setThemeMode,
    getTheme,
    
    // Themes
    lightTheme,
    darkTheme
  };

  if (isLoading) {
    // Return null or loading indicator
    return null;
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Custom hook to use Theme context
export const useTheme = () => {
  const context = useContext(ThemeContext);
  
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  
  return context;
};

// Export themes
export { lightTheme, darkTheme };
