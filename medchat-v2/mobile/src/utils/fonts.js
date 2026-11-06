/**
 * MedChat Mobile App - Font Configuration
 * Load and manage custom fonts
 */

import * as Font from 'expo-font';

// Font names
const FONT_NAMES = {
  REGULAR: 'Inter-Regular',
  MEDIUM: 'Inter-Medium',
  SEMIBOLD: 'Inter-SemiBold',
  BOLD: 'Inter-Bold',
  LIGHT: 'Inter-Light',
};

// Font files mapping
const FONT_FILES = {
  [FONT_NAMES.REGULAR]: require('../../assets/fonts/Inter-Regular.ttf'),
  [FONT_NAMES.MEDIUM]: require('../../assets/fonts/Inter-Medium.ttf'),
  [FONT_NAMES.SEMIBOLD]: require('../../assets/fonts/Inter-SemiBold.ttf'),
  [FONT_NAMES.BOLD]: require('../../assets/fonts/Inter-Bold.ttf'),
  [FONT_NAMES.LIGHT]: require('../../assets/fonts/Inter-Light.ttf'),
};

// Load all fonts
const loadFonts = async () => {
  await Font.loadAsync({
    [FONT_NAMES.REGULAR]: FONT_FILES[FONT_NAMES.REGULAR],
    [FONT_NAMES.MEDIUM]: FONT_FILES[FONT_NAMES.MEDIUM],
    [FONT_NAMES.SEMIBOLD]: FONT_FILES[FONT_NAMES.SEMIBOLD],
    [FONT_NAMES.BOLD]: FONT_FILES[FONT_NAMES.BOLD],
    [FONT_NAMES.LIGHT]: FONT_FILES[FONT_NAMES.LIGHT],
  });
};

// Font family getter
const getFontFamily = (weight = 'regular') => {
  const weightMap = {
    light: FONT_NAMES.LIGHT,
    regular: FONT_NAMES.REGULAR,
    medium: FONT_NAMES.MEDIUM,
    semibold: FONT_NAMES.SEMIBOLD,
    bold: FONT_NAMES.BOLD,
  };
  return weightMap[weight.toLowerCase()] || FONT_NAMES.REGULAR;
};

// Check if font is loaded
const isFontLoaded = async (fontName) => {
  try {
    await Font.loadAsync({ [fontName]: FONT_FILES[fontName] });
    return true;
  } catch (error) {
    return false;
  }
};

// Export font utilities
module.exports = {
  FONT_NAMES,
  FONT_FILES,
  loadFonts,
  getFontFamily,
  isFontLoaded,
};
