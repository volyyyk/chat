/**
 * MedChat Mobile App - Spacing
 * Margin, padding, and gap definitions
 */

// Base spacing unit (4px)
const base = 4;

// Spacing scale
const spacing = {
  0: 0,
  px: 1,
  0.5: base * 0.5,
  1: base * 1,
  1.5: base * 1.5,
  2: base * 2,
  2.5: base * 2.5,
  3: base * 3,
  3.5: base * 3.5,
  4: base * 4,
  5: base * 5,
  6: base * 6,
  7: base * 7,
  8: base * 8,
  9: base * 9,
  10: base * 10,
  11: base * 11,
  12: base * 12,
  14: base * 14,
  16: base * 16,
  20: base * 20,
  24: base * 24,
  28: base * 28,
  32: base * 32,
  36: base * 36,
  40: base * 40,
  44: base * 44,
  48: base * 48,
  52: base * 52,
  56: base * 56,
  60: base * 60,
  64: base * 64,
  72: base * 72,
  80: base * 80,
  96: base * 96,
  100: base * 100,
};

// Margin utilities
const margin = {
  ...spacing,
  auto: 'auto',
};

// Padding utilities
const padding = {
  ...spacing,
};

// Gap utilities
const gap = {
  ...spacing,
};

// Negative spacing
const negativeSpacing = {
  '-0.5': -base * 0.5,
  '-1': -base * 1,
  '-1.5': -base * 1.5,
  '-2': -base * 2,
  '-2.5': -base * 2.5,
  '-3': -base * 3,
  '-3.5': -base * 3.5,
  '-4': -base * 4,
  '-5': -base * 5,
  '-6': -base * 6,
};

// Directional spacing
const directionalSpacing = {
  top: spacing,
  right: spacing,
  bottom: spacing,
  left: spacing,
  horizontal: spacing,
  vertical: spacing,
};

// Chat-specific spacing
const chatSpacing = {
  // Chat list
  chatList: {
    item: {
      paddingVertical: spacing[2],
      paddingHorizontal: spacing[4],
      marginVertical: spacing[1],
      marginHorizontal: spacing[4],
    },
    separator: spacing[1],
  },
  
  // Chat screen
  chatScreen: {
    header: {
      paddingVertical: spacing[3],
      paddingHorizontal: spacing[4],
    },
    messages: {
      paddingVertical: spacing[2],
      paddingHorizontal: spacing[4],
    },
    inputBar: {
      paddingVertical: spacing[2],
      paddingHorizontal: spacing[4],
      paddingBottom: spacing[4], // Extra padding for keyboard
    },
  },
  
  // Message bubble
  messageBubble: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    marginVertical: spacing[1],
    marginHorizontal: spacing[2],
    maxWidth: '80%',
  },
  
  // Message time
  messageTime: {
    marginTop: spacing[1],
    marginLeft: spacing[2],
  },
  
  // Convenient time overlay
  convenientTime: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    marginVertical: spacing[1],
    borderRadius: spacing[2],
  },
  
  // Input bar
  inputBar: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: spacing[2],
    minHeight: spacing[10],
  },
  
  // Emoji button
  emojiButton: {
    padding: spacing[2],
    marginRight: spacing[2],
  },
  
  // Send button
  sendButton: {
    padding: spacing[2],
    marginLeft: spacing[2],
  },
};

// Form-specific spacing
const formSpacing = {
  form: {
    padding: spacing[4],
  },
  
  field: {
    marginBottom: spacing[4],
  },
  
  label: {
    marginBottom: spacing[1],
  },
  
  input: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  
  error: {
    marginTop: spacing[1],
  },
  
  helper: {
    marginTop: spacing[1],
  },
  
  button: {
    marginTop: spacing[4],
  },
  
  buttonGroup: {
    gap: spacing[3],
  },
};

// Button spacing
const buttonSpacing = {
  padding: {
    small: {
      vertical: spacing[1.5],
      horizontal: spacing[3],
    },
    medium: {
      vertical: spacing[2],
      horizontal: spacing[4],
    },
    large: {
      vertical: spacing[2.5],
      horizontal: spacing[6],
    },
  },
  
  margin: {
    small: spacing[1],
    medium: spacing[2],
    large: spacing[3],
  },
  
  gap: {
    small: spacing[2],
    medium: spacing[3],
    large: spacing[4],
  },
};

// Card spacing
const cardSpacing = {
  padding: {
    small: spacing[3],
    medium: spacing[4],
    large: spacing[6],
  },
  
  margin: {
    small: spacing[2],
    medium: spacing[3],
    large: spacing[4],
  },
  
  gap: {
    small: spacing[2],
    medium: spacing[3],
    large: spacing[4],
  },
};

// List spacing
const listSpacing = {
  item: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  
  separator: {
    height: spacing[0.5],
    marginLeft: spacing[4],
  },
  
  section: {
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  
  sectionHeader: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
};

// Navigation spacing
const navigationSpacing = {
  header: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  
  tabBar: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  
  tabItem: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  
  drawer: {
    width: 280,
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  
  drawerItem: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
};

// Modal spacing
const modalSpacing = {
  padding: {
    small: spacing[4],
    medium: spacing[6],
    large: spacing[8],
  },
  
  margin: {
    horizontal: spacing[4],
    vertical: spacing[20], // Center on screen
  },
  
  header: {
    paddingBottom: spacing[3],
  },
  
  body: {
    paddingVertical: spacing[2],
  },
  
  footer: {
    paddingTop: spacing[3],
    gap: spacing[3],
  },
};

// Screen spacing
const screenSpacing = {
  padding: {
    small: spacing[2],
    medium: spacing[4],
    large: spacing[6],
  },
  
  margin: {
    top: spacing[4],
    bottom: spacing[4],
  },
  
  safeArea: {
    top: spacing[6], // Status bar height
    bottom: spacing[6], // Bottom navigation height
  },
};

// Export all spacing
module.exports = {
  base,
  spacing,
  margin,
  padding,
  gap,
  negativeSpacing,
  directionalSpacing,
  chatSpacing,
  formSpacing,
  buttonSpacing,
  cardSpacing,
  listSpacing,
  navigationSpacing,
  modalSpacing,
  screenSpacing,
};
