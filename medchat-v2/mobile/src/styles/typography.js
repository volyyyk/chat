/**
 * MedChat Mobile App - Typography
 * Font styles and text definitions
 */

import { getFontFamily } from '../utils/fonts';

// Font weights
const fontWeights = {
  light: getFontFamily('light'),
  regular: getFontFamily('regular'),
  medium: getFontFamily('medium'),
  semibold: getFontFamily('semibold'),
  bold: getFontFamily('bold'),
};

// Font sizes
const fontSizes = {
  xs: 10,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  '5xl': 32,
  '6xl': 36,
  '7xl': 40,
  '8xl': 48,
  '9xl': 56,
};

// Line heights
const lineHeights = {
  none: 1,
  tight: 1.1,
  snug: 1.25,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
};

// Letter spacing
const letterSpacing = {
  tighter: -0.05,
  tight: -0.025,
  normal: 0,
  wide: 0.025,
  wider: 0.05,
  widest: 0.1,
};

// Text styles
const textStyles = {
  // Headings
  h1: {
    fontFamily: fontWeights.bold,
    fontSize: fontSizes['5xl'],
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacing.tight,
  },
  
  h2: {
    fontFamily: fontWeights.bold,
    fontSize: fontSizes['4xl'],
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacing.tight,
  },
  
  h3: {
    fontFamily: fontWeights.semibold,
    fontSize: fontSizes['3xl'],
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.normal,
  },
  
  h4: {
    fontFamily: fontWeights.semibold,
    fontSize: fontSizes['2xl'],
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.normal,
  },
  
  h5: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.xl,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  
  h6: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.lg,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  
  // Body text
  body: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  
  bodySmall: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.relaxed,
    letterSpacing: letterSpacing.normal,
  },
  
  bodyLarge: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.lg,
    lineHeight: lineHeights.relaxed,
    letterSpacing: letterSpacing.normal,
  },
  
  // Labels
  label: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.normal,
  },
  
  labelSmall: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.normal,
  },
  
  // Buttons
  button: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.normal,
  },
  
  buttonSmall: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.normal,
  },
  
  buttonLarge: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.lg,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.normal,
  },
  
  // Inputs
  input: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  
  inputSmall: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  
  inputLarge: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.lg,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  
  // Captions
  caption: {
    fontFamily: fontWeights.regular,
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.relaxed,
    letterSpacing: letterSpacing.normal,
  },
  
  // Links
  link: {
    fontFamily: fontWeights.medium,
    fontSize: fontSizes.base,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  
  // Chat-specific typography
  chat: {
    // Message text
    message: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.base,
      lineHeight: lineHeights.relaxed,
      letterSpacing: letterSpacing.normal,
    },
    
    messageSmall: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.relaxed,
      letterSpacing: letterSpacing.normal,
    },
    
    // Message time
    messageTime: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.xs,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
    
    // Chat header
    chatHeader: {
      fontFamily: fontWeights.semibold,
      fontSize: fontSizes.lg,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
    
    // Chat subheader
    chatSubheader: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
    
    // Convenient time text
    convenientTime: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.normal,
      letterSpacing: letterSpacing.normal,
    },
    
    // Input bar
    inputBar: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.base,
      lineHeight: lineHeights.normal,
      letterSpacing: letterSpacing.normal,
    },
    
    // File info
    fileInfo: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
    
    // Unread count
    unreadCount: {
      fontFamily: fontWeights.medium,
      fontSize: fontSizes.xs,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
  },
  
  // Form-specific typography
  form: {
    title: {
      fontFamily: fontWeights.semibold,
      fontSize: fontSizes['2xl'],
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
    
    subtitle: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.base,
      lineHeight: lineHeights.normal,
      letterSpacing: letterSpacing.normal,
    },
    
    label: {
      fontFamily: fontWeights.medium,
      fontSize: fontSizes.base,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
    
    error: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
    
    helper: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
  },
  
  // Navigation typography
  navigation: {
    title: {
      fontFamily: fontWeights.semibold,
      fontSize: fontSizes.xl,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
    
    tabLabel: {
      fontFamily: fontWeights.medium,
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
  },
  
  // Card typography
  card: {
    title: {
      fontFamily: fontWeights.semibold,
      fontSize: fontSizes.lg,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
    
    subtitle: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.base,
      lineHeight: lineHeights.normal,
      letterSpacing: letterSpacing.normal,
    },
    
    content: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.relaxed,
      letterSpacing: letterSpacing.normal,
    },
  },
  
  // List typography
  list: {
    item: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.base,
      lineHeight: lineHeights.normal,
      letterSpacing: letterSpacing.normal,
    },
    
    itemTitle: {
      fontFamily: fontWeights.medium,
      fontSize: fontSizes.base,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
    
    itemSubtitle: {
      fontFamily: fontWeights.regular,
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.snug,
      letterSpacing: letterSpacing.normal,
    },
  },
};

// Text align
const textAlign = {
  left: 'left',
  right: 'right',
  center: 'center',
  justify: 'justify',
};

// Text transform
const textTransform = {
  none: 'none',
  capitalize: 'capitalize',
  uppercase: 'uppercase',
  lowercase: 'lowercase',
};

// Export all typography
module.exports = {
  fontWeights,
  fontSizes,
  lineHeights,
  letterSpacing,
  textStyles,
  textAlign,
  textTransform,
};
