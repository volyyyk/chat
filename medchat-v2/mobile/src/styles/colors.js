/**
 * MedChat Mobile App - Color Palette
 * Color definitions for the application
 */

// Primary colors
const primary = {
  50: '#eff6ff',
  100: '#dbeafe',
  200: '#bfdbfe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
  800: '#1e40af',
  900: '#1e3a8a',
  950: '#172554',
};

// Secondary colors (teal for healthcare)
const secondary = {
  50: '#f0fdfa',
  100: '#ccfbf1',
  200: '#99f6e4',
  300: '#5eead4',
  400: '#2dd4bf',
  500: '#14b8a6',
  600: '#0d9488',
  700: '#0f766e',
  800: '#115e59',
  900: '#134e4a',
  950: '#042f2e',
};

// Success colors
const success = {
  50: '#f0fdf4',
  100: '#dcfce7',
  200: '#bbf7d0',
  300: '#86efac',
  400: '#4ade80',
  500: '#22c55e',
  600: '#16a34a',
  700: '#15803d',
  800: '#166534',
  900: '#14532d',
};

// Warning colors
const warning = {
  50: '#fffbeb',
  100: '#fef3c7',
  200: '#fde68a',
  300: '#fcd34d',
  400: '#fbbf24',
  500: '#f59e0b',
  600: '#d97706',
  700: '#b45309',
  800: '#92400e',
  900: '#78350f',
};

// Error colors
const error = {
  50: '#fef2f2',
  100: '#fee2e2',
  200: '#fecaca',
  300: '#fca5a5',
  400: '#f87171',
  500: '#ef4444',
  600: '#dc2626',
  700: '#b91c1c',
  800: '#991b1b',
  900: '#7f1d1d',
};

// Neutral colors
const neutral = {
  50: '#fafafa',
  100: '#f4f4f5',
  200: '#e4e4e7',
  300: '#d4d4d8',
  400: '#a1a1aa',
  500: '#71717a',
  600: '#52525b',
  700: '#3f3f46',
  800: '#27272a',
  900: '#18181b',
};

// Gray colors
const gray = {
  50: '#f9fafb',
  100: '#f3f4f6',
  200: '#e5e7eb',
  300: '#d1d5db',
  400: '#9ca3af',
  500: '#6b7280',
  600: '#4b5563',
  700: '#374151',
  800: '#1f2937',
  900: '#111827',
};

// Semantic colors
const semantic = {
  info: primary[500],
  success: success[500],
  warning: warning[500],
  error: error[500],
  
  infoLight: primary[100],
  successLight: success[100],
  warningLight: warning[100],
  errorLight: error[100],
  
  infoDark: primary[700],
  successDark: success[700],
  warningDark: warning[700],
  errorDark: error[700],
};

// Background colors
const background = {
  primary: '#ffffff',
  secondary: '#f8fafc',
  tertiary: '#f1f5f9',
  
  primaryDark: '#1e293b',
  secondaryDark: '#0f172a',
  tertiaryDark: '#020617',
};

// Surface colors
const surface = {
  primary: '#ffffff',
  secondary: '#f8fafc',
  tertiary: '#f1f5f9',
  
  primaryDark: '#1e293b',
  secondaryDark: '#0f172a',
};

// Text colors
const text = {
  primary: '#1e293b',
  secondary: '#64748b',
  tertiary: '#94a3b8',
  
  primaryInverse: '#ffffff',
  secondaryInverse: '#f1f5f9',
  tertiaryInverse: '#cbd5e1',
  
  primaryDark: '#f8fafc',
  secondaryDark: '#cbd5e1',
  tertiaryDark: '#94a3b8',
};

// Border colors
const border = {
  primary: '#e2e8f0',
  secondary: '#cbd5e1',
  tertiary: '#94a3b8',
  
  primaryDark: '#334155',
  secondaryDark: '#475569',
};

// Overlay colors
const overlay = {
  light: 'rgba(0, 0, 0, 0.1)',
  medium: 'rgba(0, 0, 0, 0.3)',
  dark: 'rgba(0, 0, 0, 0.5)',
  
  lightInverse: 'rgba(255, 255, 255, 0.1)',
  mediumInverse: 'rgba(255, 255, 255, 0.3)',
  darkInverse: 'rgba(255, 255, 255, 0.5)',
};

// Chat-specific colors
const chat = {
  // Patient message bubble
  patientBubble: primary[500],
  patientBubbleText: text.primaryInverse,
  
  // Doctor message bubble
  doctorBubble: gray[200],
  doctorBubbleText: text.primary,
  
  // System message
  systemBubble: gray[100],
  systemBubbleText: text.secondary,
  
  // Input bar
  inputBackground: surface.secondary,
  inputBorder: border.primary,
  inputText: text.primary,
  inputPlaceholder: text.tertiary,
  
  // Chat list
  chatListItemBackground: surface.primary,
  chatListItemHover: surface.secondary,
  chatListItemActive: primary[50],
  
  // Unread badge
  unreadBadge: error[500],
  unreadBadgeText: text.primaryInverse,
  
  // Typing indicator
  typingIndicator: text.tertiary,
  
  // File upload
  fileUploadBackground: surface.tertiary,
  fileUploadBorder: border.secondary,
  
  // Convenient time overlay
  convenientTimeBackground: overlay.light,
  convenientTimeText: text.secondary,
};

// Button colors
const button = {
  primary: {
    background: primary[600],
    text: text.primaryInverse,
    hover: primary[700],
    active: primary[800],
    disabled: primary[300],
  },
  
  secondary: {
    background: surface.secondary,
    text: text.primary,
    hover: surface.tertiary,
    active: surface.primary,
    disabled: surface.tertiary,
    border: border.primary,
  },
  
  outline: {
    background: 'transparent',
    text: text.primary,
    border: border.primary,
    hover: border.secondary,
    active: border.tertiary,
    disabled: border.tertiary,
  },
  
  ghost: {
    background: 'transparent',
    text: text.primary,
    hover: surface.secondary,
    active: surface.tertiary,
    disabled: text.tertiary,
  },
  
  danger: {
    background: error[500],
    text: text.primaryInverse,
    hover: error[600],
    active: error[700],
    disabled: error[300],
  },
  
  success: {
    background: success[500],
    text: text.primaryInverse,
    hover: success[600],
    active: success[700],
    disabled: success[300],
  },
  
  // Sizes
  small: {
    height: 32,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  
  medium: {
    height: 44,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  
  large: {
    height: 56,
    paddingHorizontal: 24,
    fontSize: 18,
  },
  
  // Radius
  radius: {
    small: 6,
    medium: 8,
    large: 12,
    full: 9999,
  },
};

// Input colors
const input = {
  background: surface.primary,
  border: border.primary,
  text: text.primary,
  placeholder: text.tertiary,
  
  focus: {
    border: primary[500],
    shadow: primary[500],
  },
  
  error: {
    border: error[500],
    text: error[500],
  },
  
  disabled: {
    background: surface.tertiary,
    border: border.tertiary,
    text: text.tertiary,
  },
  
  // Sizes
  small: {
    height: 36,
    fontSize: 14,
  },
  
  medium: {
    height: 44,
    fontSize: 16,
  },
  
  large: {
    height: 52,
    fontSize: 18,
  },
};

// Card colors
const card = {
  background: surface.primary,
  border: border.primary,
  shadow: {
    color: 'rgba(0, 0, 0, 0.1)',
    offset: { width: 0, height: 1 },
    radius: 4,
    elevation: 2,
  },
  
  hover: {
    shadow: {
      color: 'rgba(0, 0, 0, 0.15)',
      offset: { width: 0, height: 2 },
      radius: 8,
      elevation: 4,
    },
  },
};

// Navigation colors
const navigation = {
  background: surface.primary,
  border: border.primary,
  
  active: {
    icon: primary[600],
    text: primary[600],
  },
  
  inactive: {
    icon: text.tertiary,
    text: text.tertiary,
  },
  
  badge: {
    background: error[500],
    text: text.primaryInverse,
  },
};

// Modal colors
const modal = {
  background: surface.primary,
  overlay: overlay.medium,
  
  header: {
    background: surface.secondary,
    border: border.primary,
    text: text.primary,
  },
  
  footer: {
    background: surface.secondary,
    border: border.primary,
  },
};

// Loading colors
const loading = {
  primary: primary[600],
  secondary: text.secondary,
  background: overlay.light,
};

// Theme colors
const lightTheme = {
  name: 'light',
  background: background.primary,
  surface: surface.primary,
  text: text.primary,
  primary: primary[600],
  secondary: secondary[600],
  success: success[500],
  warning: warning[500],
  error: error[500],
};

const darkTheme = {
  name: 'dark',
  background: background.primaryDark,
  surface: surface.primaryDark,
  text: text.primaryDark,
  primary: primary[400],
  secondary: secondary[400],
  success: success[400],
  warning: warning[400],
  error: error[400],
};

// Export all colors
module.exports = {
  primary,
  secondary,
  success,
  warning,
  error,
  neutral,
  gray,
  semantic,
  background,
  surface,
  text,
  border,
  overlay,
  chat,
  button,
  input,
  card,
  navigation,
  modal,
  loading,
  lightTheme,
  darkTheme,
};
